import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Loader2, Play, RotateCcw, AlertCircle, Link2, Sparkles, XCircle } from "lucide-react";
import { handleApiError } from "../utils/apiError";
import { API_BASE_URL_PROVIDER } from "../config";

export const TaskStatus = Object.freeze({
  IDLE: "IDLE",
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

const POLL_INTERVAL_MS = 3_000;
const API_BASE_URL = API_BASE_URL_PROVIDER.sync;
const RENDER_ENDPOINT = `${API_BASE_URL}/api/v1/videos/render`;
const taskStatusUrl  = (taskId) => `${API_BASE_URL}/api/v1/tasks/${taskId}`;

const ACTIVE_STATUSES = new Set([TaskStatus.PENDING, TaskStatus.PROCESSING]);

function normaliseWireStatus(wireStatus) {
  if (typeof wireStatus !== "string") return TaskStatus.FAILED;
  const upper = wireStatus.toUpperCase();
  if (upper === TaskStatus.PENDING)   return TaskStatus.PENDING;
  if (upper === TaskStatus.PROCESSING) return TaskStatus.PROCESSING;
  if (upper === TaskStatus.COMPLETED) return TaskStatus.COMPLETED;
  return TaskStatus.FAILED;
}

export default function VideoDubbing() {
  const [videoUrl,    setVideoUrl]    = useState("");
  const [taskId,      setTaskId]      = useState(null);
  const [taskStatus,  setTaskStatus]  = useState(TaskStatus.IDLE);
  const [resultUrl,   setResultUrl]   = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const intervalRef       = useRef(null);
  const latestStatusRef   = useRef(taskStatus);
  const cancelledRef      = useRef(false);

  useEffect(() => { latestStatusRef.current = taskStatus; }, [taskStatus]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      log.debug("[poller] stopped");
    }
  }, []);

  const startPolling = useCallback((id) => {
    if (intervalRef.current != null) return;
    log.debug("[poller] starting for taskId={}", id);

    const tick = async () => {
      if (cancelledRef.current) {
        stopPolling();
        return;
      }
      try {
        const { data } = await axios.get(taskStatusUrl(id));
        const next = normaliseWireStatus(data?.status);

        if (next === TaskStatus.PROCESSING &&
            latestStatusRef.current === TaskStatus.PENDING) {
          setTaskStatus(TaskStatus.PROCESSING);
        }

        if (next === TaskStatus.COMPLETED) {
          const url = typeof data?.resultUrl === "string" ? data.resultUrl : null;
          setResultUrl(url);
          setTaskStatus(TaskStatus.COMPLETED);
          stopPolling();
        } else if (next === TaskStatus.FAILED) {
          setErrorMessage(
            (data && (data.note || data.message)) ||
            "Tác vụ thất bại, vui lòng thử lại."
          );
          setTaskStatus(TaskStatus.FAILED);
          stopPolling();
        }
      } catch (err) {
        const processed = handleApiError(err);
        if (processed.status === 404) {
          setErrorMessage("Tác vụ không còn tồn tại trên máy chủ.");
          setTaskStatus(TaskStatus.FAILED);
          stopPolling();
        } else {
          log.warn(
            "[poller] transient error (status={} code={}): {}",
            processed.status, processed.code, processed.message
          );
        }
      }
    };

    tick();
    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);
  }, [stopPolling]);

  useEffect(() => {
    if (taskId && ACTIVE_STATUSES.has(taskStatus)) {
      startPolling(taskId);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [taskId, taskStatus, startPolling, stopPolling]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      stopPolling();
    };
  }, [stopPolling]);

  const handleSubmit = useCallback(async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();

    const trimmed = (videoUrl || "").trim();
    if (!trimmed) {
      setErrorMessage("Vui lòng nhập URL video.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setResultUrl(null);
    setTaskId(null);

    try {
      const { data } = await axios.post(RENDER_ENDPOINT, {
        url: trimmed,
        audioMode: "mix",
      });

      const newTaskId =
        typeof data?.taskId === "string" || typeof data?.taskId === "number"
          ? String(data.taskId)
          : null;

      if (!newTaskId) {
        throw new Error("Phản hồi từ máy chủ không chứa taskId.");
      }

      setTaskId(newTaskId);
      setTaskStatus(TaskStatus.PENDING);
    } catch (err) {
      const processed = handleApiError(err);
      setErrorMessage(processed.message);
      setTaskStatus(TaskStatus.FAILED);
    } finally {
      setIsSubmitting(false);
    }
  }, [videoUrl]);

  const handleReset = useCallback(() => {
    stopPolling();
    setTaskId(null);
    setResultUrl(null);
    setErrorMessage(null);
    setTaskStatus(TaskStatus.IDLE);
  }, [stopPolling]);

  const isWorking = taskStatus === TaskStatus.PENDING || taskStatus === TaskStatus.PROCESSING;

  return (
    <div className="min-h-screen w-full px-4 py-12 bg-zinc-950 font-sans text-zinc-100 flex items-start justify-center relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-brand-500/2 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-xl z-10">
        {/* Header */}
        <header className="mb-10 text-center select-none">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 mb-4">
            <Sparkles className="w-6 h-6 text-brand-500" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-white">
            Lồng Tiếng AI Video
          </h1>
          <p className="mt-2 text-zinc-400 text-xs leading-relaxed max-w-sm mx-auto">
            Dán đường dẫn video bất kỳ, hệ thống thông minh sẽ dịch và lồng tiếng Việt chất lượng cao.
          </p>
        </header>

        {/* ---- IDLE: Input Form ---- */}
        {taskStatus === TaskStatus.IDLE && (
          <section className="bg-zinc-900/25 border border-zinc-900 rounded-2xl p-6 sm:p-8 backdrop-blur-md">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="videoUrl"
                  className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2"
                >
                  Đường dẫn Video
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Link2 className="w-4.5 h-4.5 text-zinc-500" />
                  </div>
                  <input
                    id="videoUrl"
                    name="videoUrl"
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="url"
                    placeholder="Dán link video TikTok / Youtube..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-850 text-zinc-100 placeholder:text-zinc-650 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50 text-sm"
                    required
                  />
                </div>
                {errorMessage && (
                  <p className="mt-2.5 text-xs text-red-400 flex items-start gap-1.5 p-3 rounded-xl bg-red-950/20 border border-red-900/40">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !videoUrl.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm shadow-lg shadow-brand-500/10 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed select-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang gửi yêu cầu...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4.5 h-4.5" />
                    <span>Bắt đầu lồng tiếng</span>
                  </>
                )}
              </button>
            </form>
          </section>
        )}

        {/* ---- PENDING / PROCESSING: Animated progress ---- */}
        {isWorking && (
          <section className="bg-zinc-900/25 border border-zinc-900 rounded-2xl p-8 backdrop-blur-md select-none">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 rounded-full bg-brand-500/10 blur-xl animate-pulse" />
                <Loader2 className="relative w-12 h-12 text-brand-500 animate-spin" strokeWidth={2} />
              </div>

              <h2 className="text-sm font-semibold text-zinc-200">
                {taskStatus === TaskStatus.PENDING
                  ? "Đã tiếp nhận, đang chờ hàng đợi..."
                  : "Đang phân tích và xử lý âm thanh..."}
              </h2>

              <p className="mt-3 text-xs text-zinc-500 leading-relaxed max-w-xs font-light">
                Quá trình này mất khoảng vài phút. Bạn có thể rời trang hoặc làm việc khác mà không sợ gián đoạn.
              </p>

              {taskId && (
                <p className="mt-4 text-[10px] text-zinc-600 font-mono">
                  Task ID: {taskId}
                </p>
              )}

              {/* Indeterminate linear progress track */}
              <div className="mt-6 w-full max-w-xs h-1 bg-zinc-900 rounded-full overflow-hidden relative">
                <div className="h-full w-1/3 bg-brand-500 rounded-full absolute left-0 top-0 animate-[progress_1.6s_ease-in-out_infinite]" />
              </div>
            </div>
          </section>
        )}

        {/* ---- COMPLETED: Video Player & Reset ---- */}
        {taskStatus === TaskStatus.COMPLETED && (
          <section className="bg-zinc-900/25 border border-zinc-900 rounded-2xl p-6 backdrop-blur-md space-y-5">
            <div className="flex items-center gap-2 text-emerald-400 select-none">
              <Play className="w-4 h-4" />
              <h2 className="text-sm font-semibold">Hoàn tất xử lý video</h2>
            </div>

            {resultUrl ? (
              <video
                key={resultUrl}
                src={resultUrl}
                controls
                preload="metadata"
                className="w-full aspect-video rounded-xl bg-black border border-zinc-850"
              >
                Trình duyệt không hỗ trợ xem trực tiếp.
              </video>
            ) : (
              <div className="w-full aspect-video rounded-xl bg-zinc-950 border border-zinc-850 flex items-center justify-center text-zinc-500 text-xs">
                Không thể tải liên kết kết quả.
              </div>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 text-zinc-350 text-xs font-medium active:scale-[0.98] transition select-none"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Tạo video khác</span>
            </button>
          </section>
        )}

        {/* ---- FAILED: Error & Reset ---- */}
        {taskStatus === TaskStatus.FAILED && (
          <section className="bg-zinc-900/25 border border-zinc-900 rounded-2xl p-6 backdrop-blur-md">
            <div className="flex items-start gap-3 mb-6">
              <div className="shrink-0 mt-0.5">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-red-300">
                  Render Thất Bại
                </h2>
                <p className="mt-1 text-xs text-red-200/80 leading-normal">
                  {errorMessage || "Hệ thống gặp sự cố trong quá trình xử lý. Vui lòng kiểm tra lại."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium text-xs active:scale-[0.98] transition select-none"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Thử lại</span>
            </button>
          </section>
        )}

        {/* Footer Hint */}
        {taskStatus === TaskStatus.IDLE && (
          <p className="mt-6 text-center text-[10px] font-mono text-zinc-600 select-none">
            Hỗ trợ nền tảng YouTube, TikTok, Douyin và link tải video trực tiếp.
          </p>
        )}
      </div>

      <style>{`
        @keyframes progress {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}

const log = {
  debug: (...args) => {
    if (typeof console !== "undefined" && console.debug) console.debug(...args);
  },
  warn: (...args) => {
    if (typeof console !== "undefined" && console.warn) console.warn(...args);
  },
};