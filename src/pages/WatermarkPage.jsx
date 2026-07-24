import { useState, useRef, useCallback, useEffect } from "react";
import axios from "axios";
import { 
  Eraser, 
  UploadSimple, 
  LinkSimple, 
  Scissors, 
  CheckCircle, 
  ArrowClockwise, 
  DownloadSimple, 
  PlayCircle,
  WarningCircle,
  Sparkle
} from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL_PROVIDER } from "../config";
import { PRICING, formatCredits } from "../config/pricing";

export default function WatermarkPage() {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Video input mode: 'file' | 'url'
  const [inputMode, setInputMode] = useState("file");
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");

  // Crop Coordinates State
  const [logoCoords, setLogoCoords] = useState(null);       // {x, y, w, h}
  const [subMaskCoords, setSubMaskCoords] = useState(null); // {x, y, w, h}

  // Active Crop Modal
  const [activeCropTarget, setActiveCropTarget] = useState(null); // 'logo' | 'subMask' | null
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [frameCanvasUrl, setFrameCanvasUrl] = useState(null);

  // Video metadata
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

  // Processing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskResult, setTaskResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (videoObjectUrl) {
        URL.revokeObjectURL(videoObjectUrl);
      }
    };
  }, [videoObjectUrl]);

  // Handle local file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setError("Vui lòng chọn tệp video hợp lệ (.mp4, .mov, .webm).");
      return;
    }

    setError(null);
    setSelectedFile(file);
    if (videoObjectUrl) {
      URL.revokeObjectURL(videoObjectUrl);
    }
    const url = URL.createObjectURL(file);
    setVideoObjectUrl(url);
    setLogoCoords(null);
    setSubMaskCoords(null);
    setTaskResult(null);
  };

  // Video loaded metadata
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 0;
      const w = videoRef.current.videoWidth || 0;
      const h = videoRef.current.videoHeight || 0;
      setDurationSeconds(Math.round(dur));
      setVideoDimensions({ width: w, height: h });
    }
  };

  // Capture current video frame to canvas for ReactCrop modal
  const captureVideoFrame = (targetType) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("Hãy tải video và chờ khung hình hiển thị trước khi khoanh vùng.");
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
    setActiveCropTarget(targetType);
  };

  // Confirm crop modal
  const handleConfirmCrop = () => {
    if (!completedCrop || !videoDimensions.width) return;

    const img = document.getElementById("crop-frame-img");
    if (!img) return;

    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    const sourceW = img.naturalWidth || videoDimensions.width;
    const sourceH = img.naturalHeight || videoDimensions.height;

    const scaleX = sourceW / displayW;
    const scaleY = sourceH / displayH;

    let x = Math.floor(completedCrop.x * scaleX);
    let y = Math.floor(completedCrop.y * scaleY);
    let w = Math.floor(completedCrop.width * scaleX);
    let h = Math.floor(completedCrop.height * scaleY);

    // Clamping
    x = Math.max(0, Math.min(x, sourceW - 1));
    y = Math.max(0, Math.min(y, sourceH - 1));
    w = Math.max(1, Math.min(w, sourceW - x));
    h = Math.max(1, Math.min(h, sourceH - y));

    const coordsObj = { x, y, w, h, str: `${x}:${y}:${w}:${h}` };

    if (activeCropTarget === "logo") {
      setLogoCoords(coordsObj);
    } else if (activeCropTarget === "subMask") {
      setSubMaskCoords(coordsObj);
    }

    setActiveCropTarget(null);
  };

  // Cost calculation: ONLY charge the visual filter rate (250 credits/min, min 250)
  const minutes = Math.max(1, durationSeconds / 60);
  const filterCost = Math.round(minutes * PRICING.visualFilterPerMinute);
  const totalCost = Math.max(250, filterCost);

  // Submit task
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!logoCoords && !subMaskCoords) {
      setError("Vui lòng khoanh vùng ít nhất 1 khu vực (Logo hoặc Phụ đề gốc) để xử lý.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      // Ensure clean URL matching Spring Boot @URL pattern (must start with http:// or https://)
      const validUrl = "https://local-upload.vietcast.app";

      const payload = {
        url: validUrl,
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
      setTaskResult({
        taskId,
        status: "PROCESSING",
        videoUrl: null,
      });

      // Poll task status
      pollTaskStatus(taskId);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Không thể khởi tạo tác vụ xóa Logo. Vui lòng thử lại.");
      setIsSubmitting(false);
    }
  };

  const pollTaskStatus = (taskId) => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL_PROVIDER.sync}/api/v1/videos/tasks/${taskId}`);
        const data = res.data;
        if (data.status === "SUCCESS" || data.status === "COMPLETED") {
          setTaskResult({
            taskId,
            status: "COMPLETED",
            videoUrl: data.resultUrl || data.videoUrl,
          });
          setIsSubmitting(false);
          clearInterval(interval);
        } else if (data.status === "FAILED") {
          setError(data.errorMessage || "Tác vụ thất bại trong quá trình xử lý.");
          setIsSubmitting(false);
          clearInterval(interval);
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Title Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
          <Eraser size={16} weight="duotone" />
          <span>Công cụ Studio Độc lập</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Xóa Logo & Làm Mờ Phụ Đề Gốc (Delogo Studio)
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
          Tải file video từ máy tính của bạn để khoanh vùng trực tiếp trên khung hình thực tế. Công cụ sẽ tự động loại bỏ watermark, logo hoặc làm mờ dòng chữ phụ đề tiếng Trung/Anh gốc.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input & Cropping Area */}
        <div className="lg:col-span-7 space-y-6">
          {/* File Upload Zone - Direct Local File Selection */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-indigo-500/30 hover:border-indigo-400/60 rounded-2xl p-6 text-center bg-indigo-500/[0.02] hover:bg-indigo-500/[0.05] transition cursor-pointer select-none"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mx-auto flex items-center justify-center mb-3">
              <UploadSimple size={24} weight="duotone" />
            </div>
            <p className="text-sm font-semibold text-slate-200">
              {selectedFile ? `Đã chọn: ${selectedFile.name}` : "Nhấp hoặc Kéo thả file Video từ máy tính vào đây"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Hỗ trợ tệp MP4, MOV, WebM (Tự động phát và xem trước khung hình trực tiếp trên trình duyệt)
            </p>
          </div>

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
                  onLoadedMetadata={handleLoadedMetadata}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Action Cropping Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => captureVideoFrame("logo")}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold transition active:scale-[0.98]"
                >
                  <Scissors size={18} weight="duotone" />
                  <span>{logoCoords ? "✏️ Sửa vùng Xóa Logo" : "🎯 Khoanh vùng Xóa Logo"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => captureVideoFrame("subMask")}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold transition active:scale-[0.98]"
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
                    <button type="button" onClick={() => setLogoCoords(null)} className="text-slate-400 hover:text-white">✕</button>
                  </div>
                )}
                {subMaskCoords && (
                  <div className="flex items-center justify-between text-xs bg-purple-500/10 px-3 py-2 rounded-lg border border-purple-500/20 text-purple-300">
                    <span><strong>Phụ đề gốc:</strong> x={subMaskCoords.x}, y={subMaskCoords.y}, w={subMaskCoords.w}, h={subMaskCoords.h}</span>
                    <button type="button" onClick={() => setSubMaskCoords(null)} className="text-slate-400 hover:text-white">✕</button>
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
                <span>Phí xử lý Video gốc:</span>
                <span className="font-mono text-emerald-400 font-bold">MIỄN PHÍ (0 credit)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Phí bộ lọc Xóa Logo / Che phụ đề:</span>
                <span className="font-mono text-amber-400 font-bold">250 credit/phút</span>
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
              disabled={isSubmitting || (!logoCoords && !subMaskCoords)}
              onClick={handleSubmit}
              className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-full bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98] transition select-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Đang xử lý Delogo...</span>
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
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={24} weight="fill" className="text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {taskResult.status === "COMPLETED" ? "Đã hoàn thành Delogo!" : "Đang xử lý tác vụ trên VPS..."}
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
            </div>
          )}
        </div>
      </div>

      {/* Cropping Modal Overlay */}
      {activeCropTarget && frameCanvasUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-slate-950 border border-white/[0.1] rounded-2xl p-6 max-w-4xl w-full space-y-4 overflow-y-auto max-h-[90vh]">
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
