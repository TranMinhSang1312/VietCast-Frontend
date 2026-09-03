import { useEffect, useState, useRef, useMemo } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { 
  Eraser, 
  UploadSimple, 
  Scissors, 
  CheckCircle, 
  DownloadSimple, 
  WarningCircle, 
  Sparkle, 
  TextAlignLeft,
  Target,
  Sparkle as SparkleIcon,
} from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";
import ReactCrop, { convertToPixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { API_BASE_URL_PROVIDER } from "../config";

import { PRICING, formatVnd } from "../config/pricing";
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

// Smart Crop Presets configuration (DeepSeek recommended)
const CROP_PRESETS = [
  {
    id: "bottom-subtitles",
    label: "📝 Phụ đề đáy",
    crop: { unit: "%", x: 2, y: 82, width: 96, height: 16 },
    tooltip: "Gợi ý dải phụ đề đáy (bạn vẫn có thể kéo chỉnh thêm)",
  },
  {
    id: "top-right",
    label: "🎯 Logo góc trên phải",
    crop: { unit: "%", x: 78, y: 3, width: 19, height: 10 },
    tooltip: "Gợi ý logo góc trên phải",
  },
  {
    id: "top-left",
    label: "🎯 Logo góc trên trái",
    crop: { unit: "%", x: 3, y: 3, width: 19, height: 10 },
    tooltip: "Gợi ý logo góc trên trái",
  },
  {
    id: "bottom-right",
    label: "🎯 Logo góc dưới phải",
    crop: { unit: "%", x: 78, y: 87, width: 19, height: 10 },
    tooltip: "Gợi ý logo góc dưới phải",
  },
];

const MAX_CROP_AREA_PERCENT = 40; // Chuẩn công nghiệp: tối đa 40% diện tích video
const MAX_SRT_CHARACTERS = 1_000_000;
const SRT_TIMECODE_PATTERN = /\d{1,3}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,3}:\d{2}:\d{2}[,.]\d{3}/;

