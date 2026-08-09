import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { API_BASE_URL_PROVIDER } from "../../config";
import { getPublicTaskFailureMessage } from "../../utils/taskMessages";
import {
  VIDEO_TASK_NOTIFICATION_KEY,
  VIDEO_TASK_STORAGE_KEY,
  getPipelineProgress,
  getPipelineStageLabel,
  publishActiveVideoTask,
  publishVideoTaskStatus,
  readActiveVideoTask,
  sameTaskId,
} from "../../utils/videoTaskProgress";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;
const VISIBLE_POLL_MS = 3000;
const HIDDEN_POLL_MS = 10000;
const NOTIFICATION_AUTO_DISMISS_MS = 30 * 1000;

function normalizeTask(data, previous) {
  const rawStatus = String(data?.status || previous?.status || "PROCESSING").toUpperCase();
  const status = rawStatus === "PENDING" ? "PROCESSING" : rawStatus;
  return {
    ...previous,
    taskId: String(data?.taskId ?? data?.id ?? previous?.taskId ?? ""),
    status,
    url: data?.originalUrl ?? data?.url ?? previous?.url ?? null,
    originalUrl: data?.originalUrl ?? previous?.originalUrl ?? previous?.url ?? null,
    audioMode: data?.audioMode ?? previous?.audioMode ?? "mix",
    voice: data?.voice ?? previous?.voice ?? null,
    targetLanguage: data?.targetLanguage ?? previous?.targetLanguage ?? "Tiếng Việt",
    sourceLanguage: data?.sourceLanguage ?? previous?.sourceLanguage ?? "auto",
    videoUrl: data?.videoUrl ?? data?.resultUrl ?? previous?.videoUrl ?? null,
    srtUrl: data?.srtUrl ?? previous?.srtUrl ?? null,
    message: data?.message ?? data?.note ?? previous?.message ?? null,
    progress: typeof data?.progress === "number"
      ? Math.max(0, Math.min(100, data.progress))
      : (Number(previous?.progress) || 0),
    updatedAt: new Date().toISOString(),
  };
}

function isTerminal(status) {
  return status === "COMPLETED" || status === "FAILED";
}

