import { useCallback, useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Eraser, Loader2, X } from "lucide-react";

// ---------------------------------------------------------------------------
// WatermarkRemover
// ---------------------------------------------------------------------------
//
// Lets the user mark a rectangular watermark region on a <video> frame and
// returns the coordinates in the SOURCE video's pixel space (x:y:w:h) so the
// FFmpeg `delogo` filter on the engine side knows exactly where to erase.
//
// Conversion pipeline (this is the bit that has to be right):
//
//     <video> clientWidth/clientHeight  -- scaleX/Y -->  videoWidth/videoHeight
//
// We do NOT trust any CSS-reported size because the <video> element scales
// its intrinsic source resolution to whatever pixel box we render it in.
// Instead we read the LIVE clientWidth/clientHeight from the DOM ref on every
// confirm click; React re-renders are not a reliable source for layout.
//
// On confirm we console.log the final `x:y:w:h` string AND call
// `onConfirm(coordString)` so the parent form can stash it into the
// `logoCoordinates` field that travels to the backend (RabbitMQ payload).
// ---------------------------------------------------------------------------

const DEFAULT_CROP_PERCENT = 30;

/**
 * @param {Object} props
 * @param {string} props.videoSrc                           URL or blob: of the source video
 * @param {(coord: string) => void} [props.onConfirm]      Called with "x:y:w:h"
 * @param {() => void} [props.onCancel]                     Optional close handler
 * @param {number} [props.initialAspect]                    Optional locked aspect ratio (e.g. 16/9)
 */
export default function WatermarkRemover({
  videoSrc,
  onConfirm,
  onCancel,
  initialAspect,
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

  /**
   * Convert a crop expressed in display pixels (the ReactCrop default)
   * into the SOURCE video's pixel grid using a live read of the <video>
   * element. We do the multiplication by hand on every confirm so the
   * result is always correct even if the user resized the window
   * between drag and click.
   */
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

  /**
   * Same conversion but from a percent-based crop (the form ReactCrop
   * hands back when `unit: "%"` is used). Useful when the user wants to
   * reason in percent rather than raw display pixels.
   */
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
    // Keep both representations so the user can move the box before
    // letting go of the mouse.
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
    console.log("[WatermarkRemover] logoCoordinates =", coordString);
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
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && onCancel) onCancel();
      }}
    >
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Eraser className="w-5 h-5 text-rose-400" />
            <h2
              id="watermark-title"
              className="text-lg font-semibold text-slate-100"
            >
              Xoa logo cung (Delogo)
            </h2>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              aria-label="Dong"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-400">
            Keo chuot de ve mot o vuong che logo. He thong se quy doi toa do
            man hinh sang do phan giai goc cua video va gui xuong FFmpeg.
          </p>

          {/* Crop stage: video element + ReactCrop overlay share the
              same flex container so the crop box tracks the video's
              actual rendered size. */}
          <div
            className="relative w-full bg-black rounded-xl overflow-hidden flex items-center justify-center"
            style={{ minHeight: 320 }}
          >
            {!isVideoReady && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Dang tai video...
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
                  className="max-h-[60vh] max-w-full block"
                  crossOrigin="anonymous"
                />
              </ReactCrop>
            )}
          </div>

          {/* Live preview of the converted coords so the user can sanity
              check the numbers BEFORE pressing confirm. */}
          <div className="rounded-xl bg-slate-950/50 border border-slate-800 px-4 py-3">
            <div className="text-xs text-slate-500 mb-1">
              Toa do (sau khi quy doi ve video goc)
            </div>
            <div className="font-mono text-sm text-slate-100">
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
                  return "(chua co)";
                } catch {
                  return "(chua co)";
                }
              })()}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
              >
                Huy
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-sm font-semibold shadow-lg shadow-rose-500/30 hover:shadow-rose-500/50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition"
            >
              <Eraser className="w-4 h-4" />
              <span>Xac nhan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
