import { useCallback, useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Eraser, Loader2, X } from "lucide-react";

const DEFAULT_CROP_PERCENT = 30;

/**
 * @param {Object} props
 * @param {string} props.videoSrc                           URL or blob: of the source video
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
  description = "Kéo chuột để vẽ một ô vuông che logo. Hệ thống sẽ quy đổi tọa độ màn hình sang độ phân giải gốc của video và gửi xuống FFmpeg.",
}) {
  const videoRef = useRef(null);
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
  const [isVideoReady, setIsVideoReady] = useState(false);

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const resolveSourceCoords = useCallback((displayCrop) => {
    const video = videoRef.current;
    if (!video) {
      throw new Error("Video element not mounted yet.");
    }
    const displayW = video.clientWidth;
    const displayH = video.clientHeight;
    if (!displayW || !displayH) {
      throw new Error("Video has zero display size - is it hidden?");
    }

    const scaleX = video.videoWidth / displayW;
    const scaleY = video.videoHeight / displayH;

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
    const video = videoRef.current;
    if (!video) throw new Error("Video element not mounted yet.");
    const x = (percentCrop.x / 100) * video.videoWidth;
    const y = (percentCrop.y / 100) * video.videoHeight;
    const w = (percentCrop.width / 100) * video.videoWidth;
    const h = (percentCrop.height / 100) * video.videoHeight;
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
      <div className="w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <Eraser className="w-5 h-5 text-brand-500" />
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
              className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition active:scale-[0.98]"
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
            className="relative w-full bg-black rounded-xl overflow-hidden flex items-center justify-center border border-zinc-850"
            style={{ minHeight: 320 }}
          >
            {!isVideoReady && (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm font-mono">
                <Loader2 className="w-5 h-5 mr-2 animate-spin text-brand-500" />
                Đang tải video...
              </div>
            )}
            {videoSrc && (
              <ReactCrop
                crop={crop}
                onChange={handleCropChange}
                onComplete={handleCropComplete}
                keepSelection
                ruleOfThirds
              >
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  muted
                  playsInline
                  onLoadedMetadata={() => setIsVideoReady(true)}
                  className="max-h-[55vh] max-w-full block"
                  crossOrigin="anonymous"
                />
              </ReactCrop>
            )}
          </div>

          {/* Live preview */}
          <div className="rounded-xl bg-zinc-950 border border-zinc-850 px-4 py-3">
            <div className="text-xs font-semibold text-zinc-500 mb-1 font-mono uppercase tracking-wider">
              Tọa độ (sau khi quy đổi về video gốc)
            </div>
            <div className="font-mono text-sm text-zinc-200">
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
                className="px-4.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition active:scale-[0.98]"
              >
                Hủy
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-lg shadow-brand-500/10 transition active:scale-[0.98]"
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
