import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Loader2, Wand2, Mic, Subtitles, CheckCircle2, Download, AlertCircle, Film, Languages, FolderOpen } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL_PROVIDER } from "../config";
import { recordUsageLog } from "../services/history";

const AUDIO_MODES = [
  {
    value: "dub",
    label: "Lồng tiếng AI",
    description: "Thay thế tiếng gốc bằng giọng đọc tiếng Việt do AI tạo.",
    icon: Wand2,
  },
  {
    value: "original",
    label: "Giữ tiếng gốc",
    description: "Giữ nguyên âm thanh gốc của video, không chỉnh sửa.",
    icon: Mic,
  },
  {
    value: "mute",
    label: "Video câm",
    description: "Loại bỏ hoàn toàn tiếng gốc, chỉ giữ phụ đề tiếng Việt.",
    icon: Film,
  },
  {
    value: "mix",
    label: "Trộn âm thanh gốc & AI",
    description: "Hạ âm lượng gốc còn 30%, lồng tiếng AI phía trên.",
    icon: Subtitles,
  },
];

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;

const isElectron = !!window.electronAPI;

/** Extract clean URL from pasted text (handles Douyin/TikTok share format). */
function extractUrl(raw) {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/https?:\/\/\S+/);
  if (match) return match[0].replace(/\/+$/, "");
  return null;
}

