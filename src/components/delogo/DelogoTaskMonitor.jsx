import { useEffect } from "react";
import axios from "axios";
import { CheckCircle2, X, AlertCircle } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL_PROVIDER } from "../../config";
import { getPublicTaskFailureMessage } from "../../utils/taskMessages";
import {
  DELOGO_PENDING_TASK_KEY,
  dismissDelogoNotification,
  resumeDelogoTask,
  setDelogoTaskCompleted,
  setDelogoTaskFailed,
} from "../../store/slices/delogoSlice";

const POLL_INTERVAL_MS = 3000;

export default function DelogoTaskMonitor({ onSettled }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { taskInfo, notification } = useSelector((state) => state.delogo);

  useEffect(() => {
    if (taskInfo.taskId) return;
    const pendingTaskId = localStorage.getItem(DELOGO_PENDING_TASK_KEY);
    if (pendingTaskId) {
      dispatch(resumeDelogoTask(pendingTaskId));
    }
  }, [dispatch, taskInfo.taskId]);

  useEffect(() => {
    if (taskInfo.status !== "PROCESSING" || !taskInfo.taskId) return undefined;

    let cancelled = false;
    let timeoutId;

    const fetchStatus = async () => {
      let settled = false;
      try {
        const { data } = await axios.get(
          `${API_BASE_URL_PROVIDER.sync}/api/v1/tasks/${taskInfo.taskId}`,
          { timeout: 10000 }
        );
        if (cancelled) return;

        const status = String(data?.status || "").toUpperCase();
        if (status === "SUCCESS" || status === "COMPLETED") {
          settled = true;
          localStorage.removeItem(DELOGO_PENDING_TASK_KEY);
          dispatch(
            setDelogoTaskCompleted({
              taskId: data.taskId ?? data.id ?? taskInfo.taskId,
              videoUrl: data.resultUrl ?? data.videoUrl ?? null,
            })
          );
          onSettled?.();
        } else if (status === "FAILED" || status === "ERROR") {
          settled = true;
          localStorage.removeItem(DELOGO_PENDING_TASK_KEY);
          dispatch(
            setDelogoTaskFailed(
              getPublicTaskFailureMessage(data.errorMessage ?? data.message ?? data.note)
            )
          );
          onSettled?.();
        }
      } catch (error) {
        // A temporary polling/network failure must not erase an active task.
        // The next scheduled poll will retry; raw details stay in DevTools.
        console.error("[delogo-monitor] Không thể cập nhật trạng thái tác vụ", error);
      } finally {
        if (!cancelled && !settled) {
          timeoutId = window.setTimeout(fetchStatus, POLL_INTERVAL_MS);
        }
      }
    };

    fetchStatus();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [dispatch, onSettled, taskInfo.status, taskInfo.taskId]);

  useEffect(() => {
    if (!notification) return undefined;
    const timeoutId = window.setTimeout(() => {
      dispatch(dismissDelogoNotification());
    }, 10000);
    return () => window.clearTimeout(timeoutId);
  }, [dispatch, notification]);

  if (!notification) return null;

  const isSuccess = notification.type === "success";
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      role={isSuccess ? "status" : "alert"}
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-[80] w-[min(420px,calc(100vw-2.5rem))] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${
        isSuccess
          ? "border-emerald-400/30 bg-emerald-950/95 text-emerald-50"
          : "border-rose-400/30 bg-rose-950/95 text-rose-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${isSuccess ? "text-emerald-300" : "text-rose-300"}`} />
        <button
          type="button"
          onClick={() => {
            dispatch(dismissDelogoNotification());
            navigate("/watermark-remover");
          }}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block text-sm font-bold">{notification.title}</span>
          <span className="mt-1 block text-xs leading-relaxed opacity-75">
            {notification.message}
          </span>
          {isSuccess && (
            <span className="mt-2 block text-xs font-semibold text-emerald-300">
              Mở kết quả →
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => dispatch(dismissDelogoNotification())}
          aria-label="Đóng thông báo"
          className="rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
