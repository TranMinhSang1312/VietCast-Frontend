import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

export const MAX_VIDEO_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

const ALLOWED_VIDEO_TYPES = Object.freeze({
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
});

function getExtension(fileName = "") {
  const separator = fileName.lastIndexOf(".");
  return separator >= 0 ? fileName.slice(separator + 1).toLowerCase() : "";
}

export function validateVideoUploadFile(file) {
  if (!file) throw new Error("Vui lòng chọn một tệp video.");
  if (file.size <= 0) throw new Error("Tệp video không được trống.");
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error("Tệp video vượt quá giới hạn 2 GB.");
  }

  const extension = getExtension(file.name);
  const expectedType = ALLOWED_VIDEO_TYPES[extension];
  if (!expectedType) {
    throw new Error("Chỉ hỗ trợ video MP4, MOV hoặc WebM.");
  }
  if (file.type !== expectedType) {
    throw new Error(`Định dạng tệp không khớp với phần mở rộng ${extension.toUpperCase()}.`);
  }

  return { extension, contentType: expectedType };
}

export async function requestVideoUploadTicket(file, signal) {
  const { contentType } = validateVideoUploadFile(file);
  const response = await axios.post(
    `${API_BASE_URL_PROVIDER.sync}/api/v1/videos/uploads/presign`,
    {
      fileName: file.name,
      contentType,
      fileSize: file.size,
    },
    { signal }
  );

  const ticket = response.data;
  if (!ticket?.uploadUrl || !ticket?.publicUrl || ticket.method !== "PUT") {
    throw new Error("Máy chủ không trả về thông tin upload hợp lệ.");
  }
  return ticket;
}

export function uploadVideoToR2({ file, ticket, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastProgress = -1;

    const cleanup = () => signal?.removeEventListener("abort", abortUpload);
    const abortUpload = () => xhr.abort();

    xhr.open("PUT", ticket.uploadUrl, true);
    xhr.setRequestHeader("Content-Type", ticket.contentType);

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      if (percent === lastProgress) return;
      lastProgress = percent;
      onProgress?.(percent);
    });
    xhr.addEventListener("load", () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(ticket.publicUrl);
        return;
      }
      reject(new Error(`R2 từ chối upload video (HTTP ${xhr.status}).`));
    });
    xhr.addEventListener("error", () => {
      cleanup();
      reject(new Error("Không thể kết nối R2. Hãy kiểm tra CORS của bucket và thử lại."));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Upload cancelled", "AbortError"));
    });

    if (signal?.aborted) {
      abortUpload();
      return;
    }
    signal?.addEventListener("abort", abortUpload, { once: true });
    xhr.send(file);
  });
}

export function isVideoUploadCancelled(error, signal) {
  return Boolean(
    signal?.aborted
    || error?.name === "AbortError"
    || error?.code === "ERR_CANCELED"
  );
}
