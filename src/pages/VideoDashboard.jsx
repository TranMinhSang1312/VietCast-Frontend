import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import axios from "axios";
import { Loader2, Wand2, Mic, Subtitles, CheckCircle2, Download, AlertCircle, Film, Languages, Coins } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL_PROVIDER } from "../config";
import { recordUsageLog } from "../services/history";
import WatermarkRemover from "../components/watermark/WatermarkRemover";

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

// Whitelist kept in sync with backend VideoRequest.@Pattern on `voice`.
// Blank / null means "use the engine's built-in TTS_VOICE default".
const VOICE_OPTIONS = [
  {
    value: "vi-VN-NamMinhNeural",
    label: "Nam Minh (nam, mặc định)",
    description: "Giọng nam miền Bắc tự nhiên, phù hợp phim tài liệu / tin tức.",
  },
  {
    value: "vi-VN-HoaiMyNeural",
    label: "Hoài My (nữ)",
    description: "Giọng nữ miền Bắc ấm áp, phù hợp video giải trí / kể chuyện.",
  },
];

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;
const PROGRESS_REGEX = /(\d{1,3})\s*%/;

function extractUrl(raw) {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/https?:\/\/\S+/);
  if (match) return match[0].replace(/\/+$/, "");
  return null;
}

/**
 * Mirror of the backend {@code normalizeVideoUrl}: drop the YouTube
 * share-tracker {@code si=...} parameter so two requests with /watch?v=X
 * and /watch?v=X&si=Y produce the same preview / dedup key.
 */
function normalizePreviewUrl(raw) {
  if (!raw) return raw;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const isYoutube = lower.includes("youtube.com") || lower.includes("youtu.be");
  if (!isYoutube) return trimmed;
  const stripped = trimmed.replace(/([?&])si=[A-Za-z0-9_-]+/g, "");
  return stripped.replace(/[?&]$/, "");
}

export default function VideoDashboard() {
  const { updateCreditBalance } = useAuth();
  const [url, setUrl] = useState(() => localStorage.getItem("vc_url") || "");
  const [audioMode, setAudioMode] = useState(() => localStorage.getItem("vc_audioMode") || "mix");
  const [voice, setVoice] = useState(() => localStorage.getItem("vc_voice") || "vi-VN-NamMinhNeural");
  const [logoCoordinates, setLogoCoordinates] = useState(() => localStorage.getItem("vc_logoCoordinates") || "");
  const [subtitleMask, setSubtitleMask] = useState(() => localStorage.getItem("vc_subtitleMask") || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(() => {
    try {
      const saved = localStorage.getItem("vc_active_task");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [progress, setProgress] = useState(() => {
    const saved = localStorage.getItem("vc_active_progress");
    return saved ? Number(saved) : 0;
  });

  // ----- Cost preview state -----
  // `costPreview` is null until the user pastes a valid URL and the
  // debounced preview call returns. It carries the breakdown the
  // server computed so the renderer can:
  //   - display "40 phút × 500 = 20 000 credit" inline below the
  //     input box
  //   - disable the submit button when sufficient=false
  //   - populate the "Nạp thêm ngay" deep-link with the missing amount
  // `costPreviewLoading` is true while the debounced call is in
  // flight, used to render a small spinner inside the URL field.
  const [costPreview, setCostPreview] = useState(null);
  const [costPreviewLoading, setCostPreviewLoading] = useState(false);
  // `showCreditWarning` flips on when the user clicks the disabled
  // submit button (or when balance changed underneath them) so we can
  // pop the warning dialog with the missing-credits number.
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [topupPrefill, setTopupPrefill] = useState(null);

  // Crop modal states
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropType, setCropType] = useState("logo"); // "logo" | "subtitle"

  const pollIntervalRef = useRef(null);
  const usageLoggedTaskIdRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("vc_url", url);
  }, [url]);

  useEffect(() => {
    localStorage.setItem("vc_audioMode", audioMode);
  }, [audioMode]);

  useEffect(() => {
    localStorage.setItem("vc_voice", voice);
  }, [voice]);

  useEffect(() => {
    localStorage.setItem("vc_logoCoordinates", logoCoordinates);
  }, [logoCoordinates]);

  useEffect(() => {
    localStorage.setItem("vc_subtitleMask", subtitleMask);
  }, [subtitleMask]);

  useEffect(() => {
    if (result) {
      localStorage.setItem("vc_active_task", JSON.stringify(result));
    } else {
      localStorage.removeItem("vc_active_task");
    }
  }, [result]);

  useEffect(() => {
    localStorage.setItem("vc_active_progress", String(progress));
  }, [progress]);

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
      if (result && mode !== audioMode) {
        resetResultState();
      }
    },
    [result, audioMode, error, resetResultState],
  );