/** Call processing API - HTTP (browser) or Electron IPC (desktop). */
async function callProcessApi(url, audioMode, token) {
  if (isElectron) {
    const taskId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
    const workspace = await window.electronAPI.getWorkspace();
    // Preload exposes the IPC bridge as `runWorker` (channel name
    // `run-video` on the IPC side). Earlier code used a phantom
    // `runVideo` method that does not exist, hence
    // "window.electronAPI.runVideo is not a function" crashes.
    //
    // `backendUrl` is threaded through so the worker hits the same API
    // base URL the renderer logged in against (the Render-hosted
    // production service in this build). Main defaults to
    // DEFAULT_API_BASE_URL when not provided.
    await window.electronAPI.runWorker({
      url,
      audioMode,
      taskId,
      token,
      backendUrl: API_BASE_URL,
    });
    return { taskId, workspace };
  } else {
    const { data } = await axios.post(
      `${API_BASE_URL}/api/v1/videos/process`,
      { url, audioMode },
      { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );
    return data;
  }
}

/** Get video URL for display. */
function getVideoUrl(result, workspace) {
  if (isElectron && workspace) {
    return `file://${workspace}/output/video_hoanthien_${result.taskId}.mp4`;
  }
  return result.videoUrl;
}

/** Get SRT URL for download. */
function getSrtUrl(result, workspace) {
  if (isElectron && workspace) {
    return `file://${workspace}/phude_viet.srt`;
  }
  return result.srtUrl;
}

export default function VideoDashboard() {
  const { token, user, updateCreditBalance } = useAuth();
  const [url, setUrl] = useState("");
  const [audioMode, setAudioMode] = useState("mix");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [progress, setProgress] = useState(0);
  const pollIntervalRef = useRef(null);
  // Tracks the taskId of the latest Electron submission so we can
  // ignore stale `worker:exit` events from a previous run.
  const currentTaskIdRef = useRef(null);
  // Tracks the most recent taskId for which we've already POSTed a
  // usage-log row to the backend. The Electron `worker:exit` listener
  // and the HTTP-polling path can both observe terminal success for
  // the same taskId, and the backend will dedupe on the server side,
  // but skipping the second POST also avoids burning the user's
  // bandwidth on a guaranteed-no-op round-trip.
  const usageLoggedTaskIdRef = useRef(null);

  /**
   * Parse "PROGRESS: 12 %" / "Progress 12%" style lines emitted by
   * the Python worker on stdout. Returns null when no match so the
   * caller can ignore noise. The match is intentionally permissive —
   * if main also broadcasts progress via its own channel, the two
   * sources will simply race and `setProgress` keeps the larger value
   * (see the polling fallback below).
   */
  function parseProgressFromLine(text) {
    if (!text) return null;
    // Common shapes we accept:
    //   "PROGRESS: 12 %"
    //   "Progress 12%"
    //   "[12%] downloading model..."
    const m = text.match(/(\d{1,3})\s*%/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n) || n < 0) return null;
    return Math.min(100, Math.max(0, n));
  }

  const handleUrlChange = (e) => {
    const next = e.target.value;
    // If the URL is being edited while a previous result is still on screen
    // (e.g. user pasted a new link on top of a completed job), wipe the old
    // result so the UI forces a fresh submit. This prevents the user from
    // being confused when the next submit returns the *cached* result for
    // a link they no longer want.
    if (result && next !== url) {
      setResult(null);
      setProgress(0);
      setVideoReady(false);
      setVideoError(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    setUrl(next);
    if (error) setError(null);
  };

  const handleModeChange = (mode) => {
    setAudioMode(mode);
    if (error) setError(null);
    // The cache key is "<url>_<audioMode>", so switching the audio mode
    // changes the request identity. Clear the previous result to avoid
    // showing stale data after the user re-submits.
    if (result && mode !== audioMode) {
      setResult(null);
      setProgress(0);
      setVideoReady(false);
      setVideoError(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const raw = url.trim();
    if (!raw) {
      setError("Vui lòng nhập URL video.");
      return;
    }

    const cleanUrl = extractUrl(raw);
    if (!cleanUrl) {
      setError("Không tìm thấy đường dẫn video hợp lệ trong nội dung bạn dán.");
      return;
    }

    setIsLoading(true);
    setError(null);
    // Seed the result with the submit-time fields so the history-log
    // effect (which fires on COMPLETED / FAILED) has the URL and audio
    // mode to send to /api/v1/usage-logs without an extra round trip.
    // `videoUrl` / `srtUrl` are still filled in later by the polling /
    // IPC exit branches.
    setResult({ status: "PROCESSING", url: cleanUrl, audioMode });
    setVideoReady(false);
    setVideoError(false);

    try {
      // Use Electron IPC if available, otherwise use HTTP API.
      if (isElectron) {
        // Subscribe to lifecycle events BEFORE we kick off the job so
        // a fast-completing worker doesn't race us.
        //
        // We capture the resolved payload inside the listener closure
        // via a holder object — at the moment the worker exits, the
        // `runWorker` promise may not have resolved yet (the listener
        // fires from main FIRST, then main's handler resolves the IPC
        // promise). The holder is filled in either by the listener or
        // by the .then() of runWorker, whichever happens second.
        const resultHolder = { value: null };

        // Track which taskId is "live". Main may send the
        // worker:exit event BEFORE the runWorker IPC promise
        // resolves (events are dispatched at child.on('close'),
        // before main's handler returns). We seed the ref with
        // a placeholder here, then overwrite with the real taskId
        // returned by main; either way, exitTaskId from main matches.
        currentTaskIdRef.current = `pending-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

        const offExit = window.electronAPI.onWorkerExit(({ code, signal, taskId: exitTaskId }) => {
          // Stale events from a previous submit: ignore.
          // We match on taskId once main has assigned one. Until
          // then we let the first event through (it must be ours
          // because we just kicked the worker off).
          const live = currentTaskIdRef.current;
          const isPlaceholder = typeof live === 'string' && live.startsWith('pending-');
          if (!isPlaceholder && live !== exitTaskId) return;

          setIsLoading(false);
          setProgress(100);
          // After main has resolved, resultHolder is populated;
          // before, it's empty — we still have exitTaskId, which
          // is enough to render the file path on success because
          // main also returned it on the IPC resolve. So we use
          // either source.
          const r = resultHolder.value || {};
          // Use the vietcast:// custom protocol instead of file://. Browsers
          // (and Electron's renderer with contextIsolation/sandbox) refuse to
          // render file:// URLs from a renderer for security reasons — that's
          // why the UI was stuck on the "Đang render video…" spinner even
          // though the pipeline completed. The protocol handler in main.js
          // maps vietcast://video/<taskId> → <userData>/bin/output/...mp4.
          const videoUrl = exitTaskId ? `vietcast://video/${exitTaskId}` : (r.videoPath ? `vietcast://video/${r.taskId || ''}` : undefined);
          const srtUrl = exitTaskId ? `vietcast://subtitle/${exitTaskId}` : (r.srtPath ? `vietcast://subtitle/${r.taskId || ''}` : undefined);

          if (code === 0) {
            setResult((prev) => ({
              ...(prev || {}),
              status: 'COMPLETED',
              taskId: exitTaskId ?? prev?.taskId,
              videoUrl: videoUrl ?? prev?.videoUrl,
              srtUrl: srtUrl ?? prev?.srtUrl,
              // Preserve submit-time fields so the audit row carries them.
              url: prev?.url ?? null,
              audioMode: prev?.audioMode ?? null,
            }));
          } else {
            const lastStderr = (r.stderr || '')
              .split('\n').map((s) => s.trim()).filter(Boolean).slice(-1)[0];
            setError(lastStderr || `Quá trình xử lý video thất bại (mã ${code}).`);
            setResult((prev) => ({
              ...(prev || {}),
              status: 'FAILED',
              taskId: exitTaskId,
              // Carry the submit-time URL/audioMode to the FAILED audit row.
              url: prev?.url ?? null,
              audioMode: prev?.audioMode ?? null,
              message: lastStderr || null,
            }));
          }
        });

        // Mirror worker stdout for progress — Python emits
        // "PROGRESS: 12 %" lines and the percent can also surface via
        // `progress` channel.
        const offStdout = window.electronAPI.onWorkerStdout((text) => {
          const pct = parseProgressFromLine(text);
          if (pct != null) setProgress(pct);
        });
        const offProgress = window.electronAPI.onProgress?.((percent) => {
          if (typeof percent === 'number') setProgress(percent);
        });
        const offStderr = window.electronAPI.onWorkerStderr(() => {
          /* captured by main for diagnostics; surfaced only on failure */
        });

        // IPC method is `runWorker` (channel name `run-video`). Main
        // mints its OWN taskId, threads it into `--task-id` argv, and
        // resolves the IPC promise with { taskId, videoPath, srtPath,
        // code, stdout, stderr } once the worker exits. We update
        // `currentTaskIdRef` with the real id so the listener (if it
        // already fired pre-resolve) and a possible re-read stay consistent.
        //
        // `backendUrl` is threaded through so the Python worker hits
        // the same API base URL the renderer logged in against — keeps
        // workers, axios calls and progress polls on the same origin.
        const result = await window.electronAPI.runWorker({
          url: cleanUrl,
          audioMode,
          token,
          backendUrl: API_BASE_URL,
        });
        resultHolder.value = result;
        currentTaskIdRef.current = result.taskId;

        offStdout();
        offStderr();
        offProgress?.();
        offExit();
      } else {
        const { data } = await axios.post(
          `${API_BASE_URL}/api/v1/videos/process`,
          { url: cleanUrl, audioMode },
          { headers: { "Content-Type": "application/json" }, timeout: 30000 }
        );
        // Stash the submitted URL + audioMode on the result so the
        // history-log effect can include them in the audit row even
        // when the server response omits them.
        setResult({ ...data, url: data.url ?? cleanUrl, audioMode: data.audioMode ?? audioMode });
      }
    } catch (err) {
      // Interceptor in src/config.js already translated the axios
      // error into a Vietnamese, user-safe message.
      setError(err?.message || "Không thể kết nối tới máy chủ. Vui lòng thử lại sau.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setUrl("");
    setAudioMode("mix");
    setResult(null);
    setError(null);
    setVideoReady(false);
    setVideoError(false);
    setProgress(0);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Polling: every 2 seconds while a task is PROCESSING, fetch /status/{taskId}
  // and update progress. Cleanup on terminal state (COMPLETED / FAILED) or
  // when the component unmounts.
  useEffect(() => {
    if (!result?.taskId) return;
    if (result.status !== "PROCESSING") return;

    const fetchStatus = async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE_URL}/api/v1/videos/status/${result.taskId}`,
          { timeout: 10000 }
        );
        // Always sync status / URLs / message from the latest server response.
        // CRITICAL: when the server has not yet produced a videoUrl/srtUrl
        // (i.e. status === PROCESSING), the `?? prev.videoUrl` fallback would
        // leak the URL of the *previous* task into the UI. The previous task
        // may have been for a different video, so this manifests as the user
        // seeing "the old video" while the new pipeline is still running.
        // We detect a taskId change here as well: if the polled server entry
        // is for a different taskId, ignore it (shouldn't happen, defensive).
        if (data.taskId && data.taskId !== result.taskId) {
          return;
        }
        setResult((prev) => ({
          ...prev,
          taskId: data.taskId ?? prev.taskId,
          status: data.status,
          // Only adopt URLs from the server response when the server has
          // actually produced them; otherwise reset to null so a previous
          // task's URL does not leak across task boundaries.
          videoUrl: data.videoUrl ?? null,
          srtUrl: data.srtUrl ?? null,
          message: data.message ?? prev.message,
        }));

        const serverProgress = typeof data.progress === "number" ? data.progress : 0;
        if (data.status === "COMPLETED") {
          setProgress(100);
        } else if (data.status === "FAILED") {
          setProgress(0);
        } else {
          // Only ever advance, never jump backwards.
          setProgress((prev) => (serverProgress > prev ? serverProgress : prev));
        }

        if (data.status === "COMPLETED" || data.status === "FAILED") {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (err) {
        // Transient network error: keep the timer running, do not clear progress.
        // Only stop if the server reports a 404 (unknown taskId).
        if (err.response?.status === 404) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setError("Không tìm thấy tác vụ. Có thể server đã khởi động lại.");
        }
      }
    };

    // Run immediately so we don't wait 2s for the first tick.
    fetchStatus();
    pollIntervalRef.current = setInterval(fetchStatus, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [result?.taskId, result?.status]);

  /**
   * Persist a usage-logs row whenever a taskId transitions to a
   * terminal state (COMPLETED / FAILED). One POST per taskId, gated
   * by {@code usageLoggedTaskIdRef} so the Electron {@code worker:exit}
   * path and the HTTP-polling path can both observe the same terminal
   * state without producing duplicate network calls. The backend
   * further dedupes on taskId server-side, so this is purely a
   * bandwidth optimisation for the common case.
   *
   * Note: result.url is set in setResult(...) during submit so both
   * code paths (Electron + HTTP poll) land here with the right URL.
   */
  useEffect(() => {
    if (!result?.taskId) return;
    if (result.status !== "COMPLETED" && result.status !== "FAILED") return;
    if (usageLoggedTaskIdRef.current === result.taskId) return;

    usageLoggedTaskIdRef.current = result.taskId;
    recordUsageLog({
      taskId: result.taskId,
      url: result.url ?? null,
      audioMode: result.audioMode ?? null,
      status: result.status,
      note: result.message ?? null,
    }).catch((err) => console.error("[history] recordUsageLog failed:", err));
  }, [result?.taskId, result?.status, result?.url, result?.audioMode, result?.message]);

  /**
   * Reset the per-taskId dedupe ref when a fresh submit starts so we
   * don't skip the next run's audit row.
   */
  useEffect(() => {
    if (isLoading && usageLoggedTaskIdRef.current) {
      usageLoggedTaskIdRef.current = null;
    }
  }, [isLoading]);

  // Derived flag: hide the submit button whenever a task is being processed.
  const isProcessing = result?.status === "PROCESSING";

  return (
    <div className="min-h-screen w-full flex items-start justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 mb-5">
            <Languages className="w-8 h-8 text-brand-500" strokeWidth={2} />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-br from-white via-slate-200 to-brand-500 bg-clip-text text-transparent">
            VietCast Engine
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto">
            Tự động hóa lồng tiếng Video — tải video từ TikTok / YouTube, dịch phụ đề sang tiếng Việt và lồng tiếng AI chỉ trong vài phút.
          </p>
        </header>

        {/* Form Card */}
        <section className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* URL input */}
            <div>
              <label htmlFor="video-url" className="block text-sm font-medium text-slate-300 mb-2">
                Link video <span className="text-slate-500">(TikTok / YouTube / Douyin)</span>
              </label>
              <input
                id="video-url"
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={handleUrlChange}
                disabled={isLoading}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Audio mode radio group */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Chế độ âm thanh
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {AUDIO_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const checked = audioMode === mode.value;
                  return (
                    <label
                      key={mode.value}
                      className={`relative cursor-pointer rounded-xl border p-4 transition flex items-start gap-3 ${
                        checked
                          ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/40"
                          : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
                      } ${isLoading ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <input
                        type="radio"
                        name="audioMode"
                        value={mode.value}
                        checked={checked}
                        onChange={() => handleModeChange(mode.value)}
                        disabled={isLoading}
                        className="sr-only"
                      />
                      <div
                        className={`shrink-0 mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center ${
                          checked ? "bg-brand-500 text-white" : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-100">{mode.label}</span>
                          <span
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              checked ? "border-brand-500" : "border-slate-600"
                            }`}
                          >
                            {checked && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{mode.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Submit - hidden while a task is being processed. */}
            {!isProcessing && (
              <button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto sm:min-w-[220px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    <span>Bắt đầu xử lý</span>
                  </>
                )}
              </button>
            )}

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200"
              >
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-400" />
                <div className="text-sm leading-relaxed">
                  <div className="font-semibold mb-0.5">Đã xảy ra lỗi</div>
                  {error}
                </div>
              </div>
            )}
          </form>
        </section>

        {/* Result Section */}
        {result && (
          <section className="mt-8 bg-slate-900/60 backdrop-blur-xl border border-emerald-700/40 rounded-2xl shadow-xl shadow-emerald-900/20 p-6 sm:p-8">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-slate-100">Yêu cầu đã được tiếp nhận</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Video đang được xử lý ngầm (Task ID: <span className="font-mono text-emerald-300">{result.taskId}</span>).
                  Vui lòng đợi trong ít phút.
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                Xử lý video khác
              </button>
            </div>

            {/* Progress bar - only shown while the task is PROCESSING. */}
            {isProcessing && (
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>Đang xử lý…</span>
                  <span className="font-mono text-slate-200">{progress}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="bg-gray-200 h-2 w-full rounded-full overflow-hidden"
                >
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Video player with state-driven loading fallback.
                Bug fix: previously this block always rendered the <video>
                element AND a VideoPlaceholder overlay until videoReady was
                set. On Electron, file:// URLs are blocked by web security so
                <video> silently fires onError → videoError → the placeholder
                stayed visible forever, even after the worker reported
                status === 'COMPLETED'. Now we render the video element ONLY
                when we have a usable source URL (vietcast:// for Electron,
                http(s):// for browser), and show a contextual placeholder
                ("Đang render video…" while processing, "Đang hoàn tất file…"
                when the file is being finalized) otherwise. */}
            <div className="rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video relative">
              {result.videoUrl && (isElectron || result.status === "COMPLETED") ? (
                <video
                  controls
                  preload="metadata"
                  // Cache-bust the source URL with a query parameter so
                  // the browser never serves a stale MP4 from its HTTP
                  // cache when the user submits a second request.
                  src={result.videoUrl ? `${result.videoUrl}${result.videoUrl.includes("?") ? "&" : "?"}t=${result.taskId}` : undefined}
                  onLoadedData={() => setVideoReady(true)}
                  onError={() => setVideoError(true)}
                  className={`w-full h-full object-contain ${videoReady ? "block" : "hidden"}`}
                />
              ) : (
                <VideoPlaceholder
                  message={
                    isProcessing
                      ? "Đang render video…"
                      : result.status === "FAILED"
                      ? "Quá trình xử lý thất bại."
                      : "Đang tải video lên máy chủ…"
                  }
                />
              )}
              {/* If the <video> fired onError even with a vietcast:// URL
                  (e.g. file was deleted between runWorker resolving and
                  the user clicking play), surface the placeholder ON TOP
                  of the video rather than swap them. The video element
                  keeps playing whatever it can from the network cache. */}
              {videoError && result.videoUrl && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-slate-300">
                  <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                  <p className="text-sm">Không tải được file video. Vui lòng thử lại.</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              {result.srtUrl && (
                <a
                  href={result.srtUrl}
                  download={`phude_viet_${result.taskId}.srt`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-medium transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải phụ đề (SRT)</span>
                </a>
              )}
              {result.videoUrl && result.status === "COMPLETED" && (
                <a
                  href={result.videoUrl}
                  download={`VietCast_${result.taskId}.mp4`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-medium transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải video về máy</span>
                </a>
              )}
              {isElectron && result.taskId && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await window.electronAPI.revealInFolder(result.taskId);
                    } catch (err) {
                      console.error("revealInFolder failed:", err);
                      setError(err?.message || "Không thể mở thư mục chứa file.");
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-medium transition"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Mở thư mục chứa file</span>
                </button>
              )}
              {result.status && (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/70 border border-slate-700 text-sm text-slate-300">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      result.status === "COMPLETED"
                        ? "bg-emerald-400"
                        : result.status === "FAILED"
                        ? "bg-red-400"
                        : "bg-amber-400 animate-pulse"
                    }`}
                  />
                  Trạng thái: <span className="font-medium text-slate-100">{result.status}</span>
                </span>
              )}
            </div>

            {result.message && (
              <p className="mt-4 text-xs text-slate-500 italic">{result.message}</p>
            )}
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-slate-500">
          VietCast Engine · React + Tailwind CSS · API: <span className="font-mono">{API_BASE_URL}</span>
        </footer>
      </div>
    </div>
  );
}

function VideoPlaceholder({ message = "Đang render video..." }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
      <Loader2 className="w-10 h-10 animate-spin text-brand-500 mb-3" />
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs text-slate-500 mt-1">File sẽ xuất hiện khi pipeline hoàn tất.</p>
    </div>
  );
}
