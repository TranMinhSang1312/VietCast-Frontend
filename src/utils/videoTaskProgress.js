/**
 * Shared progress model for the background video monitor, dashboard and
 * history. The engine sends a human-readable heartbeat message plus a
 * monotonic percentage; this module turns both into a small, predictable
 * pipeline that is easy for users to understand.
 */

export const VIDEO_TASK_STORAGE_KEY = "vc_active_task";
export const VIDEO_TASK_NOTIFICATION_KEY = "vc_task_notification";

const FULL_PIPELINE = Object.freeze([
  { key: "download", label: "Tải video" },
  { key: "audio", label: "Tách audio" },
  { key: "stt", label: "Nhận dạng giọng nói (STT)" },
  { key: "translate", label: "Dịch phụ đề" },
  { key: "tts", label: "Tổng hợp giọng đọc (TTS)" },
  { key: "render", label: "Render và lưu kết quả" },
]);

const SUBTITLE_PIPELINE = Object.freeze([
  FULL_PIPELINE[0],
  FULL_PIPELINE[1],
  FULL_PIPELINE[2],
  FULL_PIPELINE[3],
  { key: "render", label: "Đóng gói file SRT" },
]);

const SIMPLE_PIPELINE = Object.freeze([
  FULL_PIPELINE[0],
  { key: "render", label: "Render và lưu kết quả" },
]);

export function getPipelineSteps(audioMode) {
  if (audioMode === "subtitle") return SUBTITLE_PIPELINE;
  if (audioMode === "original" || audioMode === "mute") return SIMPLE_PIPELINE;
  return FULL_PIPELINE;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function stepFromMessage(message, steps) {
  const text = normalizeText(message);
  if (!text) return -1;
  if (/(download|tai video|source video|tai xuong)/.test(text)) return 0;
  if (/(extract|tach audio|audio)/.test(text)) return Math.min(1, steps.length - 1);
  if (/(transcrib|stt|nhan dang|speech)/.test(text)) {
    return Math.min(steps.findIndex((step) => step.key === "stt"), steps.length - 1);
  }
  if (/(translat|dich|subtitle|phu de)/.test(text)) {
    const index = steps.findIndex((step) => step.key === "translate");
    return index >= 0 ? index : Math.min(steps.length - 1, 2);
  }
  if (/(tts|synth|voice|giong doc|tong hop)/.test(text)) {
    const index = steps.findIndex((step) => step.key === "tts");
    return index >= 0 ? index : Math.min(steps.length - 1, 3);
  }
  if (/(render|mux|upload|hoan thien|dong goi|result)/.test(text)) {
    return steps.length - 1;
  }
  return -1;
}

export function getPipelineProgress({ audioMode, progress = 0, message, status }) {
  const steps = getPipelineSteps(audioMode);
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));

  if (status === "COMPLETED") {
    return { steps, activeIndex: steps.length - 1, completedCount: steps.length, percent: 100 };
  }

  const messageIndex = stepFromMessage(message, steps);
  const percentIndex = Math.min(
    steps.length - 1,
    Math.max(0, Math.floor((safeProgress / 100) * steps.length)),
  );
  const activeIndex = messageIndex >= 0 ? messageIndex : percentIndex;
  const completedCount = status === "FAILED"
    ? Math.min(activeIndex, steps.length)
    : Math.min(activeIndex, steps.length);

  return { steps, activeIndex, completedCount, percent: safeProgress };
}

export function getPipelineStageLabel(task) {
  if (!task) return "Đang chuẩn bị...";
  if (task.status === "COMPLETED") return "Đã hoàn tất";
  if (task.status === "FAILED") return "Đã dừng — credit sẽ được hoàn nếu đủ điều kiện";
  const state = getPipelineProgress(task);
  return state.steps[state.activeIndex]?.label || "Đang xử lý...";
}

export function readActiveVideoTask() {
  try {
    const raw = localStorage.getItem(VIDEO_TASK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function publishActiveVideoTask(task) {
  if (task) {
    localStorage.setItem(VIDEO_TASK_STORAGE_KEY, JSON.stringify(task));
  } else {
    localStorage.removeItem(VIDEO_TASK_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent("vietcast:video-task-updated", { detail: task || null }));
}

export function publishVideoTaskStatus(task) {
  window.dispatchEvent(new CustomEvent("vietcast:video-task-status", { detail: task || null }));
}

export function sameTaskId(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined
    && String(left) === String(right);
}
