// ---------------------------------------------------------------------------
// utils/taskMessages.js
//
// Chuyển đổi toàn bộ chi tiết lỗi nội bộ/kỹ thuật từ Engine và Backend
// thành thông điệp thân thiện, dễ hiểu, hướng dẫn rõ ràng cho người dùng.
//
// NGUYÊN TẮC:
// 1. Chỉ hiển thị nguyên nhân khi lỗi liên quan trực tiếp đến thao tác của người dùng
//    (sai link, thiếu credit, video riêng tư, video không có tiếng nói).
// 2. Tuyệt đối KHÔNG hiển thị lỗi code, tên biến kỹ thuật (như sourceLanguage, NameError,
//    timed voiceover assembly failed, stacktrace...). Khi gặp lỗi nội bộ, luôn hiển thị
//    thông báo lịch sự và xác nhận đã hoàn lại 100% credit cho người dùng.
// ---------------------------------------------------------------------------

// 1. Link không hợp lệ hoặc sai định dạng chia sẻ
const INVALID_URL_HINTS = [
  "unsupported url",
  "invalid url",
  "recommend=1",
  "modal_id",
  "cannot parse url",
  "chưa hỗ trợ url",
  "đường dẫn không hợp lệ",
  "link không hợp lệ",
];

// 2. Không đủ credit cho video dài
const INSUFFICIENT_CREDIT_HINTS = [
  "không đủ số dư",
  "cần bổ sung",
  "thời lượng thực tế",
  "insufficient credit",
  "credit_balance",
  "thiếu credit",
];

// 3. Video riêng tư / chặn bản quyền / giới hạn vùng
const SOURCE_BLOCKED_HINTS = [
  "http error 403",
  "forbidden",
  "private video",
  "video unavailable",
  "not available",
  "geo restricted",
  "region",
  "sign in to confirm",
  "login required",
  "bot check",
  "captcha",
];

// 4. Video không có lời thoại / âm thanh rỗng
const NO_SPEECH_HINTS = [
  "source subtitle is empty",
  "empty speech",
  "cannot translate",
  "không tìm thấy lời thoại",
  "không có tiếng người nói",
  "no speech detected",
];

// 5. Video vượt quá giới hạn độ dài (90 phút)
const MAX_DURATION_HINTS = [
  "vượt quá 90 phút",
  "90 minutes",
  "max duration",
  "quá dài",
];

/**
 * Chuẩn hóa và làm sạch thông báo lỗi hiển thị cho người dùng.
 * @param {string} rawMessage - Lỗi thô từ backend hoặc engine
 * @returns {string} - Thông điệp thân thiện, dễ hiểu
 */
export function getPublicTaskFailureMessage(rawMessage) {
  const normalized =
    typeof rawMessage === "string" ? rawMessage.trim().toLowerCase() : "";

  if (!normalized) {
    return "Tác vụ chưa thể hoàn tất lúc này. Số credit của bạn đã được hoàn lại 100%; bạn có thể thử lại sau.";
  }

  // --- NHÓM 1: LỖI LIÊN QUAN ĐẾN THAO TÁC CỦA NGƯỜI DÙNG ---

  // 1. Lỗi không đủ credit xử lý video dài
  if (INSUFFICIENT_CREDIT_HINTS.some((h) => normalized.includes(h))) {
    return "Thời lượng video dài hơn dự kiến và số dư credit chưa đủ để hoàn tất. Bạn vui lòng nạp thêm credit để tiếp tục xử lý video dài này nhé.";
  }

  // 2. Lỗi nhập sai đường dẫn video
  if (INVALID_URL_HINTS.some((h) => normalized.includes(h))) {
    return "Đường dẫn video không đúng định dạng hoặc chưa được hỗ trợ. Bạn vui lòng dùng tính năng 'Chia sẻ' trên ứng dụng (TikTok, Douyin, YouTube, Facebook...) và sao chép đúng link video nhé.";
  }

  // 3. Lỗi video nguồn không có tiếng nói/lời thoại
  if (NO_SPEECH_HINTS.some((h) => normalized.includes(h))) {
    return "Hệ thống không nhận diện được giọng nói hoặc lời thoại trong video này. Bạn hãy chọn video có âm thanh đối thoại/thuyết minh rõ ràng nhé.";
  }

  // 4. Lỗi video riêng tư hoặc bị chặn bản quyền
  if (SOURCE_BLOCKED_HINTS.some((h) => normalized.includes(h))) {
    return "Video nguồn bị đặt ở chế độ riêng tư, chặn bản quyền hoặc hạn chế khu vực. Bạn vui lòng thử lại với một video công khai khác nhé.";
  }

  // 5. Lỗi video quá 90 phút
  if (MAX_DURATION_HINTS.some((h) => normalized.includes(h))) {
    return "Video vượt quá thời lượng tối đa cho phép của hệ thống (90 phút). Vui lòng chọn video có thời lượng ngắn hơn.";
  }

  // --- NHÓM 2: TẤT CẢ CÁC LỖI KỸ THUẬT / LỖI MÃ NGUỒN / HỆ THỐNG NỘI BỘ ---
  // (Bao gồm NameError, sourceLanguage, assembly failed, timeout, syntax, nullpointer...)
  // Tuyệt đối ẩn toàn bộ chi tiết kỹ thuật và trấn an người dùng:
  return "Hệ thống gặp sự cố tạm thời trong quá trình xử lý video. Toàn bộ số credit của bạn đã được hoàn lại 100% vào tài khoản. Bạn vui lòng thử lại sau ít phút nhé.";
}
