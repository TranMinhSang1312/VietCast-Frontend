import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import axios from "axios";
import { Loader2, Wand2, Mic, Subtitles, CheckCircle2, Download, AlertCircle, Film, Languages } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL_PROVIDER } from "../config";
import { recordUsageLog } from "../services/history";

// ---------------------------------------------------------------------------
// Module-level constants & helpers — kept outside the component so they are
// NOT re-created on every render. The dashboard re-renders frequently
// (typing in the URL box, polling status, IPC events), and re-allocating
// these arrays/objects every time thrashes the V8 minor GC.
// ---------------------------------------------------------------------------

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
const PROGRESS_REGEX = /(\d{1,3})\s*%/;

/** Extract clean URL from pasted text (handles Douyin/TikTok share format). */
function extractUrl(raw) {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/https?:\/\/\S+/);
  if (match) return match[0].replace(/\/+$/, "");
  return null;
}

/**
 * Parse "PROGRESS: 12 %" / "Progress 12%" style lines emitted by the
 * Python worker on stdout. Returns null when no match so the caller can
 * ignore noise. The match is intentionally permissive — if main also
 * broadcasts progress via its own channel, the two sources will simply
 * race and `setProgress` keeps the larger value (see the polling fallback).
 */
function parseProgressFromLine(text) {
  if (!text) return null;
  const m = text.match(PROGRESS_REGEX);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.min(100, Math.max(0, n));
}