const handleReset = useCallback(() => {
        setUrl("");
        setAudioMode("mix");
        setLogoCoordinates("");
        setSubtitleMask("");
        setResult(null);
        setError(null);
        setVideoReady(false);
        setVideoError(false);
        setProgress(0);
        setCostPreview(null);
        setCostPreviewLoading(false);
        setShowCreditWarning(false);
        setTopupPrefill(null);
        clearPollInterval();
    }, [clearPollInterval]);

    // Force-download via the backend's presigned-R2 endpoint. We do NOT
    // link straight to the public R2 URL because (a) browsers ignore
    // `download` on cross-origin links and (b) R2 serves the file with
    // `inline` disposition by default — clicking would auto-play the
    // MP4 in a new tab instead of saving it.
    const handleDownload = useCallback(async (taskId, type) => {
        if (!taskId) return;
        try {
            const resp = await axios.get(
                `${API_BASE_URL}/api/v1/videos/${taskId}/download`,
                { params: { type } }
            );
            const { downloadUrl, filename } = resp.data || {};
            if (!downloadUrl) {
                throw new Error("Backend did not return a downloadUrl");
            }
            const a = document.createElement("a");
            a.href = downloadUrl;
            if (filename) a.download = filename;
            a.rel = "noopener";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            // 422 UNSUPPORTED_URL means the row predates this column —
            // fall back to opening the public URL so the user can still
            // get the file inline.
            const code = err.response?.data?.code;
            const fallback = type === "srt" ? result?.srtUrl : result?.videoUrl;
            if (code === "UNSUPPORTED_URL" && fallback) {
                window.open(fallback, "_blank", "noopener");
            } else {
                console.error("[download] failed", err);
                setError(err.response?.data?.message || err.message || "Không thể tải file. Vui lòng thử lại.");
            }
        }
    }, [result]);

  // Debounced fetch of the cost preview whenever the URL or audioMode
  // change. We deliberately keep audioMode in the dependency list so
  // toggling "Lồng tiếng AI" → "Giữ tiếng gốc" recomputes without the
  // user having to re-paste the URL.
  //
  // Latency model: typing the last char of a YouTube URL fires the
  // effect; the 600ms debounce absorbs "still typing" keystrokes. Worst
  // case is one round-trip per settled URL = ~10s when yt-dlp times
  // out (matches the server timeout). We surface that with a spinner
  // inside the input area so the user knows we're working.
  //
  // AbortController cancels an in-flight request when the URL changes
  // again or the component unmounts, so the latest settled URL wins.
  useEffect(() => {
    const handle = setTimeout(() => {
      const cleanUrl = extractUrl(url);
      if (!cleanUrl) {
        setCostPreview(null);
        setCostPreviewLoading(false);
        return;
      }
      const canonical = normalizePreviewUrl(cleanUrl);
      const controller = new AbortController();
      setCostPreviewLoading(true);
      axios
        .get(`${API_BASE_URL}/api/v1/videos/preview-cost`, {
          params: { url: canonical, audioMode },
          signal: controller.signal,
          timeout: 15000,
        })
        .then((res) => {
          setCostPreview(res.data);
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          // Surface as a soft warning rather than throwing — the user
          // can still attempt submit, at which point the backend
          // re-does the check.
          setCostPreview(null);
        })
        .finally(() => {
          setCostPreviewLoading(false);
        });
      // Cancel on cleanup so a fast-typing user does not pile up
      // stale requests behind the latest one.
      return () => controller.abort();
    }, 600);
    return () => clearTimeout(handle);
    // handleUrlChange / handleModeChange in deps so the effect re-runs
    // when the user picks a different mode without re-typing.
  }, [url, audioMode]);

  const refreshUserCredit = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/auth/me`);
      if (data && typeof data.creditBalance === "number") {
        updateCreditBalance(data.creditBalance);
      }
    } catch {
      /* ignore */
    }
  }, [updateCreditBalance]);

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

      // Pre-flight balance guard.
      // The cost preview has been refreshing on every URL change
      // (debounced 600ms). If it has come back as `sufficient=false`
      // we MUST block the submit:
      //   - a 40-minute clip routed into the queue burns an engine
      //     worker slot for 10+ minutes,
      //   - the engine reports a longer or equal duration at the end,
      //   - the post-hoc charge then throws InsufficientCreditException
      //     and the user effectively gets a free render.
      // The backend re-checks on POST /process — this is purely UX.
      if (costPreview && costPreview.sufficient === false) {
        setTopupPrefill(costPreview.missingCredits);
        setShowCreditWarning(true);
        return;
      }

      setIsLoading(true);
      setError(null);
      setResult({ status: "PROCESSING", url: cleanUrl, audioMode });
      setVideoReady(false);
      setVideoError(false);

      try {
        const { data } = await axios.post(
          `${API_BASE_URL}/api/v1/videos/process`,
          {
            url: cleanUrl,
            audioMode,
            // Only forward a voice value when the user picked an
            // AI-dub mode; otherwise the engine skips TTS anyway.
            voice: (audioMode === "dub" || audioMode === "mix") && voice ? voice : null,
            logoCoordinates: logoCoordinates.trim() || null,
            subtitleMask: subtitleMask.trim() || null
          },
          { headers: { "Content-Type": "application/json" }, timeout: 30000 }
        );
        setResult({ ...data, url: data.url ?? cleanUrl, audioMode: data.audioMode ?? audioMode, voice: data.voice ?? voice });
        refreshUserCredit();
      } catch (err) {
        const status = err?.response?.status || err?.status;
        const code = err?.response?.data?.code || err?.code;
        const backendMessage = err?.response?.data?.message;
        if (code === "VIDEO_TOO_LONG" || status === 413) {
          // Cap enforcement surface. The preview may have failed
          // (yt-dlp timeout) so the user saw no banner, but /process
          // resolves the duration fresh and rejects here. Show the
          // backend's message verbatim so the user sees the actual
          // length + cap.
          setError(
            backendMessage ||
              "Video vượt quá giới hạn 90 phút. Vui lòng cắt video trước khi xử lý."
          );
        } else if (status === 402 || status === 403 || code === "INSUFFICIENT_CREDIT") {
          try {
            const { data } = await axios.get(`${API_BASE_URL}/api/auth/me`);
            if (data && typeof data.creditBalance === "number") {
              updateCreditBalance(data.creditBalance);
            }
          } catch {
            /* ignore */
          }
          setError(
            backendMessage ||
              "Bạn không đủ credit để xử lý video. Vui lòng click nút 'Nạp tiền' ở góc trên bên phải để nạp thêm credit."
          );
        } else {
          setError(backendMessage || err?.message || "Không thể kết nối tới máy chủ. Vui lòng thử lại sau.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [url, audioMode, logoCoordinates, subtitleMask, updateCreditBalance, refreshUserCredit],
  );

  useEffect(() => {
    if (!result?.taskId) return;
    if (result.status !== "PROCESSING") return;

    const taskId = result.taskId;
    // Snapshot the starting status so a transient COMPLETED→PROCESSING
    // flicker (e.g. retry/rollback) doesn't tear down the polling
    // interval and freeze the UI on the last value seen. We gate the
    // poll on a stable taskId only, and the poll itself decides when
    // to stop based on the latest server status.

    const fetchStatus = async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE_URL}/api/v1/videos/status/${taskId}`,
          { timeout: 10000 }
        );
        if (data.taskId && data.taskId !== taskId) {
          return;
        }
        setResult((prev) => ({
          ...prev,
          taskId: data.taskId ?? prev.taskId,
          status: data.status,
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
          setProgress((prev) => (serverProgress > prev ? serverProgress : prev));
        }

        if (data.status === "COMPLETED" || data.status === "FAILED") {
          clearPollInterval();
          refreshUserCredit();
        }
      } catch (err) {
        if (err.response?.status === 404) {
          clearPollInterval();
          setError("Không tìm thấy tác vụ. Có thể server đã khởi động lại.");
        }
      }
    };

    fetchStatus();
    pollIntervalRef.current = setInterval(fetchStatus, 2000);

    // Pause polling when the tab is hidden — saves backend cycles and
    // avoids waking the user's laptop. Resume on visibility change.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !pollIntervalRef.current) {
        fetchStatus();
        pollIntervalRef.current = setInterval(fetchStatus, 2000);
      } else if (document.visibilityState !== "visible" && pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearPollInterval();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // Depend ONLY on taskId — depending on status caused the interval
    // to be torn down + recreated on every status tick (C-1 race).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.taskId]);

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

  useEffect(() => {
    if (isLoading && usageLoggedTaskIdRef.current) {
      usageLoggedTaskIdRef.current = null;
    }
  }, [isLoading]);

  const isProcessing = result?.status === "PROCESSING";

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
    <div className="w-full flex flex-col items-center bg-slate-950 font-sans text-zinc-100 px-4 py-8 sm:py-12 relative overflow-x-hidden">
      {/* Ambient backgrounds */}
      <div className="absolute top-[-20%] right-[-10%] w-[720px] h-[720px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-25%] left-[-15%] w-[520px] h-[520px] bg-violet-600/8 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-6xl z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-white/[0.06] mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Languages className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white leading-tight">VietCast</h1>
              <p className="text-xs text-slate-500 font-mono">Workspace</p>
            </div>
          </div>
          <div className="text-center md:text-left select-none">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tighter text-zinc-100">
              Lồng tiếng Video AI
            </h2>
          </div>
        </header>

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form Controls */}
          <section className="lg:col-span-7 rounded-3xl border border-white/[0.06] bg-white/[0.025] backdrop-blur-xl p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* URL input */}
              <div>
                <label htmlFor="video-url" className="block text-sm font-semibold text-zinc-300 mb-2">
                  Đường dẫn Video <span className="text-zinc-500 font-normal">(TikTok / YouTube / Douyin)</span>
                </label>
                <input
                  id="video-url"
                  type="url"
                  inputMode="url"
                  placeholder="Dán link video tại đây..."
                  value={url}
                  onChange={handleUrlChange}
                  disabled={isLoading || isProcessing}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-white/[0.06] text-zinc-100 placeholder:text-slate-600 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed text-base font-mono"
                />

                {/* ----- Cost preview panel -----
                    Renders inline below the URL field the moment the
                    debounced preview call returns. Three states:
                      (1) costPreviewLoading=true → spinner + "Đang tính..."
                      (2) costPreview null (failed) → nothing — the
                          user can still submit, the server re-checks.
                      (3) costPreview.sufficient=true → green-ish
                          breakdown: "X phút × Y credit = Z credit"
                      (4) costPreview.sufficient=false → red-ish
                          breakdown + the "Không đủ credit" caption
                          that links into the topup modal.
                    We surface the breakdown BEFORE the user can click
                    submit, so a 40-p clip with 1000 credit shows the
                    red breakdown immediately rather than waiting for
                    /process to 403 them after the engine has already
                    started chewing on it. */}
                {costPreviewLoading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang tính chi phí xử lý video...</span>
                  </div>
                )}
                {!costPreviewLoading && costPreview && (() => {
                  // Three mutually-exclusive visual states:
                  //   ① overCap=true              → red banner, no pricing shown
                  //   ② overCap=false, !sufficient → red pricing + topup CTA
                  //   ③ overCap=false,  sufficient → green pricing
                  //
                  // The old "flatBilled" branch is dead under the uniform
                  // pricing model (backend always serialises flatBilled=false
                  // now) but the field still exists on the wire for
                  // compatibility — we ignore it here.
                  const overCap = costPreview.overCap === true;
                  const sufficient = costPreview.sufficient === true;
                  let themeClass;
                  if (overCap) {
                    themeClass = "bg-amber-500/5 border-amber-500/30 text-amber-100";
                  } else if (sufficient) {
                    themeClass = "bg-emerald-500/5 border-emerald-500/20 text-emerald-200";
                  } else {
                    themeClass = "bg-rose-500/5 border-rose-500/30 text-rose-200";
                  }
                  return (
                    <div className={"mt-2 rounded-lg border px-3 py-2.5 text-xs " + themeClass}>
                      {overCap ? (
                        // Refusal banner — no pricing math shown because
                        // the user can't fix this with credits, only with
                        // a shorter video.
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="font-semibold flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Vượt quá {costPreview.maxMinutes ?? 90} phút
                          </span>
                          <span className="font-mono text-[11px]">
                            Video: ~{costPreview.estimatedMinutes} phút
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="font-semibold">
                            {costPreview.flatBilled
                              ? `Chi phí cố định: ${Math.round(costPreview.totalRequired).toLocaleString("vi-VN")} credit`
                              : costPreview.durationSeconds
                                ? `Thời lượng: ${costPreview.durationSeconds} giây — Chi phí: ${Math.round(costPreview.totalRequired).toLocaleString("vi-VN")} credit`
                                : `Ước tính: ${Math.round(costPreview.totalRequired).toLocaleString("vi-VN")} credit`}
                          </span>
                          <span className="font-mono text-[11px]">
                            Bạn có: {Math.round(costPreview.currentBalance).toLocaleString("vi-VN")}
                          </span>
                        </div>
                      )}
                      {costPreview.hint && (
                        <p className="mt-1 text-[11px] opacity-80">{costPreview.hint}</p>
                      )}
                      {!sufficient && !overCap && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTopupPrefill(costPreview.missingCredits);
                              setShowCreditWarning(true);
                            }}
                            className="px-3 py-1.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-100 text-xs font-semibold hover:bg-rose-500/30 active:scale-[0.98] transition"
                          >
                            Nạp thêm {Math.round(costPreview.missingCredits).toLocaleString("vi-VN")} credit ngay
                          </button>
                          <span className="text-[11px] opacity-70">
                            hoặc chọn video ngắn hơn.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Advanced Crop Tools (Logo & Subtitles) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-white/[0.06]">
                  <div>
                    <span className="block text-sm font-semibold text-slate-200">Xóa Logo cứng (Delogo)</span>
                    <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                      {logoCoordinates ? `Đã chọn: ${logoCoordinates}` : "Chưa chọn khung"}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {logoCoordinates && (
                      <button
                        type="button"
                        onClick={() => setLogoCoordinates("")}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 active:scale-[0.98] transition select-none"
                      >
                        Xóa
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading || isProcessing}
                      onClick={() => {
                        setCropType("logo");
                        setIsCropOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 text-xs font-semibold hover:bg-white/[0.08] active:scale-[0.98] transition select-none"
                    >
                      Vẽ khung
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-white/[0.06]">
                  <div>
                    <span className="block text-sm font-semibold text-slate-200">Đè phụ đề gốc</span>
                    <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                      {subtitleMask ? `Đã chọn: ${subtitleMask}` : "Chưa chọn khung"}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {subtitleMask && (
                      <button
                        type="button"
                        onClick={() => setSubtitleMask("")}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 active:scale-[0.98] transition select-none"
                      >
                        Xóa
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading || isProcessing}
                      onClick={() => {
                        setCropType("subtitle");
                        setIsCropOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 text-xs font-semibold hover:bg-white/[0.08] active:scale-[0.98] transition select-none"
                    >
                      Vẽ khung
                    </button>
                  </div>
                </div>
              </div>

              {/* Audio mode selector */}
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-3">
                  Chế độ âm thanh
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AUDIO_MODES.map((mode) => (
                    <AudioModeOption
                      key={mode.value}
                      mode={mode}
                      checked={audioMode === mode.value}
                      disabled={isLoading || isProcessing}
                      onSelect={handleModeChange}
                    />
                  ))}
                </div>
              </div>

              {/* Voice selector — only relevant when the engine will actually TTS */}
              {(audioMode === "dub" || audioMode === "mix") && (
                <div>
                  <label
                    htmlFor="voice-select"
                    className="block text-sm font-semibold text-zinc-300 mb-3"
                  >
                    Giọng đọc tiếng Việt
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {VOICE_OPTIONS.map((opt) => {
                      const checked = voice === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={isLoading || isProcessing}
                          onClick={() => setVoice(opt.value)}
                          className={[
                            "relative text-left rounded-xl border p-3 transition select-none",
                            "active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed",
                            checked
                              ? "border-indigo-400 bg-indigo-500/10 ring-1 ring-indigo-400/30 shadow-[0_8px_30px_-12px_rgba(99,102,241,0.4)]"
                              : "border-white/[0.06] bg-slate-950/40 hover:border-white/[0.12] hover:bg-white/[0.03]",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-100">
                              {opt.label}
                            </span>
                            <span
                              className={[
                                "h-4 w-4 rounded-full border flex items-center justify-center",
                                checked
                                  ? "border-indigo-400 bg-indigo-500"
                                  : "border-slate-600 bg-transparent",
                              ].join(" ")}
                              aria-hidden="true"
                            >
                              {checked && (
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                            {opt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submit Action */}
              {!isProcessing && (() => {
                // Compute "is this button allowed to start the submit"
                // here so it stays co-located with the rendering, but
                // we keep the breakdown above as the user-visible
                // source of truth.
                const previewFailedBalance =
                  costPreview && costPreview.sufficient === false;
                const isDisabled =
                  isLoading ||
                  previewFailedBalance ||
                  costPreviewLoading;
                return (
                  <>
                    <button
                      type="submit"
                      disabled={isDisabled}
                      title={
                        previewFailedBalance
                          ? "Bạn không đủ credit. Vui lòng nạp thêm trước khi bắt đầu."
                          : costPreviewLoading
                          ? "Đang tính chi phí..."
                          : undefined
                      }
                      onClick={(e) => {
                        // Click on a disabled button is a no-op for
                        // most browsers, but the safety-net path is
                        // to flip the warning dialog open if the
                        // user clicks anyway (e.g. via Enter key).
                        if (previewFailedBalance) {
                          e.preventDefault();
                          setTopupPrefill(costPreview.missingCredits);
                          setShowCreditWarning(true);
                        }
                      }}
                      className={
                        "w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-4 text-base font-semibold text-slate-950 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98] transition select-none " +
                        (previewFailedBalance
                          ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                          : "bg-emerald-400 hover:bg-emerald-300")
                      }
                    >
                      {isLoading || costPreviewLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{costPreviewLoading && !isLoading ? "Đang tính chi phí..." : "Đang phân tích..."}</span>
                        </>
                      ) : previewFailedBalance ? (
                        <>
                          <AlertCircle className="w-5 h-5" />
                          <span>Không đủ credit để bắt đầu</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-5 h-5" />
                          <span>Bắt đầu xử lý video</span>
                        </>
                      )}
                    </button>
                    {previewFailedBalance && (
                      <button
                        type="button"
                        onClick={() => {
                          setTopupPrefill(costPreview.missingCredits);
                          setShowCreditWarning(true);
                        }}
                        className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-rose-100 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition"
                      >
                        Nạp thêm {Math.round(costPreview.missingCredits).toLocaleString("vi-VN")} credit ngay
                      </button>
                    )}
                  </>
                );
              })()}

              {/* Error */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-4 rounded-xl bg-rose-950/30 border border-rose-900/40 text-rose-200"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                  <div className="text-sm leading-normal">
                    <div className="font-semibold mb-0.5">Yêu cầu thất bại</div>
                    {error}
                  </div>
                </div>
              )}
            </form>
          </section>

          {/* Right Column: Visual Result / Preview */}
          <section className="lg:col-span-5 flex flex-col">
            {result ? (
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
                onDownload={handleDownload}
              />
            ) : (
              <div className="h-full min-h-[300px] border border-dashed border-white/[0.08] rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-white/[0.025] backdrop-blur-md select-none">
                <div className="w-12 h-12 rounded-xl bg-slate-950 ring-1 ring-white/[0.06] flex items-center justify-center text-slate-400 mb-4">
                  <Film className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Bản xem trước video</h3>
                <p className="text-xs text-slate-500 mt-1.5 max-w-[250px] mx-auto leading-relaxed font-medium">
                  Vui lòng nhập đường dẫn video bên trái để bắt đầu quá trình dịch và lồng tiếng.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Crop Modal */}
      {isCropOpen && (
        <WatermarkRemover
          videoSrc={url || ""}
          title={cropType === "logo" ? "Vẽ khung xóa Logo cứng" : "Vẽ khung đè phụ đề gốc"}
          description={
            cropType === "logo"
              ? "Kéo chuột để vẽ một ô vuông bao quanh Logo cứng. Hệ thống sẽ che Logo này bằng thuật toán FFmpeg delogo. Lưu ý: Bạn cần dùng đường dẫn video trực tiếp (ví dụ link đuôi .mp4) để tải được khung hình vẽ."
              : "Kéo chuột để vẽ một ô chữ nhật dài che phụ đề gốc. Hệ thống sẽ bôi mờ phụ đề cũ và đè phụ đề tiếng Việt mới lên trên. Lưu ý: Bạn cần dùng đường dẫn video trực tiếp (ví dụ link đuôi .mp4) để tải được khung hình vẽ."
          }
          onConfirm={(coords) => {
            if (cropType === "logo") {
              setLogoCoordinates(coords);
            } else {
              setSubtitleMask(coords);
            }
            setIsCropOpen(false);
          }}
          onCancel={() => setIsCropOpen(false)}
        />
      )}

      {/* Insufficient-credit warning popup.
          Triggered when the user tries to submit a render whose cost
          (computed by GET /preview-cost) exceeds their balance. The
          modal gives two actions:
            (1) Open the topup modal with the exact missing-credit
                amount pre-filled — the AppShell is listening for
                'vietcast:open-topup' on window, so we dispatch rather
                than thread a context through nested lazy chunks.
            (2) Dismiss + edit the URL. We deliberately do NOT auto-
                redirect because the user may have multiple tabs that
                started a draft simultaneously. */}
      {showCreditWarning && costPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="credit-warning-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreditWarning(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-rose-500/30 shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 id="credit-warning-title" className="text-base font-semibold text-rose-100">
                  Không đủ credit để xử lý video này
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Hệ thống sẽ không gửi video vào hàng đợi để tránh lãng phí tài nguyên engine.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreditWarning(false)}
                className="text-slate-500 hover:text-white p-1 -m-1"
                aria-label="Đóng"
              >
                <span className="sr-only">Đóng</span>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </div>

            <div className="rounded-xl bg-slate-950 border border-white/[0.06] p-4 mb-4 text-sm space-y-2">
              {costPreview.estimatedMinutes && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Thời lượng ước tính:</span>
                  <span className="font-semibold text-zinc-200">~{costPreview.estimatedMinutes} phút</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Cần thanh toán:</span>
                <span className="font-semibold text-zinc-200">
                  {Math.round(costPreview.totalRequired).toLocaleString("vi-VN")} credit
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hiện có:</span>
                <span className="font-semibold text-emerald-300">
                  {Math.round(costPreview.currentBalance).toLocaleString("vi-VN")} credit
                </span>
              </div>
              <div className="border-t border-white/[0.06] pt-2 flex justify-between">
                <span className="text-rose-200 font-semibold">Thiếu:</span>
                <span className="font-mono text-rose-200 font-bold">
                  {Math.round(costPreview.missingCredits).toLocaleString("vi-VN")} credit
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  // Open the global topup modal with the missing amount
                  // pre-filled. AppShell handles the event.
                  window.dispatchEvent(
                    new CustomEvent("vietcast:open-topup", {
                      detail: { prefillAmount: costPreview.missingCredits },
                    })
                  );
                  setShowCreditWarning(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-sm font-semibold active:scale-[0.98] transition"
              >
                <Coins className="w-4 h-4" />
                <span>Nạp {Math.round(costPreview.missingCredits).toLocaleString("vi-VN")} credit ngay</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreditWarning(false)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold active:scale-[0.98] transition"
              >
                Đổi video khác
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components

const AudioModeOption = memo(function AudioModeOption({ mode, checked, disabled, onSelect }) {
  const Icon = mode.icon;
  return (
    <label
      className={`relative cursor-pointer rounded-xl border p-4 transition flex items-start gap-3 select-none ${
        checked
          ? "border-indigo-400 bg-indigo-500/10 shadow-[0_8px_30px_-12px_rgba(99,102,241,0.4)]"
          : "border-white/[0.06] bg-slate-950/40 hover:border-white/[0.12]"
      } ${disabled ? "opacity-40 pointer-events-none" : "active:scale-[0.98]"}`}
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
          checked
            ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/30"
            : "bg-slate-950 text-slate-400 ring-1 ring-white/[0.08]"
        }`}
      >
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm text-slate-100">{mode.label}</span>
          <span
            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
              checked ? "border-indigo-400" : "border-slate-700"
            }`}
          >
            {checked && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1 leading-normal font-medium">{mode.description}</p>
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
  onDownload,
}) {
  return (
    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] backdrop-blur-xl p-6 flex flex-col h-full justify-between">
      <div>
        <div className="flex items-start justify-between gap-3 mb-6 select-none">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-200">Tác vụ đang xử lý</h2>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                Task ID: <span className="text-emerald-400">{result.taskId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-slate-400 hover:text-white underline underline-offset-4 decoration-white/[0.08] transition"
          >
            Tạo task khác
          </button>
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="mb-6 select-none">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-1.5">
              <span>ĐANG XỬ LÝ...</span>
              <span className="text-zinc-200">{progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="bg-white/[0.04] h-1.5 w-full rounded-full overflow-hidden"
            >
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Video Player */}
        <div className="rounded-xl overflow-hidden bg-black border border-white/[0.06] aspect-video relative">
          {videoSrc && result.status === "COMPLETED" ? (
            <>
              <video
                controls
                preload="metadata"
                poster=""
                src={videoSrc}
                onLoadedData={onVideoReady}
                onError={onVideoError}
                className={`w-full h-full object-contain ${videoReady ? "block" : "hidden"}`}
              />
              {!videoReady && !videoError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3 select-none">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs text-zinc-500 font-mono tracking-wider">ĐANG TẢI BẢN XEM TRƯỚC...</span>
                </div>
              )}
            </>
          ) : (
            <VideoPlaceholder message={placeholderMessage} />
          )}
          
          {videoError && result.videoUrl && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center">
              <AlertCircle className="w-6 h-6 text-yellow-400 mb-2" />
              <p className="text-sm text-zinc-355">Không thể phát trực tiếp video. Hãy thử tải về máy của bạn.</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Actions */}
      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-white/[0.06] select-none text-sm">
          <span className="text-slate-400 font-mono uppercase tracking-wider text-xs">Trạng thái:</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                result.status === "COMPLETED"
                  ? "bg-emerald-400"
                  : result.status === "FAILED"
                  ? "bg-red-400"
                  : "bg-amber-400 animate-pulse"
              }`}
            />
            <span className="font-semibold font-mono text-xs">
              {result.status === "COMPLETED" ? "HOÀN TẤT" : result.status === "FAILED" ? "THẤT BẠI" : "ĐANG CHẠY"}
            </span>
          </span>
        </div>

        <div className="flex gap-2.5">
          {result.srtUrl && (
            <button
              type="button"
              onClick={() => onDownload(result.taskId, "srt")}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4.5 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-slate-200 text-sm font-semibold active:scale-[0.98] transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải Phụ đề</span>
            </button>
          )}
          {result.videoUrl && result.status === "COMPLETED" && (
            <button
              type="button"
              onClick={() => onDownload(result.taskId, "video")}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4.5 py-3 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-sm font-semibold shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98] transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải Video</span>
            </button>
          )}
        </div>
      </div>

      {result.message && (
        <p className="mt-4 text-xs text-zinc-500 italic text-center select-none">{result.message}</p>
      )}
    </div>
  );
});

const VideoPlaceholder = memo(function VideoPlaceholder({ message = "Đang render video..." }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-950 p-4 text-center select-none">
      <Loader2 className="w-7 h-7 animate-spin text-indigo-400 mb-3" />
      <p className="text-sm font-semibold text-slate-200">{message}</p>
      <p className="text-xs text-slate-500 mt-1.5 font-medium">Kết quả sẽ hiển thị ngay khi pipeline hoàn thành.</p>
    </div>
  );
});