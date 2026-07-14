// Centralised API error handling for the renderer.
//
// Goal: turn axios/network errors into a single, predictable shape that
// the UI can render directly:
//
//   {
//     status: 401,         // HTTP status or 0 for network errors
//     code: "AUTH_FAILED", // machine-readable tag
//     message: "Tên đăng nhập hoặc mật khẩu không chính xác.",
//     raw: <original error> // kept for diagnostics, never shown to users
//   }
//
// Priority for `message`:
//   1. Backend-supplied message (response.data.message or
//      response.data.error) — UNLESS it looks like a Java stack trace.
//   2. Vietnamese fallback mapped from the HTTP status code.
//   3. Generic "Lỗi không xác định." for anything we don't recognise.
//
// Why a separate file rather than an axios interceptor?
// The renderer can recover from some errors by retrying (VideoHistory
// polls every 7s) — those flows want the *structured* info. An
// interceptor would still need to expose the same shape, so we keep
// the helper as the source of truth and let components opt in via
// `handleApiError(err)`.

// Substrings that strongly suggest the payload is a server-side stack
// trace rather than a user-facing message. We treat any of these as
// "do NOT surface to the end user".
const STACK_TRACE_HINTS = [
  "Exception",
  "Error at",
  "java.lang.",
  "javax.",
  "org.springframework",
  "at ",
  "Caused by",
  "\n\tat ",
];

function looksLikeStackTrace(text) {
  if (!text || typeof text !== "string") return false;
  // A real stack trace almost always contains "\n\tat " (new-line +
  // tab + "at ") — common Java formatting. Single-line messages rarely
  // contain both a class path AND "Exception".
  if (text.includes("\n\tat ") || text.includes("\n  at ")) return true;
  // Count how many red-flag substrings appear; >=2 means it's almost
  // certainly a dump rather than a friendly message.
  let hits = 0;
  for (const hint of STACK_TRACE_HINTS) {
    if (text.includes(hint)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

const STATUS_VI = {
  400: "Dữ liệu không hợp lệ, vui lòng kiểm tra lại.",
  401: "Tên đăng nhập hoặc mật khẩu không chính xác.",
  403: "Bạn không có quyền thực hiện thao tác này.",
  404: "Không tìm thấy dữ liệu hệ thống.",
  408: "Yêu cầu quá thời gian, vui lòng thử lại.",
  409: "Dữ liệu đã tồn tại hoặc xung đột, vui lòng tải lại trang.",
  413: "Tệp quá lớn, vui lòng chọn tệp nhỏ hơn.",
  415: "Định dạng dữ liệu không được hỗ trợ.",
  422: "Dữ liệu không hợp lệ, vui lòng kiểm tra lại.",
  429: "Bạn đã gửi quá nhiều yêu cầu, vui lòng chờ một chút rồi thử lại.",
};

const STATUS_CODES = {
  400: "BAD_REQUEST",
  401: "AUTH_FAILED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  408: "TIMEOUT",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA",
  422: "UNPROCESSABLE",
  429: "RATE_LIMITED",
};

function fallbackForStatus(status) {
  if (typeof status === "number" && status >= 500) {
    return {
      message: "Hệ thống máy chủ đang bận, vui lòng thử lại sau.",
      code: "SERVER_ERROR",
    };
  }
  if (STATUS_VI[status]) {
    return { message: STATUS_VI[status], code: STATUS_CODES[status] || "HTTP_ERROR" };
  }
  return {
    message: "Đã xảy ra lỗi, vui lòng thử lại.",
    code: "UNKNOWN",
  };
}

/**
 * Extract a server-supplied message from common payload shapes:
 *   { message: "..." }
 *   { error:   "..." }
 *   { errors: { field: "..." } }        → flattened, joined
 *   { data:    { message: "..." } }
 * Always returns a string, never the raw object.
 */
function extractServerMessage(data) {
  if (data == null) return null;
  if (typeof data === "string") return data;

  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (typeof data.error === "string" && data.error.trim()) {
    // Avoid surfacing the literal string "Internal Server Error" which
    // some frameworks put in `error` — it adds nothing.
    if (/^internal server error$/i.test(data.error.trim())) return null;
    return data.error;
  }

  // Spring Boot's `MethodArgumentNotValidException` puts field-level
  // messages under `errors` / `fieldErrors`. Flatten them so the user
  // sees something readable.
  if (data.errors && typeof data.errors === "object") {
    const parts = [];
    for (const [field, msgs] of Object.entries(data.errors)) {
      if (Array.isArray(msgs)) parts.push(`${field}: ${msgs.join(", ")}`);
      else if (typeof msgs === "string") parts.push(`${field}: ${msgs}`);
    }
    if (parts.length) return parts.join("; ");
  }
  if (Array.isArray(data.fieldErrors)) {
    const parts = data.fieldErrors
      .map((e) => (e?.field && e?.message ? `${e.field}: ${e.message}` : null))
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }

  if (data.data && typeof data.data === "object") {
    const inner = extractServerMessage(data.data);
    if (inner) return inner;
  }

  return null;
}

/**
 * Translate any axios / network / unknown error into a UI-ready shape.
 *
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string, raw: unknown }}
 */
export function handleApiError(err) {
  // Already-processed error (e.g. rethrown by an interceptor). Avoid
  // double-wrapping so the original message sticks.
  if (err && typeof err === "object" && "apiError" in err && err.apiError) {
    return /** @type {any} */ (err);
  }

  // Network / no-response: axios sets `err.request` and leaves
  // `err.response` undefined.
  if (err && typeof err === "object" && "request" in err && !err.response) {
    return {
      status: 0,
      code: "NETWORK_ERROR",
      message: "Lỗi kết nối mạng. Không thể kết nối đến máy chủ.",
      raw: err,
    };
  }

  const response = err && typeof err === "object" ? err.response : null;
  const status = response?.status;

  if (typeof status === "number") {
    const serverMessage = extractServerMessage(response?.data);
    const fallback = fallbackForStatus(status);

    // Use server message only if it looks user-safe.
    const useServer =
      typeof serverMessage === "string" &&
      serverMessage.trim().length > 0 &&
      !looksLikeStackTrace(serverMessage);

    return {
      status,
      code: fallback.code,
      message: useServer ? serverMessage.trim() : fallback.message,
      raw: err,
    };
  }

  // Unknown shape — `err.message` may itself be a stack trace, so guard.
  const generic = err && typeof err === "object" && typeof err.message === "string"
    ? err.message
    : null;
  if (generic && !looksLikeStackTrace(generic)) {
    return {
      status: 0,
      code: "UNKNOWN",
      message: generic,
      raw: err,
    };
  }

  return {
    status: 0,
    code: "UNKNOWN",
    message: "Đã xảy ra lỗi không xác định, vui lòng thử lại.",
    raw: err,
  };
}

/**
 * Convenience: rethrow a processed error so `catch (err) { throw
 * handleApiError(err); }` works. The thrown object is a normal Error
 * so existing `instanceof Error` checks in callers keep working.
 */
export class ApiError extends Error {
  constructor(apiError) {
    super(apiError.message);
    this.name = "ApiError";
    this.apiError = true;
    this.status = apiError.status;
    this.code = apiError.code;
    this.raw = apiError.raw;
  }
}