/** Last-line stderr → human message. Strips ANSI noise. */
function lastStderrLine(stderr) {
  if (!stderr) return null;
  return stderr
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-1)[0] || null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VideoDashboard() {
  const { updateCreditBalance } = useAuth();
  const [url, setUrl] = useState("");
  const [audioMode, setAudioMode] = useState("mix");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [progress, setProgress] = useState(0);
  const pollIntervalRef = useRef(null);
  // Tracks the most recent taskId for which we've already POSTed a
  // usage-log row to the backend. The polling path may re-enter a
  // terminal state on a subsequent tick, and the backend will dedupe
  // on the server side, but skipping the second POST also avoids
  // burning the user's bandwidth on a guaranteed-no-op round-trip.
  const usageLoggedTaskIdRef = useRef(null);

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const resetResultState = useCallback(() => {
    setResult(null);
    setProgress(0);
    setVideoReady(false);
    setVideoError(false);
    clearPollInterval();
  }, [clearPollInterval]);

  const handleUrlChange = useCallback(
    (e) => {
      const next = e.target.value;
      // If the URL is being edited while a previous result is still on screen
      // (e.g. user pasted a new link on top of a completed job), wipe the old
      // result so the UI forces a fresh submit. This prevents the user from
      // being confused when the next submit returns the *cached* result for
      // a link they no longer want.
      if (result && next !== url) {
        resetResultState();
      }
      setUrl(next);
      if (error) setError(null);
    },
    [result, url, error, resetResultState],
  );

  const handleModeChange = useCallback(
    (mode) => {
      setAudioMode(mode);
      if (error) setError(null);
      // The cache key is "<url>_<audioMode>", so switching the audio mode
      // changes the request identity. Clear the previous result to avoid
      // showing stale data after the user re-submits.
      if (result && mode !== audioMode) {
        resetResultState();
      }
    },
    [result, audioMode, error, resetResultState],
  );

  const handleReset = useCallback(() => {
    setUrl("");
    setAudioMode("mix");
    setResult(null);
    setError(null);
    setVideoReady(false);
    setVideoError(false);
    setProgress(0);
    clearPollInterval();
  }, [clearPollInterval]);

  // -------------------------------------------------------------------
  // Electron `worker:exit` handler removed.
  //
  // The previous Electron branch in handleSubmit used to wire up an
  // IPC listener (`window.electronAPI.onWorkerExit`) that updated the
  // result with vietcast:// URLs when the local Python worker exited.
  // That path no longer exists in the web build — the backend now owns
  // the entire pipeline, and the HTTP polling path below is the
  // single source of truth for status transitions.
  // -------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (e) => {
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
        // ────────────────────────────────────────────────────────────────
        // WEB SUBMIT — single HTTP path. The previous Electron branch
        // (window.electronAPI.runWorker + onWorkerExit/onWorkerStdout/
        // onWorkerStderr/onProgress) has been removed because this
        // project is now a pure SPA. The desktop worker that used to
        // download videos to local disk and feed them through FFmpeg
        // must be reimplemented server-side on the Spring Boot backend.
        //
        // TODO(backend-port): move video download + FFmpeg mux + subtitle
        // generation from the Electron main process to a backend
        // service (e.g. VideoProcessingService) so the API can return
        // the resulting resultUrl + srtUrl without ever touching the
        // renderer's filesystem.
        // ────────────────────────────────────────────────────────────────
        const { data } = await axios.post(
          `${API_BASE_URL}/api/v1/videos/process`,
          { url: cleanUrl, audioMode },
          { headers: { "Content-Type": "application/json" }, timeout: 30000 }
        );
        // Stash the submitted URL + audioMode on the result so the
        // history-log effect can include them in the audit row even
        // when the server response omits them.
        setResult({ ...data, url: data.url ?? cleanUrl, audioMode: data.audioMode ?? audioMode });
      } catch (err) {
        // Interceptor in src/config.js already translated the axios
        // error into a Vietnamese, user-safe message.
        //
        // Special-case 402 (PAYMENT_REQUIRED) — backend returned this
        // because the user is out of credit. Refresh the cached balance
        // (server is the source of truth) so the UI counter reflects
        // reality and don't bury the message in a generic "network error".
        const status = err?.response?.status || err?.status;
        const code = err?.response?.data?.code || err?.code;
        if (status === 402 || code === "INSUFFICIENT_CREDIT") {
          // Pull the latest balance from the server. If the call also
          // fails, fall through to the generic error below.
          try {
            const { data } = await axios.get(`${API_BASE_URL}/api/auth/me`);
            if (data && typeof data.creditBalance === "number") {
              updateCreditBalance(data.creditBalance);
            }
          } catch {
            /* ignore — we still want to show the original message */
          }
          setError(
            err?.message ||
              "Bạn không đủ credit để xử lý video. Vui lòng nạp thêm để tiếp tục."
          );
        } else {
          setError(err?.message || "Không thể kết nối tới máy chủ. Vui lòng thử lại sau.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [url, audioMode, updateCreditBalance],
  );

  // Polling: every 2 seconds while a task is PROCESSING, fetch /status/{taskId}
  // and update progress. Cleanup on terminal state (COMPLETED / FAILED) or
  // when the component unmounts.
  useEffect(() => {
    if (!result?.taskId) return;
    if (result.status !== "PROCESSING") return;

    const taskId = result.taskId;

    const fetchStatus = async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE_URL}/api/v1/videos/status/${taskId}`,
          { timeout: 10000 }
        );
        // Defensive: the polled server entry must be for THIS taskId.
        // The status response should never carry a different id, but a
        // stale cache or a misrouted request would otherwise leak the
        // previous task's videoUrl into the UI.
        if (data.taskId && data.taskId !== taskId) {
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
          clearPollInterval();
        }
      } catch (err) {
        // Transient network error: keep the timer running, do not clear progress.
        // Only stop if the server reports a 404 (unknown taskId).
        if (err.response?.status === 404) {
          clearPollInterval();
          setError("Không tìm thấy tác vụ. Có thể server đã khởi động lại.");
        }
      }
    };

    // Run immediately so we don't wait 2s for the first tick.
    fetchStatus();
    pollIntervalRef.current = setInterval(fetchStatus, 2000);

    return clearPollInterval;
  }, [result?.taskId, result?.status, clearPollInterval]);

  /**
   * Persist a usage-logs row whenever a taskId transitions to a
   * terminal state (COMPLETED / FAILED). One POST per taskId, gated
   * by {@code usageLoggedTaskIdRef} so subsequent polling ticks for
   * the same task do not produce duplicate network calls. The
   * backend further dedupes on taskId server-side, so this is purely
   * a bandwidth optimisation for the common case.
   *
   * Note: result.url is set in setResult(...) during submit so the
   * audit row carries the original submitted URL even after the
   * polling path overwrites videoUrl/srtUrl.
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

  // Cache-bust the video URL only when we have one. Computing this inline
  // inside the JSX would reallocate the string on every render even when
  // the result hasn't changed — useMemo keeps it stable.
  const videoSrc = useMemo(() => {
    if (!result?.videoUrl) return undefined;
    const sep = result.videoUrl.includes("?") ? "&" : "?";
    return `${result.videoUrl}${sep}t=${result.taskId}`;
  }, [result?.videoUrl, result?.taskId]);

  const placeholderMessage = useMemo(() => {
    if (isProcessing) return "Đang render video…";
    if (result?.status === "FAILED") return "Quá trình xử lý thất bại.";
    return "Đang tải video lên máy chủ…";
  }, [isProcessing, result?.status]);

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
                {AUDIO_MODES.map((mode) => (
                  <AudioModeOption
                    key={mode.value}
                    mode={mode}
                    checked={audioMode === mode.value}
                    disabled={isLoading}
                    onSelect={handleModeChange}
                  />
                ))}
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
          <ResultPanel
            result={result}
            isProcessing={isProcessing}
            progress={progress}
            videoReady={videoReady}
            videoError={videoError}
            videoSrc={videoSrc}
            placeholderMessage={placeholderMessage}
            onReset={handleReset}
            onVideoReady={() => setVideoReady(true)}
            onVideoError={() => setVideoError(true)}
            onSetError={setError}
          />
        )}

        <footer className="mt-10 text-center text-xs text-slate-500">
          VietCast Engine · React + Tailwind CSS · API: <span className="font-mono">{API_BASE_URL}</span>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — extracted so memoization can skip re-rendering them when
// their props are unchanged. They live in the same module so they share
// closures over module-level constants without prop-drilling.
// ---------------------------------------------------------------------------

const AudioModeOption = memo(function AudioModeOption({ mode, checked, disabled, onSelect }) {
  const Icon = mode.icon;
  return (
    <label
      className={`relative cursor-pointer rounded-xl border p-4 transition flex items-start gap-3 ${
        checked
          ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/40"
          : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input
        type="radio"
        name="audioMode"
        value={mode.value}
        checked={checked}
        onChange={() => onSelect(mode.value)}
        disabled={disabled}
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
});

const ResultPanel = memo(function ResultPanel({
  result,
  isProcessing,
  progress,
  videoReady,
  videoError,
  videoSrc,
  placeholderMessage,
  onReset,
  onVideoReady,
  onVideoError,
  onSetError,
}) {
  // -------------------------------------------------------------------
  // Reveal-in-folder handler removed.
  //
  // The previous Electron build used to call `shell.showItemInFolder`
  // via IPC to open the local output directory. In the web build the
  // rendered file lives at a remote resultUrl, so this action has no
  // equivalent — the user downloads via the existing download button.
  // Kept as a no-op stub so any leftover prop wiring compiles cleanly.
  // -------------------------------------------------------------------
  const onReveal = useCallback(async () => {
    /* no-op in the web build */
  }, [result.taskId]);

  return (
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
          onClick={onReset}
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
          Renders the <video> element ONLY when we have a usable source
          URL AND the task has reached COMPLETED. While PROCESSING, we
          show a contextual placeholder ("Đang render video…") so the
          user is not staring at a blank box. */}
      <div className="rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video relative">
        {videoSrc && result.status === "COMPLETED" ? (
          <video
            controls
            // preload="none" — do NOT download any bytes of the mp4
            // until the user clicks play. With preload="metadata" the
            // browser would fetch the first ~256 kB to extract
            // duration/dimensions; that cost is wasted on a result the
            // user is likely to scroll past in the history list or
            // leave open in another tab. The cache-bust query param
            // (videoSrc) already includes the taskId, so the file is
            // still revalidated when the user actually plays it.
            preload="none"
            poster=""
            src={videoSrc}
            onLoadedData={onVideoReady}
            onError={onVideoError}
            className={`w-full h-full object-contain ${videoReady ? "block" : "hidden"}`}
          />
        ) : (
          <VideoPlaceholder message={placeholderMessage} />
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
  );
});

const VideoPlaceholder = memo(function VideoPlaceholder({ message = "Đang render video..." }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
      <Loader2 className="w-10 h-10 animate-spin text-brand-500 mb-3" />
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs text-slate-500 mt-1">File sẽ xuất hiện khi pipeline hoàn tất.</p>
    </div>
  );
});