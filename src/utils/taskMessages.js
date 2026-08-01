const SOURCE_UNAVAILABLE_HINTS = [
  "private video",
  "video unavailable",
  "not available",
  "region",
  "geo restricted",
  "login required",
  "sign in",
];

const DOWNLOAD_ACCESS_HINTS = ["fresh cookies", "cookie", "captcha", "bot check", "could not download", "downloaderror"];
const TTS_HINTS = ["tts", "synthesis", "no audio received", "voice", "text-to-speech"];
const TRANSLATION_HINTS = ["translation", "translate", "missing cue", "subtitle incomplete", "gemini"];
const STORAGE_HINTS = ["r2", "upload", "storage", "result url", "could not save"];
const TEMPORARY_HINTS = ["timeout", "timed out", "connection", "429", "502", "503", "504", "temporarily"];

/**
 * Convert engine/backend failure details into customer-facing copy.
 *
 * Raw task messages may contain provider URLs, HTTP status codes, library
 * names or infrastructure details. Those details remain available in the
 * backend and engine logs, but must never be rendered in the customer UI.
 */
export function getPublicTaskFailureMessage(rawMessage) {
  const normalized =
    typeof rawMessage === "string" ? rawMessage.trim().toLowerCase() : "";

  if (SOURCE_UNAVAILABLE_HINTS.some((hint) => normalized.includes(hint))) {
    return "Video nguồn hiện không khả dụng hoặc bị giới hạn truy cập. Vui lòng kiểm tra liên kết và thử lại.";
  }

  if (DOWNLOAD_ACCESS_HINTS.some((hint) => normalized.includes(hint))) {
    return "Nền tảng nguồn đang yêu cầu xác minh thêm nên VietCast chưa tải được video. Vui lòng thử lại sau hoặc dùng một liên kết khác.";
  }

  if (TTS_HINTS.some((hint) => normalized.includes(hint))) {
    return "Dịch vụ tạo giọng tạm thời chưa phản hồi ổn định. Số dư đã trừ sẽ được hoàn tự động; bạn có thể thử lại sau.";
  }

  if (TRANSLATION_HINTS.some((hint) => normalized.includes(hint))) {
    return "Bản dịch chưa đủ nội dung để xuất video an toàn. Số dư đã trừ sẽ được hoàn tự động; bạn có thể chạy lại tác vụ.";
  }

  if (STORAGE_HINTS.some((hint) => normalized.includes(hint))) {
    return "Video đã xử lý nhưng chưa thể lưu kết quả. Số dư đã trừ sẽ được hoàn tự động; vui lòng thử lại sau.";
  }

  if (TEMPORARY_HINTS.some((hint) => normalized.includes(hint))) {
    return "Hệ thống đang bận hoặc kết nối tạm thời không ổn định. Tác vụ đã dừng an toàn và số dư sẽ được hoàn tự động.";
  }

  return "Hệ thống chưa thể hoàn tất video lúc này. Số dư đã trừ sẽ được hoàn tự động; bạn có thể thử lại sau.";
}