function readNotification() {
  try {
    const raw = localStorage.getItem(VIDEO_TASK_NOTIFICATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed?.createdAt
      || Date.now() - Date.parse(parsed.createdAt) >= NOTIFICATION_AUTO_DISMISS_MS
    ) {
      localStorage.removeItem(VIDEO_TASK_NOTIFICATION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(VIDEO_TASK_NOTIFICATION_KEY);
    return null;
  }
}

function buildNotification(task) {
  const failed = task.status === "FAILED";
  return {
    key: `${task.taskId}:${task.status}`,
    taskId: task.taskId,
    type: failed ? "error" : "success",
    title: failed ? "Tác vụ chưa hoàn tất" : "Video đã xử lý xong",
    message: failed
      ? getPublicTaskFailureMessage(task.message)
      : "Kết quả đã sẵn sàng. Bạn có thể mở Lịch sử tác vụ để tải video hoặc file SRT.",
    createdAt: new Date().toISOString(),
  };
}

export default function VideoTaskMonitor({ onSettled }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [task, setTask] = useState(() => readActiveVideoTask());
  const [notification, setNotification] = useState(() => readNotification());
  const taskRef = useRef(task);
  const pollTimerRef = useRef(null);
  const requestInFlightRef = useRef(false);
  const dismissNotification = useCallback(() => {
    localStorage.removeItem(VIDEO_TASK_NOTIFICATION_KEY);
    setNotification(null);
  }, []);


  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!notification) return undefined;

    const createdAt = Date.parse(notification.createdAt || "");
    const elapsedMs = Number.isFinite(createdAt) ? Math.max(0, Date.now() - createdAt) : 0;
    const remainingMs = Math.max(0, NOTIFICATION_AUTO_DISMISS_MS - elapsedMs);
    const timeoutId = window.setTimeout(dismissNotification, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [dismissNotification, notification]);

  const persistStatus = useCallback((nextTask) => {
    taskRef.current = nextTask;
    setTask(nextTask);
    publishActiveVideoTask(nextTask);
    publishVideoTaskStatus(nextTask);
  }, []);

  const acceptIncomingTask = useCallback((incoming) => {
    if (!incoming) {
      taskRef.current = null;
      setTask(null);
      return;
    }
    if (
      incoming.taskId
      && taskRef.current?.taskId
      && !sameTaskId(incoming.taskId, taskRef.current.taskId)
      && !isTerminal(taskRef.current.status)
    ) {
      return;
    }
    taskRef.current = incoming;
    setTask(incoming);
  }, []);

  useEffect(() => {
    const onTaskUpdated = (event) => acceptIncomingTask(event.detail ?? readActiveVideoTask());
    const onStorage = (event) => {
      if (event.key === VIDEO_TASK_STORAGE_KEY) acceptIncomingTask(readActiveVideoTask());
      if (event.key === VIDEO_TASK_NOTIFICATION_KEY) setNotification(readNotification());
    };
    window.addEventListener("vietcast:video-task-updated", onTaskUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("vietcast:video-task-updated", onTaskUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, [acceptIncomingTask]);

  const resolveTaskWithoutId = useCallback(async (pending) => {
    if (!pending?.url) return null;
    const { data } = await axios.get(`${API_BASE_URL}/api/v1/tasks`, { timeout: 10000 });
    const tasks = Array.isArray(data) ? data : [];
    const submittedAt = Date.parse(pending.submittedAt || "");
    const match = tasks.find((candidate) => {
      const sameUrl = String(candidate.originalUrl || "").trim() === String(pending.url || "").trim();
      const sameMode = !candidate.audioMode || !pending.audioMode || candidate.audioMode === pending.audioMode;
      const createdAt = Date.parse(candidate.createdAt || "");
      const recentEnough = !Number.isFinite(submittedAt) || !Number.isFinite(createdAt)
        || createdAt >= submittedAt - 15000;
      return sameUrl && sameMode && recentEnough;
    });
    return match ? normalizeTask(match, pending) : null;
  }, []);

  const pollOnce = useCallback(async () => {
    const current = taskRef.current;
    if (!user || !current || isTerminal(current.status) || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    try {
      let nextTask = current;
      if (!current.taskId) {
        const recovered = await resolveTaskWithoutId(current);
        if (!recovered) return;
        nextTask = recovered;
      } else {
        const { data } = await axios.get(
          `${API_BASE_URL}/api/v1/videos/status/${current.taskId}`,
          { timeout: 10000 },
        );
        nextTask = normalizeTask(data, current);
      }

      persistStatus(nextTask);

      if (isTerminal(nextTask.status)) {
        const previousStatus = String(current.status || "").toUpperCase();
        const notificationKey = `${nextTask.taskId}:${nextTask.status}`;
        const existing = readNotification();
        if (!isTerminal(previousStatus) && existing?.key !== notificationKey) {
          const nextNotification = buildNotification(nextTask);
          localStorage.setItem(VIDEO_TASK_NOTIFICATION_KEY, JSON.stringify(nextNotification));
          setNotification(nextNotification);
        }
        onSettled?.();
      }
    } catch (error) {
      // A temporary browser/network outage must never clear the task. The
      // next scheduled tick will retry and the user can keep working.
      if (error?.response?.status === 404) {
        const fallback = {
          ...taskRef.current,
          status: "FAILED",
          progress: 0,
          message: "Không tìm thấy tác vụ. Vui lòng kiểm tra trong Lịch sử tác vụ.",
        };
        persistStatus(fallback);
      } else {
        console.warn("[video-task-monitor] status poll delayed", error?.message || error);
      }
    } finally {
      requestInFlightRef.current = false;
    }
  }, [onSettled, persistStatus, resolveTaskWithoutId, user]);

  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const currentTask = taskRef.current;
    if (!user || !currentTask || isTerminal(currentTask.status)) return undefined;

    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const delay = document.visibilityState === "visible" ? VISIBLE_POLL_MS : HIDDEN_POLL_MS;
      pollTimerRef.current = window.setTimeout(async () => {
        await pollOnce();
        schedule();
      }, delay);
    };

    pollOnce().finally(schedule);
    const onVisibility = () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollOnce().finally(schedule);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollOnce, task?.taskId, task?.status, user]);

  const pipeline = useMemo(() => getPipelineProgress(task || {}), [task]);
  const stageLabel = getPipelineStageLabel(task);
  const showBackgroundCard = task?.status === "PROCESSING" && location.pathname !== "/dashboard";

  return (
    <>
      {showBackgroundCard && (
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="fixed bottom-5 right-5 z-[70] w-[min(390px,calc(100vw-2.5rem))] rounded-2xl border border-indigo-400/25 bg-slate-950/95 p-4 text-left shadow-2xl shadow-indigo-950/30 backdrop-blur-xl transition hover:border-indigo-300/45"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-500/10">
              <Loader2 className="h-4.5 w-4.5 animate-spin text-indigo-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-white">Tác vụ đang chạy nền</span>
                <span className="font-mono text-xs font-semibold text-indigo-200">{task.progress || 0}%</span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-400">{stageLabel}</p>
              <div className="mt-3 flex gap-1.5">
                {pipeline.steps.map((step, index) => (
                  <span
                    key={step.key}
                    title={step.label}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${index < pipeline.completedCount ? "bg-indigo-400" : index === pipeline.activeIndex ? "bg-indigo-300/70 animate-pulse" : "bg-white/10"}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-indigo-300">
                Mở màn hình xử lý <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </button>
      )}

      {notification && (
        <div
          role={notification.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-[80] w-[min(430px,calc(100vw-2.5rem))] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${notification.type === "error" ? "border-rose-400/30 bg-rose-950/95 text-rose-50" : "border-emerald-400/30 bg-emerald-950/95 text-emerald-50"}`}
        >
          <div className="flex items-start gap-3">
            {notification.type === "error" ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />}
            <button type="button" onClick={() => navigate("/video-history")} className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-bold">{notification.title}</span>
              <span className="mt-1 block text-xs leading-relaxed opacity-80">{notification.message}</span>
              <span className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${notification.type === "error" ? "text-rose-300" : "text-emerald-300"}`}>
                {notification.type === "error" ? "Mở lịch sử để thử lại" : "Mở lịch sử để tải xuống"}
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
            <button type="button" onClick={dismissNotification} aria-label="Đóng thông báo" className="rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
