import { useCallback, useRef, useState, useEffect } from "react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Eraser, Loader2, X, AlertTriangle } from "lucide-react";
import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../../config";

const DEFAULT_CROP_PERCENT = 30;

/**
 * @param {Object} props
 * @param {string} props.videoSrc                           URL of the video page (YouTube, TikTok, Douyin or raw URL)
 * @param {(coord: string) => void} [props.onConfirm]      Called with "x:y:w:h"
 * @param {() => void} [props.onCancel]                     Optional close handler
 * @param {number} [props.initialAspect]                    Optional locked aspect ratio (e.g. 16/9)
 * @param {string} [props.title]                            Modal title
 * @param {string} [props.description]                      Modal description text
 */
export default function WatermarkRemover({
  videoSrc,
  onConfirm,
  onCancel,
  initialAspect,
  title = "Xóa logo cứng (Delogo)",
  description = "Vẽ khung chữ nhật che phần logo hoặc phụ đề. Khung vẽ sẽ được trích xuất trực tiếp trên khung hình thực tế của video.",
}) {
  const imageRef = useRef(null);
  const [crop, setCrop] = useState(() =>
    centerCrop(
      makeAspectCrop(
        { unit: "%", width: DEFAULT_CROP_PERCENT },
        initialAspect ?? 16 / 9,
      ),
      100,
      100,
    ),
  );
  const [completedCrop, setCompletedCrop] = useState(null);
  const [completedPercentCrop, setCompletedPercentCrop] = useState(null);

  // Preview frame extraction state
  const [frameUrl, setFrameUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let objectUrl = null;

    async function loadFrame() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await axios.get(
          `${API_BASE_URL_PROVIDER.sync}/api/v1/videos/preview-frame`,
          {
            params: { url: videoSrc },
            responseType: "blob",
          }
        );
        if (active) {
          objectUrl = URL.createObjectURL(response.data);
          setFrameUrl(objectUrl);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to load preview frame:", err);
        if (active) {
          let msg = "Không thể trích xuất khung hình xem trước.";
          if (err.response?.data?.message) {
            msg = err.response.data.message;
          }
          setError(msg);
          setIsLoading(false);
        }
      }
    }

    if (videoSrc) {
      loadFrame();
    } else {
      setError("Đường dẫn video không hợp lệ.");
      setIsLoading(false);
    }

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [videoSrc]);

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const resolveSourceCoords = useCallback((displayCrop) => {
    const img = imageRef.current;
    if (!img) {
      throw new Error("Image element not mounted yet.");
    }
    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    if (!displayW || !displayH) {
      throw new Error("Image has zero display size.");
    }

    const scaleX = img.naturalWidth / displayW;
    const scaleY = img.naturalHeight / displayH;

    const x = displayCrop.x * scaleX;
    const y = displayCrop.y * scaleY;
    const w = displayCrop.width * scaleX;
    const h = displayCrop.height * scaleY;

    return {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
    };
  }, []);

  const resolveSourceCoordsFromPercent = useCallback((percentCrop) => {
    const img = imageRef.current;
    if (!img) throw new Error("Image element not mounted yet.");
    const x = (percentCrop.x / 100) * img.naturalWidth;
    const y = (percentCrop.y / 100) * img.naturalHeight;
    const w = (percentCrop.width / 100) * img.naturalWidth;
    const h = (percentCrop.height / 100) * img.naturalHeight;
    return {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
    };
  }, []);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleCropChange = useCallback((pixelCrop, percentCrop) => {
    setCrop(pixelCrop);
    setCompletedPercentCrop(percentCrop);
  }, []);

  const handleCropComplete = useCallback((pixelCrop, percentCrop) => {
    setCompletedCrop(pixelCrop);
    setCompletedPercentCrop(percentCrop);
  }, []);

  const handleConfirm = useCallback(() => {
    let coords;
    try {
      if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
        coords = resolveSourceCoords(completedCrop);
      } else if (
        completedPercentCrop &&
        completedPercentCrop.width > 0 &&
        completedPercentCrop.height > 0
      ) {
        coords = resolveSourceCoordsFromPercent(completedPercentCrop);
      } else {
        console.warn(
          "[WatermarkRemover] No valid crop selected - draw a box first.",
        );
        return;
      }
    } catch (err) {
      console.error("[WatermarkRemover] coord conversion failed:", err);
      return;
    }

    const coordString = `${coords.x}:${coords.y}:${coords.w}:${coords.h}`;
    console.log("[WatermarkRemover] coordinates confirmed =", coordString);
    if (onConfirm) onConfirm(coordString);
  }, [
    completedCrop,
    completedPercentCrop,
    onConfirm,
    resolveSourceCoords,
    resolveSourceCoordsFromPercent,
  ]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="watermark-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && onCancel) onCancel();
      }}
    >
      <div className="w-full max-w-3xl bg-slate-950 ring-1 ring-white/[0.06] border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <Eraser className="w-5 h-5 text-indigo-400" />
            <h2
              id="watermark-title"
              className="text-lg font-bold text-zinc-100"
            >
              {title}
            </h2>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.06] transition active:scale-[0.98]"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            {description}
          </p>

          <div
            className="relative w-full bg-black rounded-xl overflow-hidden flex items-center justify-center border border-white/[0.06]"
            style={{ minHeight: 360 }}
          >
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 text-sm font-mono gap-3 bg-slate-950/80">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span>Đang trích xuất khung hình từ video (giây thứ 10)...</span>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-rose-400 text-sm font-medium gap-3 bg-slate-950/80">
                <AlertTriangle className="w-8 h-8 text-rose-400" />
                <span className="max-w-md">{error}</span>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const svg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="%2318181b" stroke="%233f3f46" stroke-width="4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23a1a1aa" font-family="sans-serif" font-size="36" font-weight="bold">MÀN HÌNH MẪU NGANG (16:9 - 1080p)</text><text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" fill="%2371717a" font-family="sans-serif" font-size="24">Vẽ ô vuông che logo/phụ đề tại vị trí tương ứng</text></svg>`;
                      setFrameUrl(svg);
                      setError(null);
                    }}
                    className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition active:scale-[0.98]"
                  >
                    Dùng màn hình mẫu ngang (16:9)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const svg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="%2318181b" stroke="%233f3f46" stroke-width="4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23a1a1aa" font-family="sans-serif" font-size="36" font-weight="bold">MÀN HÌNH MẪU DỌC (9:16 - 1080p)</text><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%2371717a" font-family="sans-serif" font-size="24">Vẽ ô vuông che logo/phụ đề tại vị trí tương ứng</text></svg>`;
                      setFrameUrl(svg);
                      setError(null);
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition active:scale-[0.98]"
                  >
                    Dùng màn hình mẫu dọc (9:16)
                  </button>
                </div>
              </div>
            )}

            {frameUrl && !isLoading && (
              <ReactCrop
                crop={crop}
                onChange={handleCropChange}
                onComplete={handleCropComplete}
                keepSelection
                ruleOfThirds
              >
                <img
                  ref={imageRef}
                  src={frameUrl}
                  alt="Khung hình video xem trước"
                  className="max-h-[55vh] max-w-full block object-contain"
                />
              </ReactCrop>
            )}
          </div>

          {/* Live preview */}
          <div className="rounded-xl bg-slate-950 border border-white/[0.06] px-4 py-3">
            <div className="text-xs font-semibold text-slate-500 mb-1 font-mono uppercase tracking-wider">
              Tọa độ (sau khi quy đổi về video gốc)
            </div>
            <div className="font-mono text-sm text-slate-200">
              {(() => {
                try {
                  if (
                    completedCrop &&
                    completedCrop.width > 0 &&
                    completedCrop.height > 0
                  ) {
                    const c = resolveSourceCoords(completedCrop);
                    return `${c.x}:${c.y}:${c.w}:${c.h}`;
                  }
                  if (
                    completedPercentCrop &&
                    completedPercentCrop.width > 0 &&
                    completedPercentCrop.height > 0
                  ) {
                    const c = resolveSourceCoordsFromPercent(
                      completedPercentCrop,
                    );
                    return `${c.x}:${c.y}:${c.w}:${c.h}`;
                  }
                  return "(chưa có)";
                } catch {
                  return "(chưa có)";
                }
              })()}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 text-sm font-semibold transition active:scale-[0.98]"
              >
                Hủy
              </button>
            )}
            <button
              type="button"
              disabled={isLoading || error}
              onClick={handleConfirm}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-sm font-semibold shadow-lg shadow-emerald-500/10 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Eraser className="w-4 h-4" />
              <span>Xác nhận</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
