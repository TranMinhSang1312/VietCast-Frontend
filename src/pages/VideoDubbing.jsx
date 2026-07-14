import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Loader2, Play, RotateCcw, AlertCircle, Link2, Sparkles, XCircle } from "lucide-react";
import { handleApiError } from "../utils/apiError";
import { API_BASE_URL_PROVIDER } from "../config";

// ---------------------------------------------------------------------------
// Status enum — string literals on the wire (matches the backend's
// `VideoTask.Status` exactly) AND the local-only `IDLE` state we
// keep for "user has not submitted yet".
//
// We keep this as a module-level constant so React Fast Refresh
// doesn't recreate the array on every keystroke.
// ---------------------------------------------------------------------------
export const TaskStatus = Object.freeze({
  IDLE: "IDLE",
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

// ---------------------------------------------------------------------------
// Polling cadence. 3s matches the spec. We deliberately do NOT poll
// any faster — the consumer's pipeline takes ~10s of CPU time per
// job, and a faster poll just hammers the server without giving the
// status a real chance to flip.
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 3_000;

// ---------------------------------------------------------------------------
// Endpoints — change here only if the backend renames. The two paths
// live next to each other on purpose so a rename is a single grep
// target.
// ---------------------------------------------------------------------------
const API_BASE_URL = API_BASE_URL_PROVIDER.sync;
const RENDER_ENDPOINT = `${API_BASE_URL}/api/v1/videos/render`;
const taskStatusUrl  = (taskId) => `${API_BASE_URL}/api/v1/tasks/${taskId}`;

/**
 * Statuses that should KEEP the poller running. Anything outside
 * this set (IDLE / COMPLETED / FAILED) means we have nothing to
 * wait for and the interval must stop.
 */
const ACTIVE_STATUSES = new Set([TaskStatus.PENDING, TaskStatus.PROCESSING]);

/**
 * Map a wire-status string (returned by `GET /api/v1/tasks/{id}`)
 * to the local TaskStatus enum. Defaults to FAILED so an unknown
 * value does NOT keep the poller spinning forever.
 */
function normaliseWireStatus(wireStatus) {
  if (typeof wireStatus !== "string") return TaskStatus.FAILED;
  const upper = wireStatus.toUpperCase();
  if (upper === TaskStatus.PENDING)   return TaskStatus.PENDING;
  if (upper === TaskStatus.PROCESSING) return TaskStatus.PROCESSING;
  if (upper === TaskStatus.COMPLETED) return TaskStatus.COMPLETED;
  return TaskStatus.FAILED;
}

/**
 * VideoDubbing — self-contained component that drives the entire
 * "submit URL → wait → show result" lifecycle.
 *
 * State machine:
 *   IDLE ──submit──▶ PENDING ──poll says PROCESSING──▶ PROCESSING
 *                                                     │
 *                          ┌──────────────────────────┴──────────────────┐
 *                          ▼                                              ▼
 *                       COMPLETED                                       FAILED
 *                          │                                              │
 *                          └──── "Làm video khác" ─────────▶ IDLE          │
 *                                                                         │
 *                              "Thử lại" (preserves previous URL) ───────┘
 *
 * The poller is owned by a `useEffect` that ONLY runs when
 * `taskId && ACTIVE_STATUSES.has(taskStatus)`. Returning a cleanup
 * function from the effect guarantees the interval is cleared on
 * unmount AND whenever the dependency array changes (i.e. status
 * flipped to a terminal value, or `taskId` was cleared).
 */
export default function VideoDubbing() {
  // -------------------------------------------------------------------------
  // State — see TaskStatus above for the legal values.
  // -------------------------------------------------------------------------
  const [videoUrl,    setVideoUrl]    = useState("");
  const [taskId,      setTaskId]      = useState(null);
  const [taskStatus,  setTaskStatus]  = useState(TaskStatus.IDLE);
  const [resultUrl,   setResultUrl]   = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  // Tracks the in-flight POST so the submit button can be disabled
  // and the spinner rendered while we wait for the backend's
  // response. Independent of taskStatus because a 202 from the
  // backend sets taskStatus=PENDING immediately.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // -------------------------------------------------------------------------
  // Refs
  //
  // We keep the interval id in a ref (not state) so updates don't
  // trigger a re-render — only the data changes need to.
  // `latestStatusRef` mirrors `taskStatus` synchronously inside the
  // polling callback, where the stale-closure trap on `taskStatus`
  // would otherwise let us schedule one extra poll after a terminal
  // transition.
  // -------------------------------------------------------------------------
  const intervalRef       = useRef(null);
  const latestStatusRef   = useRef(taskStatus);
  const cancelledRef      = useRef(false); // survives StrictMode double-mount

  useEffect(() => { latestStatusRef.current = taskStatus; }, [taskStatus]);

  // -------------------------------------------------------------------------
  // Polling control — two paths lead here:
  //
  //   1. `useEffect` (declarative) when `taskId`/`taskStatus` change.
  //   2. `stopPolling()` from inside the polling callback itself
  //      when the wire reports a terminal state.
  //
  // Both call the same private helper to keep the start/stop logic
  // in one place.
  // -------------------------------------------------------------------------
  const stopPolling = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      log.debug("[poller] stopped");
    }
  }, []);

  const startPolling = useCallback((id) => {
    if (intervalRef.current != null) return; // already polling
    log.debug("[poller] starting for taskId={}", id);

    const tick = async () => {
      // Bail if the component unmounted mid-poll.
      if (cancelledRef.current) {
        stopPolling();
        return;
      }
      try {
        const { data } = await axios.get(taskStatusUrl(id));
        const next = normaliseWireStatus(data?.status);

        // Promote PROCESSING only — we never demote (e.g. PENDING
        // polling arriving AFTER a PROCESSING response would
        // otherwise flash backwards).
        if (next === TaskStatus.PROCESSING &&
            latestStatusRef.current === TaskStatus.PENDING) {
          setTaskStatus(TaskStatus.PROCESSING);
        }

        if (next === TaskStatus.COMPLETED) {
          // Grab the resultUrl BEFORE we stop polling so a
          // re-render from setTaskStatus doesn't race the GET.
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
        // PENDING / PROCESSING → keep polling.
      } catch (err) {
        // A 404 mid-poll means the row was deleted server-side; treat
        // as a hard failure so we don't loop forever on a stale id.
        // Any other error is logged but the poll continues — a flaky
        // network blip shouldn't kill a 10-minute render.
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

    // Fire one tick immediately so a freshly-completed task does
    // NOT make the user wait the full POLL_INTERVAL_MS for the UI
    // to update.
    tick();
    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);
  }, [stopPolling]);

  // -------------------------------------------------------------------------
  // Effect: drive the poller's lifecycle from state.
  //
  // We intentionally put `startPolling` / `stopPolling` in the dep
  // array — they're stable useCallbacks, but lint rules demand they
  // be listed. The CLEANUP function returned from this effect is
  // what guarantees the interval is cleared on unmount AND when
  // taskId/status change before the next render.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (taskId && ACTIVE_STATUSES.has(taskStatus)) {
      startPolling(taskId);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [taskId, taskStatus, startPolling, stopPolling]);

  // -------------------------------------------------------------------------
  // Effect: belt-and-suspenders cleanup on unmount. The effect above
  // already clears the interval when taskId becomes null, but
  // StrictMode and route changes can unmount the component with the
  // interval still referenced, leaving a dangling timer that pings
  // a dead component. Setting the cancelled flag + stopping the
  // interval here is cheap insurance.
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      stopPolling();
    };
  }, [stopPolling]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  /**
   * Submit the URL to the render endpoint and bootstrap the
   * poller. The backend returns 202 with `{ taskId, status, ... }`
   * and we use that to drive the UI.
   *
   * <p>The button is disabled while `isSubmitting` is true to
   * prevent a double-tap from enqueuing two tasks and confusing the
   * user with two simultaneous poller loops.
   */
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
        // audioMode defaults to "mix" server-side; we send it
        // explicitly so the contract is visible at the call site.
        audioMode: "mix",
      });

      // The dispatcher returns the Long DB id as a string in
      // `taskId`. Normalise to a string here so downstream code can
      // assume one type.
      const newTaskId =
        typeof data?.taskId === "string" || typeof data?.taskId === "number"
          ? String(data.taskId)
          : null;

      if (!newTaskId) {
        throw new Error("Phản hồi từ máy chủ không chứa taskId.");
      }

      setTaskId(newTaskId);
      // Seed the poller with PENDING; the first GET will usually
      // already be PROCESSING by then.
      setTaskStatus(TaskStatus.PENDING);
    } catch (err) {
      const processed = handleApiError(err);
      setErrorMessage(processed.message);
      setTaskStatus(TaskStatus.FAILED);
    } finally {
      setIsSubmitting(false);
    }
  }, [videoUrl]);

  /**
   * Reset the entire flow to IDLE. Used by both "Làm video khác"
   * (after COMPLETED) and "Thử lại" (after FAILED).
   *
   * <p>We deliberately KEEP the previous `videoUrl` — the user may
   * want to retry the exact same URL with a fresh render.
   */
  const handleReset = useCallback(() => {
    stopPolling();
    setTaskId(null);
    setResultUrl(null);
    setErrorMessage(null);
    setTaskStatus(TaskStatus.IDLE);
  }, [stopPolling]);

  // -------------------------------------------------------------------------
  // Render — branched on taskStatus. Each branch is small enough to
  // read at a glance and exposes only the controls the user needs in
  // that state.
  // -------------------------------------------------------------------------

  const isWorking = taskStatus === TaskStatus.PENDING || taskStatus === TaskStatus.PROCESSING;

  return (
    <div className="min-h-screen w-full px-4 py-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-start justify-center">
      <div className="w-full max-w-2xl">
        {/* Header — always visible so the user knows what page they're on. */}
        <header className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/30 mb-4">
            <Sparkles className="w-7 h-7 text-brand-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-white via-slate-200 to-brand-500 bg-clip-text text-transparent">
            Lồng tiếng video bằng AI
          </h1>
          <p className="mt-2 text-slate-400 text-sm">
            Dán URL video bất kỳ, hệ thống sẽ tự động dịch và lồng tiếng.
          </p>
        </header>

        {/* ---- IDLE: input form ---- */}
        {taskStatus === TaskStatus.IDLE && (
          <section
            aria-label="Bắt đầu lồng tiếng"
            className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 p-6 md:p-8"
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="videoUrl"
                  className="block text-sm font-medium text-slate-300 mb-2"
                >
                  URL video
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link2 className="w-5 h-5 text-slate-500" />
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
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50"
                    required
                  />
                </div>
                {errorMessage && (
                  <p className="mt-2 text-sm text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !videoUrl.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang gửi yêu cầu...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Bắt đầu lồng tiếng</span>
                  </>
                )}
              </button>
            </form>
          </section>
        )}

        {/* ---- PENDING / PROCESSING: animated progress ---- */}
        {isWorking && (
          <section
            aria-live="polite"
            aria-label="Đang xử lý"
            className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 p-8 md:p-10"
          >
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                {/* Outer ring — slow rotation, soft glow. */}
                <div className="absolute inset-0 rounded-full bg-brand-500/20 blur-2xl animate-pulse" />
                <Loader2 className="relative w-16 h-16 text-brand-500 animate-spin" strokeWidth={2} />
              </div>

              <h2 className="text-xl font-semibold text-slate-100">
                {taskStatus === TaskStatus.PENDING
                  ? "Đã nhận yêu cầu, đang xếp hàng..."
                  : "Hệ thống đang xử lý..."}
              </h2>

              <p className="mt-3 text-slate-400 leading-relaxed max-w-md">
                Hệ thống đang xử lý, vui lòng chờ trong giây lát.
                <br />
                Bạn có thể để treo máy và làm việc khác...
              </p>

              {taskId && (
                <p className="mt-4 text-xs text-slate-500 font-mono">
                  Task ID: {taskId}
                </p>
              )}

              {/* Indeterminate progress bar — gives the user a sense
                  that the system is alive even when the pipeline is
                  mid-step. Pure CSS animation; no extra deps. */}
              <div className="mt-6 w-full max-w-sm h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-gradient-to-r from-brand-400 via-brand-500 to-brand-400 rounded-full animate-[progress_1.6s_ease-in-out_infinite]" />
              </div>
            </div>
          </section>
        )}

        {/* ---- COMPLETED: video player + reset ---- */}
        {taskStatus === TaskStatus.COMPLETED && (
          <section
            aria-label="Video đã hoàn thành"
            className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 p-6 md:p-8 space-y-5"
          >
            <div className="flex items-center gap-2 text-emerald-400">
              <Play className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Video đã sẵn sàng</h2>
            </div>

            {resultUrl ? (
              <video
                key={resultUrl}
                src={resultUrl}
                controls
                preload="metadata"
                className="w-full aspect-video rounded-xl bg-black border border-slate-800"
              >
                Trình duyệt của bạn không hỗ trợ thẻ video.
              </video>
            ) : (
              <div className="w-full aspect-video rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500 text-sm">
                Không tìm thấy link kết quả.
              </div>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold border border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition"
            >
              <RotateCcw className="w-5 h-5" />
              <span>Làm video khác</span>
            </button>
          </section>
        )}

        {/* ---- FAILED: error + retry ---- */}
        {taskStatus === TaskStatus.FAILED && (
          <section
            role="alert"
            aria-label="Tác vụ thất bại"
            className="bg-slate-900/60 backdrop-blur-xl border border-red-800/60 rounded-2xl shadow-2xl shadow-black/40 p-6 md:p-8"
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="shrink-0 mt-0.5">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-red-300">
                  Xử lý thất bại
                </h2>
                <p className="mt-1 text-sm text-red-200/80">
                  {errorMessage || "Đã xảy ra lỗi không xác định. Vui lòng thử lại."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold shadow-lg shadow-brand-500/30 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition"
            >
              <RotateCcw className="w-5 h-5" />
              <span>Thử lại</span>
            </button>
          </section>
        )}

        {/* Footer hint — only shown when nothing is in flight. */}
        {taskStatus === TaskStatus.IDLE && (
          <p className="mt-6 text-center text-xs text-slate-500">
            Hỗ trợ YouTube, TikTok, và các URL trực tiếp (.mp4).
          </p>
        )}
      </div>

      {/* Inline keyframes for the indeterminate progress bar. Tailwind
          does not ship these, so we add them locally with a single
          @keyframes rule. The animation slides a 1/3-width segment
          from 0% → 100% on the bar's track. */}
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

// ---------------------------------------------------------------------------
// Module-private logger that respects `process.env.NODE_ENV`.
// We deliberately do NOT use the `loglevel` / `winston` packages — the
// console is good enough for a renderer-side helper, and keeping the
// surface tiny means no `npm install` gymnastics.
// ---------------------------------------------------------------------------
const log = {
  debug: (...args) => {
    if (typeof console !== "undefined" && console.debug) console.debug(...args);
  },
  warn: (...args) => {
    if (typeof console !== "undefined" && console.warn) console.warn(...args);
  },
};