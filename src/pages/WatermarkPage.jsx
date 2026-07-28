import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { 
  Eraser, 
  UploadSimple, 
  Scissors, 
  CheckCircle, 
  DownloadSimple, 
  PlayCircle,
  WarningCircle,
  Sparkle,
  XCircle,
} from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";
import ReactCrop, { centerCrop, convertToPixelCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { API_BASE_URL_PROVIDER } from "../config";
import { PRICING } from "../config/pricing";
import { handleApiError } from "../utils/apiError";
import {
  isVideoUploadCancelled,
  requestVideoUploadTicket,
  uploadVideoToR2,
  validateVideoUploadFile,
} from "../services/videoUpload";
import {
  DELOGO_PENDING_TASK_KEY,
  beginDelogoSubmission,
  resetDelogoState,
  setDelogoError,
  setDelogoSubmissionStopped,
  setDelogoTaskProcessing,
  setDelogoUploadProgress,
  setLogoCoords,
  setSelectedVideo,
  setSubMaskCoords,
  setVideoMetadata,
} from "../store/slices/delogoSlice";

export default function WatermarkPage() {
  const dispatch = useDispatch();
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const uploadAbortControllerRef = useRef(null);
  const {
    selectedFile,
    videoObjectUrl,
    logoCoords,
    subMaskCoords,
    durationSeconds,
    videoDimensions,
    isSubmitting,
    isUploading,
    uploadProgress,
    uploadProgressMsg,
    error,
    taskInfo,
  } = useSelector((state) => state.delogo);
  const taskResult = taskInfo.status === "IDLE" ? null : taskInfo;
  const taskLocked = taskInfo.status !== "IDLE";
  const fileSelectionLocked = taskLocked || isSubmitting;

  // Active Crop Modal
  const [activeCropTarget, setActiveCropTarget] = useState(null); // 'logo' | 'subMask' | null
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [frameCanvasUrl, setFrameCanvasUrl] = useState(null);

  useEffect(() => {
    return () => uploadAbortControllerRef.current?.abort();
  }, []);

  const selectVideoFile = (file) => {
    if (fileSelectionLocked || !file) return;

    try {
      validateVideoUploadFile(file);
    } catch (validationError) {
      dispatch(setDelogoError(validationError.message));
      return;
    }

    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    const url = URL.createObjectURL(file);
    dispatch(setSelectedVideo({ file, objectUrl: url }));
  };

  // Handle local file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    selectVideoFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    if (fileSelectionLocked) return;
    selectVideoFile(event.dataTransfer.files?.[0]);
  };

  const handleCancelUpload = () => {
    if (isUploading) {
      uploadAbortControllerRef.current?.abort();
    }
  };

  // Video loaded metadata
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 0;
      const w = videoRef.current.videoWidth || 0;
      const h = videoRef.current.videoHeight || 0;
      dispatch(
        setVideoMetadata({
          durationSeconds: Math.round(dur),
          videoDimensions: { width: w, height: h },
        })
      );
    }
  };

  // Capture current video frame to canvas for ReactCrop modal
  const captureVideoFrame = (targetType) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      dispatch(setDelogoError("Hãy tải video và chờ khung hình hiển thị trước khi khoanh vùng."));
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/png");
    setFrameCanvasUrl(dataUrl);

    // Initial crop
    const aspect = video.videoWidth / video.videoHeight;
    const initCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 25 }, aspect, video.videoWidth, video.videoHeight),
      video.videoWidth,
      video.videoHeight
    );
    setCrop(initCrop);
    setCompletedCrop(null);
    setActiveCropTarget(targetType);
  };

  // Confirm crop modal
  const handleConfirmCrop = () => {
    if (!crop || !videoDimensions.width) return;

    const img = document.getElementById("crop-frame-img");
    if (!img) return;

    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    if (!displayW || !displayH) return;

    const effectiveCrop = completedCrop ?? convertToPixelCrop(crop, displayW, displayH);
    const sourceW = img.naturalWidth || videoDimensions.width;
    const sourceH = img.naturalHeight || videoDimensions.height;

    const scaleX = sourceW / displayW;
    const scaleY = sourceH / displayH;

    let x = Math.floor(effectiveCrop.x * scaleX);
    let y = Math.floor(effectiveCrop.y * scaleY);
    let w = Math.floor(effectiveCrop.width * scaleX);
    let h = Math.floor(effectiveCrop.height * scaleY);

    // Clamping
    x = Math.max(0, Math.min(x, sourceW - 1));
    y = Math.max(0, Math.min(y, sourceH - 1));
    w = Math.max(1, Math.min(w, sourceW - x));
    h = Math.max(1, Math.min(h, sourceH - y));

    const coordsObj = { x, y, w, h, str: `${x}:${y}:${w}:${h}` };

    if (activeCropTarget === "logo") {
      dispatch(setLogoCoords(coordsObj));
    } else if (activeCropTarget === "subMask") {
      dispatch(setSubMaskCoords(coordsObj));
    }

    setActiveCropTarget(null);
  };

  const billableMinutes = Math.max(1, durationSeconds / 60);
  const filterCost = Math.round(billableMinutes * PRICING.visualFilterPerMinute);
  const totalCost = Math.max(PRICING.visualFilterPerMinute, filterCost);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      dispatch(setDelogoError("Vui lòng chọn tệp video từ thiết bị trước khi khởi tạo."));
      return;
    }
    if (!logoCoords && !subMaskCoords) {
      dispatch(setDelogoError("Vui lòng khoanh vùng ít nhất 1 khu vực (Logo hoặc Phụ đề gốc) để xử lý."));
      return;
    }

    dispatch(beginDelogoSubmission());
    const uploadController = new AbortController();
    uploadAbortControllerRef.current = uploadController;

    try {
      const uploadTicket = await requestVideoUploadTicket(
        selectedFile,
        uploadController.signal
      );
      const r2VideoUrl = await uploadVideoToR2({
        file: selectedFile,
        ticket: uploadTicket,
        signal: uploadController.signal,
        onProgress: (percent) => dispatch(setDelogoUploadProgress({
          progress: percent,
          message: `Đang tải video lên R2: ${percent}%`,
        })),
      });

      uploadAbortControllerRef.current = null;
      dispatch(setDelogoUploadProgress({
        progress: 100,
        isUploading: false,
        message: "Upload hoàn tất. Đang khởi tạo tác vụ...",
      }));

      // Step 2: Submit process payload with the real public R2 video URL
      const payload = {
        url: r2VideoUrl,
        audioMode: "original",
        logoCoordinates: logoCoords ? logoCoords.str : null,
        subtitleMask: subMaskCoords ? subMaskCoords.str : null,
        hardsub: false,
      };

      const res = await axios.post(
        `${API_BASE_URL_PROVIDER.sync}/api/v1/videos/process`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );

      const taskId = res.data?.taskId || res.data?.id;
      if (!taskId) {
        throw new Error("Không nhận được mã tác vụ từ hệ thống.");
      }
      localStorage.setItem(DELOGO_PENDING_TASK_KEY, String(taskId));
      dispatch(setDelogoTaskProcessing(taskId));
    } catch (err) {
      console.error(err);
      if (isVideoUploadCancelled(err, uploadController.signal)) {
        dispatch(setDelogoSubmissionStopped());
        return;
      }
      dispatch(
        setDelogoError(
          handleApiError(err).message ||
            "Không thể khởi tạo tác vụ xóa Logo. Vui lòng thử lại."
        )
      );
      dispatch(setDelogoSubmissionStopped());
    } finally {
      uploadAbortControllerRef.current = null;
    }
  };

  const handleReset = () => {
    if (videoObjectUrl) {
      URL.revokeObjectURL(videoObjectUrl);
    }
    localStorage.removeItem(DELOGO_PENDING_TASK_KEY);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setActiveCropTarget(null);
    setCrop(null);
    setCompletedCrop(null);
    setFrameCanvasUrl(null);
    dispatch(resetDelogoState());
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-3 py-5 sm:space-y-8 sm:px-4 sm:py-8">
      {/* Title Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
          <Eraser size={16} weight="duotone" />
          <span>Công cụ Studio Độc lập</span>
        </div>
        <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-3xl">
          Xóa Logo & Làm Mờ Phụ Đề Gốc (Delogo Studio)
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
          Chọn video từ thiết bị để khoanh vùng trực tiếp trên khung hình thực tế. Công cụ sẽ tự động loại bỏ watermark, logo hoặc làm mờ phụ đề gốc.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input & Cropping Area */}
        <div className="lg:col-span-7 space-y-6">
          {/* File Upload Zone - Direct Local File Selection */}
          <div
            onClick={(event) => {
              if (!fileSelectionLocked && event.target !== fileInputRef.current) {
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              if (!fileSelectionLocked) event.preventDefault();
            }}
            onDrop={handleDrop}
            onKeyDown={(event) => {
              if (!fileSelectionLocked && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={fileSelectionLocked ? -1 : 0}
            aria-disabled={fileSelectionLocked}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition select-none ${
              fileSelectionLocked
                ? "cursor-not-allowed border-white/[0.06] bg-white/[0.02] opacity-60"
                : "cursor-pointer border-indigo-500/30 bg-indigo-500/[0.02] hover:border-indigo-400/60 hover:bg-indigo-500/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
              aria-label="Chọn video để xóa logo hoặc che phụ đề"
              disabled={fileSelectionLocked}
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mx-auto flex items-center justify-center mb-3">
              <UploadSimple size={24} weight="duotone" />
            </div>
            <p className="text-sm font-semibold text-slate-200">
              {selectedFile ? (
                `Đã chọn: ${selectedFile.name}`
              ) : (
                <>
                  <span className="sm:hidden">Chạm để chọn video từ thư viện</span>
                  <span className="hidden sm:inline">Nhấp để chọn hoặc kéo thả video vào đây</span>
                </>
              )}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              MP4, MOV hoặc WebM. Tối đa 2 GB.
            </p>
          </div>

          {isUploading && (
            <div className="rounded-xl border border-indigo-400/20 bg-indigo-400/[0.05] p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-indigo-200">
                  {uploadProgressMsg || "Đang tải video..."}
                </span>
                <span className="shrink-0 font-mono font-bold text-white">{uploadProgress}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                className="h-2 overflow-hidden rounded-full bg-white/[0.08]"
              >
                <div
                  className="h-full rounded-full bg-indigo-400 transition-[width] duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={handleCancelUpload}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 transition hover:text-white"
              >
                <XCircle size={16} weight="bold" />
                <span>Hủy tải lên</span>
              </button>
            </div>
          )}

          {/* Video Player & Frame Scrubbing */}
          {videoObjectUrl && (
            <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-slate-950 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <PlayCircle size={18} weight="duotone" className="text-indigo-400" />
                  <span>Khung hình xem trước ({videoDimensions.width}x{videoDimensions.height}px)</span>
                </span>
                <span className="text-xs font-mono text-indigo-400 font-bold">
                  {durationSeconds}s
                </span>
              </div>

              <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-white/[0.06]">
                <video
                  ref={videoRef}
                  src={videoObjectUrl}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={handleLoadedMetadata}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Action Cropping Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={taskLocked}
                  onClick={() => captureVideoFrame("logo")}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Scissors size={18} weight="duotone" />
                  <span>{logoCoords ? "✏️ Sửa vùng Xóa Logo" : "🎯 Khoanh vùng Xóa Logo"}</span>
                </button>

                <button
                  type="button"
                  disabled={taskLocked}
                  onClick={() => captureVideoFrame("subMask")}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Eraser size={18} weight="duotone" />
                  <span>{subMaskCoords ? "✏️ Sửa vùng Che Phụ Đề" : "📝 Khoanh vùng Che Phụ Đề"}</span>
                </button>
              </div>

              {/* Active Coordinates Display */}
              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                {logoCoords && (
                  <div className="flex items-center justify-between text-xs bg-indigo-500/10 px-3 py-2 rounded-lg border border-indigo-500/20 text-indigo-300">
                    <span><strong>Logo:</strong> x={logoCoords.x}, y={logoCoords.y}, w={logoCoords.w}, h={logoCoords.h}</span>
                    <button type="button" disabled={taskLocked} onClick={() => dispatch(setLogoCoords(null))} className="text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">✕</button>
                  </div>
                )}
                {subMaskCoords && (
                  <div className="flex items-center justify-between text-xs bg-purple-500/10 px-3 py-2 rounded-lg border border-purple-500/20 text-purple-300">
                    <span><strong>Phụ đề gốc:</strong> x={subMaskCoords.x}, y={subMaskCoords.y}, w={subMaskCoords.w}, h={subMaskCoords.h}</span>
                    <button type="button" disabled={taskLocked} onClick={() => dispatch(setSubMaskCoords(null))} className="text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">✕</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Pricing & Process Submit */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-slate-950/60 p-6 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkle size={20} weight="duotone" className="text-amber-400" />
              <span>Bảng tính phí & Khởi tạo</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Thời lượng video:</span>
                <span className="font-mono text-white font-bold">{durationSeconds} giây</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Phí xử lý video gốc:</span>
                <span className="font-mono text-emerald-400 font-bold">0 credit</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Phí Delogo (250 credit/phút):</span>
                <span className="font-mono text-amber-400 font-bold">{totalCost} credit</span>
              </div>
              <div className="pt-3 border-t border-white/[0.08] flex justify-between text-sm font-extrabold text-white">
                <span>Tổng chi phí:</span>
                <span className="text-emerald-400 font-mono text-base">{totalCost} credit</span>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs leading-relaxed">
                <WarningCircle size={18} weight="duotone" className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              disabled={taskLocked || isSubmitting || (!logoCoords && !subMaskCoords)}
              onClick={handleSubmit}
              className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-full bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98] transition select-none"
            >
              {taskInfo.status === "COMPLETED" ? (
                <>
                  <CheckCircle size={20} weight="fill" />
                  <span>Video đã xử lý xong</span>
                </>
              ) : taskInfo.status === "FAILED" ? (
                <>
                  <WarningCircle size={20} weight="fill" />
                  <span>Tác vụ chưa hoàn tất</span>
                </>
              ) : isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{uploadProgressMsg || "Đang xử lý Delogo..."}</span>
                </>
              ) : (
                <>
                  <Eraser size={20} weight="fill" />
                  <span>Bắt đầu xóa Logo & Render</span>
                </>
              )}
            </button>
          </div>

          {/* Task Output Result Panel */}
          {taskResult && (
            <div className={`rounded-2xl border p-6 space-y-4 ${
              taskResult.status === "FAILED"
                ? "border-rose-500/30 bg-rose-500/10"
                : "border-emerald-500/30 bg-emerald-500/10"
            }`}>
              <div className="flex items-center gap-3">
                {taskResult.status === "COMPLETED" ? (
                  <CheckCircle size={24} weight="fill" className="text-emerald-400" />
                ) : taskResult.status === "FAILED" ? (
                  <WarningCircle size={24} weight="fill" className="text-rose-400" />
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                )}
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {taskResult.status === "COMPLETED"
                      ? "Video đã xử lý xong!"
                      : taskResult.status === "FAILED"
                      ? "Chưa thể hoàn tất video"
                      : "Đang xử lý video..."}
                  </h3>
                  <p className="text-xs text-emerald-300/80 font-mono">Task #{taskResult.taskId}</p>
                </div>
              </div>

              {taskResult.videoUrl && (
                <a
                  href={taskResult.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition"
                >
                  <DownloadSimple size={18} weight="bold" />
                  <span>Tải Video đã xóa Logo</span>
                </a>
              )}

              {(taskResult.status === "COMPLETED" || taskResult.status === "FAILED") && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                >
                  Tạo tác vụ khác
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cropping Modal Overlay */}
      {activeCropTarget && frameCanvasUrl && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 p-0 backdrop-blur-md sm:items-center sm:p-4">
          <div className="max-h-[100dvh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-t-2xl border border-white/[0.1] bg-slate-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:rounded-2xl sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {activeCropTarget === "logo" ? "🎯 Khoanh vùng Vùng cần xóa Logo" : "📝 Khoanh vùng Vùng che Phụ Đề Gốc"}
              </h3>
              <button type="button" onClick={() => setActiveCropTarget(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex items-center justify-center bg-slate-900/90 rounded-xl overflow-auto p-4 max-h-[70vh] min-h-[300px]">
              <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} className="inline-block max-h-[65vh] max-w-full">
                <img id="crop-frame-img" src={frameCanvasUrl} alt="Crop Frame" className="block max-h-[65vh] max-w-full h-auto w-auto object-contain rounded" />
              </ReactCrop>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveCropTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmCrop}
                className="px-5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold shadow-md"
              >
                Xác nhận vùng khoanh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
