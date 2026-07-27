const SOURCE_UNAVAILABLE_HINTS = [
  "private video",
  "video unavailable",
  "not available",
  "region",
  "geo restricted",
  "login required",
  "sign in",
];

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

  return "Hệ thống chưa thể hoàn tất video lúc này. Credit đã trừ sẽ được hoàn tự động; bạn có thể thử lại sau.";
}