async function readValidatedSrtFile(file) {
  if (!file?.name?.toLowerCase().endsWith(".srt")) {
    throw new Error("Vui lòng chọn đúng tệp phụ đề có định dạng .srt.");
  }
  if (file.size <= 0) {
    throw new Error("Tệp SRT đang trống. Vui lòng chọn lại tệp có nội dung phụ đề.");
  }

  let content;
  try {
    content = await file.text();
  } catch (error) {
    throw new Error("Không thể đọc tệp SRT này. Vui lòng chọn lại tệp phụ đề.", { cause: error });
  }

  const normalized = content.replace(/^\uFEFF/, "").trim();
  if (!normalized) {
    throw new Error("Tệp SRT đang trống. Vui lòng chọn lại tệp có nội dung phụ đề.");
  }
  if (normalized.length > MAX_SRT_CHARACTERS) {
    throw new Error("Tệp SRT quá lớn. Nội dung tối đa là 1.000.000 ký tự.");
  }
  if (!SRT_TIMECODE_PATTERN.test(normalized)) {
    throw new Error("Tệp không có mốc thời gian SRT hợp lệ. Vui lòng kiểm tra lại phụ đề.");
  }
  return normalized;
}

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

  const [selectedSrtFile, setSelectedSrtFile] = useState(null);
  const [activeCropTarget, setActiveCropTarget] = useState(null); // 'logo' | 'subMask' | null
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [frameCanvasUrl, setFrameCanvasUrl] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [activePreset, setActivePreset] = useState(null);

  useEffect(() => {
    return () => uploadAbortControllerRef.current?.abort();
  }, []);

  // Calculate live crop area percentage
  const cropAreaPercent = useMemo(() => {
    if (!crop) return 0;
    const img = document.getElementById("crop-frame-img");
    if (!img || !img.clientWidth || !img.clientHeight) {
      if (crop.unit === "%") {
        return Math.round(((crop.width * crop.height) / 10000) * 1000) / 10;
      }
      return 0;
    }
    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    const effectiveCrop = completedCrop ?? convertToPixelCrop(crop, displayW, displayH);
    const area = (effectiveCrop.width * effectiveCrop.height) / (displayW * displayH);
    return Math.round(area * 1000) / 10;
  }, [crop, completedCrop]);

  const isCropAreaExceeded = cropAreaPercent > MAX_CROP_AREA_PERCENT;
  const isCropValid = cropAreaPercent > 0 && !isCropAreaExceeded;

  const handleDownloadResult = async () => {
    if (!taskResult?.taskId || isDownloading) return;
    setDownloadError(null);

    setIsDownloading(true);
    try {
      const resp = await axios.get(
        `${API_BASE_URL_PROVIDER.sync}/api/v1/videos/${taskResult.taskId}/download`,
        { params: { type: "video" } }
      );
      const { downloadUrl, filename } = resp.data || {};
      if (!downloadUrl) {
        throw new Error("Backend did not return a downloadUrl");
      }
      const a = document.createElement("a");
      a.href = downloadUrl;
      if (filename) a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      const code = err.response?.data?.code;
      const status = err.response?.status;
      const msg = err.response?.data?.message;
      const fallbackUrl = taskResult.videoUrl;
      if (code === "FILE_EXPIRED" || status === 410) {
        setDownloadError(msg || "Tệp này đã hết hạn lưu trữ 7 ngày trên hệ thống.");
      } else if (code === "UNSUPPORTED_URL" && fallbackUrl) {
        window.open(fallbackUrl, "_blank", "noopener");
      } else if (fallbackUrl) {
        const a = document.createElement("a");
        a.href = fallbackUrl;
        a.download = `vietcast_delogo_${taskResult.taskId}.mp4`;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        console.error("[download] failed", err);
        setDownloadError("Không thể tải tệp lúc này. Vui lòng thử lại sau.");
      }
    } finally {
      setIsDownloading(false);
    }
  };

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

    // Initial crop: auto set smart preset or center crop
    if (targetType === "subMask") {
      setCrop({ unit: "%", x: 2, y: 82, width: 96, height: 16 });
      setActivePreset("bottom-subtitles");
    } else {
      setCrop({ unit: "%", x: 78, y: 3, width: 19, height: 10 });
      setActivePreset("top-right");
    }
    setCompletedCrop(null);
    setActiveCropTarget(targetType);
  };

  // Apply Smart Crop Preset (User can still freely drag & resize afterward)
  const handleApplyPreset = (preset) => {
    setCrop(preset.crop);
    setCompletedCrop(null);
    setActivePreset(preset.id);
  };

  // Confirm crop modal
  const handleConfirmCrop = () => {
    if (!crop || !videoDimensions.width || isCropAreaExceeded) return;

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
    setActivePreset(null);
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

    // Validate the optional subtitle before uploading a potentially large
    // video. A selected-but-unreadable file must never silently degrade into
    // a delogo-only task.
    let srtText = null;
    if (selectedSrtFile) {
      try {
        srtText = await readValidatedSrtFile(selectedSrtFile);
      } catch (srtError) {
        dispatch(setDelogoError(srtError.message));
        return;
      }
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

      // Step 2: Submit process payload with the real public R2 video URL.
      // srtText was already validated before upload, so hardsub cannot be
      // accidentally disabled while the UI still shows a selected file.
      const payload = {
        url: r2VideoUrl,
        audioMode: "original",
        logoCoordinates: logoCoords ? logoCoords.str : null,
        subtitleMask: subMaskCoords ? subMaskCoords.str : null,
        hardsub: srtText !== null,
        srtContent: srtText,
      };

      const resp = await axios.post(
        `${API_BASE_URL_PROVIDER.sync}/api/v1/videos/process`,
        payload
      );

      const taskId = resp.data?.taskId || resp.data?.id;
      if (!taskId) {
        throw new Error("Backend did not return a valid taskId");
      }

      localStorage.setItem(DELOGO_PENDING_TASK_KEY, String(taskId));
      dispatch(setDelogoTaskProcessing(taskId));
    } catch (err) {
      if (isVideoUploadCancelled(err)) {
        dispatch(setDelogoSubmissionStopped());
        return;
      }
      const parsed = handleApiError(err);
      dispatch(setDelogoError(parsed.message));
    }
  };

  const handleReset = () => {
    localStorage.removeItem(DELOGO_PENDING_TASK_KEY);
    dispatch(resetDelogoState());
    setSelectedSrtFile(null);
    setActiveCropTarget(null);
    setCrop(null);
    setCompletedCrop(null);
    setFrameCanvasUrl(null);
    setDownloadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="relative min-h-[100dvh] w-full bg-slate-950 px-3 py-6 font-sans text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-200 sm:px-6 sm:py-12">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto space-y-8">
        {/* Header section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold uppercase tracking-wider shadow-sm">
            <Eraser className="w-4 h-4 text-emerald-400" />
            <span>Xóa Watermark & Che Phụ Đề Gốc AI</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            Tẩy Logo & Đè Phụ Đề Chuyên Nghiệp
          </h1>
          <p className="text-slate-400 text-sm max-w-2xl mx-auto leading-relaxed">
            Tải video trực tiếp từ máy tính hoặc điện thoại, khoanh vùng logo/phụ đề cần che mờ với độ chính xác cao và xuất video sắc nét.
          </p>
        </div>

        {/* Main interactive grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Upload & Video Player Preview (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Upload Area */}
            {!videoObjectUrl ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="relative cursor-pointer border-2 border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-900/40 hover:bg-slate-900/70 rounded-3xl p-8 sm:p-12 text-center transition-ultra flex flex-col items-center justify-center gap-4 group"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-ultra shadow-lg shadow-emerald-500/10">
                  <UploadSimple size={32} weight="duotone" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-bold text-white">Kéo & Thả Video Hoặc Bấm Để Chọn</p>
                  <p className="text-xs text-slate-400">Hỗ trợ MP4, MOV, WEBM, MKV (Tối đa 1GB)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            ) : (
              /* Video Canvas / Player Container */
              <div className="space-y-4">
                <div className="relative rounded-3xl overflow-hidden bg-black border border-slate-800 shadow-2xl aspect-video flex items-center justify-center">
                  <video
                    ref={videoRef}
                    src={videoObjectUrl}
                    controls
                    crossOrigin="anonymous"
                    onLoadedMetadata={handleLoadedMetadata}
                    className="max-h-[500px] w-full object-contain"
                  />
                  {isUploading && (
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 space-y-4 z-20">
                      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                      <div className="w-full max-w-xs space-y-2 text-center">
                        <p className="text-sm font-semibold text-white">{uploadProgressMsg || "Đang tải video..."}</p>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelUpload}
                        className="text-xs text-slate-400 hover:text-rose-400 transition"
                      >
                        Hủy tải lên
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 px-2">
                  <span>Tệp: <strong className="text-slate-200">{selectedFile?.name}</strong></span>
                  <span>Thời lượng: <strong className="text-slate-200">{durationSeconds}s</strong> ({videoDimensions.width}x{videoDimensions.height})</span>
                  {!taskLocked && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-rose-400 hover:underline"
                    >
                      Đổi video khác
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Quick Actions (Crop Buttons) */}
            {videoObjectUrl && !taskLocked && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => captureVideoFrame("logo")}
                  className="flex items-center justify-between p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-semibold text-xs transition-ultra active:scale-95 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <Scissors size={20} weight="duotone" />
                    <span>Khoanh vùng Xóa Logo</span>
                  </div>
                  {logoCoords ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500 text-white font-mono">Đã khoanh</span>
                  ) : (
                    <span className="text-[10px] opacity-70">Bấm để chọn</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => captureVideoFrame("subMask")}
                  className="flex items-center justify-between p-4 rounded-2xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-semibold text-xs transition-ultra active:scale-95 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <Eraser size={20} weight="duotone" />
                    <span>Khoanh vùng Che Phụ Đề Gốc</span>
                  </div>
                  {subMaskCoords ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500 text-white font-mono">Đã khoanh</span>
                  ) : (
                    <span className="text-[10px] opacity-70">Bấm để chọn</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Settings & Execution Panel (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-3xl border border-slate-800/80 bg-slate-900/60 p-6 space-y-6 backdrop-blur-xl shadow-xl">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkle size={18} weight="fill" className="text-emerald-400" />
                <span>Cấu Hình Tác Vụ Delogo</span>
              </h2>

              {/* Status of Selected Regions */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Khu vực đã khoanh vùng
                </label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950/50 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Target size={16} className="text-indigo-400" />
                      <span>Vùng xóa Logo:</span>
                    </div>
                    {logoCoords ? (
                      <span className="font-mono text-indigo-300 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {logoCoords.str}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Chưa chọn</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950/50 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <TextAlignLeft size={16} className="text-purple-400" />
                      <span>Vùng che Phụ đề:</span>
                    </div>
                    {subMaskCoords ? (
                      <span className="font-mono text-purple-300 font-semibold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                        {subMaskCoords.str}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Chưa chọn</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Custom SRT File Attachment (Optional) */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>File Phụ Đề Mới (Tùy chọn)</span>
                  <span className="text-[10px] text-slate-500">In đè phụ đề mới</span>
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".srt"
                    disabled={taskLocked || isSubmitting}
                    onChange={(e) => setSelectedSrtFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer bg-slate-950/40 p-2 rounded-2xl border border-slate-800"
                  />
                </div>
              </div>

              {/* Cost Summary Box */}
              <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-4 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Thời lượng tính phí:</span>
                  <span className="text-slate-200 font-semibold">{billableMinutes.toFixed(1)} phút (~{durationSeconds}s)</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Phí xóa logo / che phụ đề ({formatVnd(PRICING.visualFilterPerMinute)}/phút):</span>
                  <span className="font-mono text-amber-400 font-bold">{formatVnd(totalCost)}</span>
                </div>
                <div className="pt-3 border-t border-white/[0.08] flex justify-between text-sm font-extrabold text-white">
                  <span>Tổng chi phí:</span>
                  <span className="text-emerald-400 font-mono text-base">{formatVnd(totalCost)}</span>
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
                className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-full bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] hover:shadow-[0_22px_70px_-15px_rgba(16,185,129,0.7)] hover:-translate-y-0.5 active:scale-[0.97] transition-ultra select-none cursor-pointer"
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
              <div className={`rounded-2xl border p-6 space-y-4 animate-scale-in transition-ultra ${
                taskResult.status === "FAILED"
                  ? "border-rose-500/30 bg-rose-500/10 shadow-[0_10px_30px_-10px_rgba(244,63,94,0.2)]"
                  : "border-emerald-500/30 bg-emerald-500/10 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.2)]"
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
                  <button
                    type="button"
                    onClick={handleDownloadResult}
                    disabled={isDownloading}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                    ) : (
                      <DownloadSimple size={18} weight="bold" />
                    )}
                    <span>{isDownloading ? "Đang tải xuống..." : "Tải Video đã xóa Logo"}</span>
                  </button>
                )}

                {downloadError && (
                  <p className="text-xs text-rose-400 font-medium text-center">{downloadError}</p>
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
      </div>

      {/* Cropping Modal Overlay with Smart Presets & Live Area Guard */}
      {activeCropTarget && frameCanvasUrl && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/90 p-0 backdrop-blur-md sm:items-center sm:p-4">
          <div className="max-h-[100dvh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-t-3xl border border-white/[0.1] bg-slate-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[92vh] sm:rounded-3xl sm:p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  {activeCropTarget === "logo" ? "🎯 Khoanh Vùng Cần Xóa Logo" : "📝 Khoanh Vùng Che Phụ Đề Gốc"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dùng chuột kéo dãn/di chuyển khung, hoặc chọn nhanh vị trí gợi ý bên dưới.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveCropTarget(null);
                  setActivePreset(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.08] transition"
              >
                ✕
              </button>
            </div>

            {/* Smart Presets Shortcut Buttons (DeepSeek Design) */}
            <div className="space-y-2 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <SparkleIcon size={14} weight="fill" className="text-amber-400" />
                  <span>Vị trí gợi ý nhanh (Bấm để đặt khung, sau đó kéo chỉnh tùy ý):</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {CROP_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition active:scale-95 flex items-center gap-1.5 ${
                      activePreset === preset.id
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400"
                        : "bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/60"
                    }`}
                  >
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Crop Canvas with ReactCrop */}
            <div className="flex items-center justify-center bg-slate-900/90 rounded-2xl overflow-auto p-4 max-h-[60vh] min-h-[280px] border border-slate-800/80">
              <ReactCrop
                crop={crop}
                onChange={(c) => {
                  setCrop(c);
                  setActivePreset(null); // Reset preset ID when user manually drags/resizes
                }}
                onComplete={(c) => setCompletedCrop(c)}
                className="inline-block max-h-[55vh] max-w-full"
              >
                <img
                  id="crop-frame-img"
                  src={frameCanvasUrl}
                  alt="Crop Frame"
                  className="block max-h-[55vh] max-w-full h-auto w-auto object-contain rounded-lg shadow-lg"
                />
              </ReactCrop>
            </div>

            {/* Modal Footer with Live Area Indicator & Safety Warning */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                    isCropAreaExceeded
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  <span>📐 Vùng chọn: <strong>{cropAreaPercent}%</strong> diện tích video (Tối đa {MAX_CROP_AREA_PERCENT}%)</span>
                </span>
                <span className="text-[11px] text-slate-400 italic">
                  💡 Nắm vào 4 góc hoặc các cạnh để co dãn / kéo rê khung
                </span>
              </div>

              {isCropAreaExceeded && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <WarningCircle size={18} className="shrink-0 text-rose-400" />
                  <span>
                    Vùng khoanh chọn chiếm <strong>{cropAreaPercent}%</strong> (vượt quá mức tối đa {MAX_CROP_AREA_PERCENT}%). Vui lòng thu nhỏ khung chọn để đảm bảo chất lượng video không bị nhòe toàn bộ.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveCropTarget(null);
                    setActivePreset(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCrop}
                  disabled={!isCropValid}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-indigo-600/30 active:scale-95 transition"
                >
                  Xác nhận vùng khoanh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
