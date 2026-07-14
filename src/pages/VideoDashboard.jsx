import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import axios from "axios";
import { Loader2, Wand2, Mic, Subtitles, CheckCircle2, Download, AlertCircle, Film, Languages } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL_PROVIDER } from "../config";
import { recordUsageLog } from "../services/history";
import WatermarkRemover from "../components/watermark/WatermarkRemover";

const AUDIO_MODES = [
  {
    value: "dub",
    label: "Lồng tiếng AI",
    description: "Thay thế tiếng gốc bằng giọng đọc tiếng Việt do AI tạo.",
    icon: Wand2,
  },
  {
    value: "original",
    label: "Giữ tiếng gốc",
    description: "Giữ nguyên âm thanh gốc của video, không chỉnh sửa.",
    icon: Mic,
  },
  {
    value: "mute",
    label: "Video câm",
    description: "Loại bỏ hoàn toàn tiếng gốc, chỉ giữ phụ đề tiếng Việt.",
    icon: Film,
  },
  {
    value: "mix",
    label: "Trộn âm thanh gốc & AI",
    description: "Hạ âm lượng gốc còn 30%, lồng tiếng AI phía trên.",
    icon: Subtitles,
  },
];

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;
const PROGRESS_REGEX = /(\d{1,3})\s*%/;

function extractUrl(raw) {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/https?:\/\/\S+/);
  if (match) return match[0].replace(/\/+$/, "");
  return null;
}

export default function VideoDashboard() {
  const { updateCreditBalance } = useAuth();
  const [url, setUrl] = useState("");
  const [audioMode, setAudioMode] = useState("mix");
  const [logoCoordinates, setLogoCoordinates] = useState("");
  const [subtitleMask, setSubtitleMask] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Crop modal states
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropType, setCropType] = useState("logo"); // "logo" | "subtitle"

  const pollIntervalRef = useRef(null);
  const usageLoggedTaskIdRef = useRef(null);

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const resetResultState = useCallback(() => {
    setResult(null);
    setProgress(0);
    setVideoReady(false);
    setVideoError(false);
    clearPollInterval();
  }, [clearPollInterval]);

  const handleUrlChange = useCallback(
    (e) => {
      const next = e.target.value;
      if (result && next !== url) {
        resetResultState();
      }
      setUrl(next);
      if (error) setError(null);
    },
    [result, url, error, resetResultState],
  );

  const handleModeChange = useCallback(
    (mode) => {
      setAudioMode(mode);
      if (error) setError(null);
      if (result && mode !== audioMode) {
        resetResultState();
      }
    },
    [result, audioMode, error, resetResultState],
  );

  const handleReset = useCallback(() => {
    setUrl("");
    setAudioMode("mix");
    setLogoCoordinates("");
    setSubtitleMask("");
    setResult(null);
    setError(null);
    setVideoReady(false);
    setVideoError(false);
    setProgress(0);
    clearPollInterval();
  }, [clearPollInterval]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      const raw = url.trim();
      if (!raw) {
        setError("Vui lòng nhập URL video.");
        return;
      }

      const cleanUrl = extractUrl(raw);
      if (!cleanUrl) {
        setError("Không tìm thấy đường dẫn video hợp lệ trong nội dung bạn dán.");
        return;
      }

      setIsLoading(true);
      setError(null);
      setResult({ status: "PROCESSING", url: cleanUrl, audioMode });
      setVideoReady(false);
      setVideoError(false);

      try {
        const { data } = await axios.post(
          `${API_BASE_URL}/api/v1/videos/process`,
          { 
            url: cleanUrl, 
            audioMode,
            logoCoordinates: logoCoordinates.trim() || null,
            subtitleMask: subtitleMask.trim() || null
          },
          { headers: { "Content-Type": "application/json" }, timeout: 30000 }
        );
        setResult({ ...data, url: data.url ?? cleanUrl, audioMode: data.audioMode ?? audioMode });
      } catch (err) {
        const status = err?.response?.status || err?.status;
        const code = err?.response?.data?.code || err?.code;
        if (status === 402 || code === "INSUFFICIENT_CREDIT") {
          try {
            const { data } = await axios.get(`${API_BASE_URL}/api/auth/me`);
            if (data && typeof data.creditBalance === "number") {
              updateCreditBalance(data.creditBalance);
            }
          } catch {
            /* ignore */
          }
          setError(
            err?.message ||
              "Bạn không đủ credit để xử lý video. Vui lòng nạp thêm để tiếp tục."
          );
        } else {
          setError(err?.message || "Không thể kết nối tới máy chủ. Vui lòng thử lại sau.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [url, audioMode, logoCoordinates, subtitleMask, updateCreditBalance],
  );

  useEffect(() => {
    if (!result?.taskId) return;
    if (result.status !== "PROCESSING") return;

    const taskId = result.taskId;

    const fetchStatus = async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE_URL}/api/v1/videos/status/${taskId}`,
          { timeout: 10000 }
        );
        if (data.taskId && data.taskId !== taskId) {
          return;
        }
        setResult((prev) => ({
          ...prev,
          taskId: data.taskId ?? prev.taskId,
          status: data.status,
          videoUrl: data.videoUrl ?? null,
          srtUrl: data.srtUrl ?? null,
          message: data.message ?? prev.message,
        }));

        const serverProgress = typeof data.progress === "number" ? data.progress : 0;
        if (data.status === "COMPLETED") {
          setProgress(100);
        } else if (data.status === "FAILED") {
          setProgress(0);
        } else {
          setProgress((prev) => (serverProgress > prev ? serverProgress : prev));
        }

        if (data.status === "COMPLETED" || data.status === "FAILED") {
          clearPollInterval();
        }
      } catch (err) {
        if (err.response?.status === 404) {
          clearPollInterval();
          setError("Không tìm thấy tác vụ. Có thể server đã khởi động lại.");
        }
      }
    };

    fetchStatus();
    pollIntervalRef.current = setInterval(fetchStatus, 2000);

    return clearPollInterval;
  }, [result?.taskId, result?.status, clearPollInterval]);

  useEffect(() => {
    if (!result?.taskId) return;
    if (result.status !== "COMPLETED" && result.status !== "FAILED") return;
    if (usageLoggedTaskIdRef.current === result.taskId) return;

    usageLoggedTaskIdRef.current = result.taskId;
    recordUsageLog({
      taskId: result.taskId,
      url: result.url ?? null,
      audioMode: result.audioMode ?? null,
      status: result.status,
      note: result.message ?? null,
    }).catch((err) => console.error("[history] recordUsageLog failed:", err));
  }, [result?.taskId, result?.status, result?.url, result?.audioMode, result?.message]);

  useEffect(() => {
    if (isLoading && usageLoggedTaskIdRef.current) {
      usageLoggedTaskIdRef.current = null;
    }
  }, [isLoading]);

  const isProcessing = result?.status === "PROCESSING";

  const videoSrc = useMemo(() => {
    if (!result?.videoUrl) return undefined;
    const sep = result.videoUrl.includes("?") ? "&" : "?";
    return `${result.videoUrl}${sep}t=${result.taskId}`;
  }, [result?.videoUrl, result?.taskId]);

  const placeholderMessage = useMemo(() => {
    if (isProcessing) return "Đang render video…";
    if (result?.status === "FAILED") return "Quá trình xử lý thất bại.";
    return "Đang tải video lên máy chủ…";
  }, [isProcessing, result?.status]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center bg-zinc-950 font-sans text-zinc-100 px-4 py-8 sm:py-12 relative overflow-x-hidden">
      {/* Ambient backgrounds */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-500/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand-500/2 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-6xl z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-zinc-900 mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Languages className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white leading-tight">VietCast</h1>
              <p className="text-xs text-zinc-500 font-mono">Workspace</p>
            </div>
          </div>
          <div className="text-center md:text-left select-none">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tighter text-zinc-100">
              Lồng tiếng Video AI
            </h2>
          </div>
        </header>

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form Controls */}
          <section className="lg:col-span-7 bg-zinc-900/25 border border-zinc-900 rounded-2xl p-6 sm:p-8 backdrop-blur-md">
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* URL input */}
              <div>
                <label htmlFor="video-url" className="block text-sm font-semibold text-zinc-300 mb-2">
                  Đường dẫn Video <span className="text-zinc-500 font-normal">(TikTok / YouTube / Douyin)</span>
                </label>
                <input
                  id="video-url"
                  type="url"
                  inputMode="url"
                  placeholder="Dán link video tại đây..."
                  value={url}
                  onChange={handleUrlChange}
                  disabled={isLoading || isProcessing}
                  className="w-full px-4 py-3.5 rounded-xl bg-zinc-950 border border-zinc-850 text-zinc-100 placeholder:text-zinc-650 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed text-base font-mono"
                />
              </div>

              {/* Advanced Crop Tools (Logo & Subtitles) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-850">
                  <div>
                    <span className="block text-sm font-semibold text-zinc-350">Xóa Logo cứng (Delogo)</span>
                    <span className="text-xs text-zinc-500 font-mono mt-0.5 block">
                      {logoCoordinates ? `Đã chọn: ${logoCoordinates}` : "Chưa chọn khung"}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {logoCoordinates && (
                      <button
                        type="button"
                        onClick={() => setLogoCoordinates("")}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 active:scale-[0.98] transition select-none"
                      >
                        Xóa
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading || isProcessing}
                      onClick={() => {
                        setCropType("logo");
                        setIsCropOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-800 active:scale-[0.98] transition select-none"
                    >
                      Vẽ khung
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-850">
                  <div>
                    <span className="block text-sm font-semibold text-zinc-350">Đè phụ đề gốc</span>
                    <span className="text-xs text-zinc-500 font-mono mt-0.5 block">
                      {subtitleMask ? `Đã chọn: ${subtitleMask}` : "Chưa chọn khung"}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {subtitleMask && (
                      <button
                        type="button"
                        onClick={() => setSubtitleMask("")}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 active:scale-[0.98] transition select-none"
                      >
                        Xóa
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading || isProcessing}
                      onClick={() => {
                        setCropType("subtitle");
                        setIsCropOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-800 active:scale-[0.98] transition select-none"
                    >
                      Vẽ khung
                    </button>
                  </div>
                </div>
              </div>

              {/* Audio mode selector */}
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-3">
                  Chế độ âm thanh
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AUDIO_MODES.map((mode) => (
                    <AudioModeOption
                      key={mode.value}
                      mode={mode}
                      checked={audioMode === mode.value}
                      disabled={isLoading || isProcessing}
                      onSelect={handleModeChange}
                    />
                  ))}
                </div>
              </div>

              {/* Submit Action */}
              {!isProcessing && (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-base shadow-lg shadow-brand-500/10 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed select-none"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Đang phân tích...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5" />
                      <span>Bắt đầu xử lý video</span>
                    </>
                  )}
                </button>
              )}

              {/* Error */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-4 rounded-xl bg-red-950/20 border border-red-900/40 text-red-200"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                  <div className="text-sm leading-normal">
                    <div className="font-semibold mb-0.5">Yêu cầu thất bại</div>
                    {error}
                  </div>
                </div>
              )}
            </form>
          </section>

          {/* Right Column: Visual Result / Preview */}
          <section className="lg:col-span-5 flex flex-col">
            {result ? (
              <ResultPanel
                result={result}
                isProcessing={isProcessing}
                progress={progress}
                videoReady={videoReady}
                videoError={videoError}
                videoSrc={videoSrc}
                placeholderMessage={placeholderMessage}
                onReset={handleReset}
                onVideoReady={() => setVideoReady(true)}
                onVideoError={() => setVideoError(true)}
                onSetError={setError}
              />
            ) : (
              <div className="h-full min-h-[300px] border border-dashed border-zinc-850 rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-zinc-900/10 backdrop-blur-md select-none">
                <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-550 mb-4">
                  <Film className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-200">Bản xem trước video</h3>
                <p className="text-xs text-zinc-550 mt-1.5 max-w-[250px] mx-auto leading-relaxed font-medium">
                  Vui lòng nhập đường dẫn video bên trái để bắt đầu quá trình dịch và lồng tiếng.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Crop Modal */}
      {isCropOpen && (
        <WatermarkRemover
          videoSrc={url || ""}
          title={cropType === "logo" ? "Vẽ khung xóa Logo cứng" : "Vẽ khung đè phụ đề gốc"}
          description={
            cropType === "logo"
              ? "Kéo chuột để vẽ một ô vuông bao quanh Logo cứng. Hệ thống sẽ che Logo này bằng thuật toán FFmpeg delogo. Lưu ý: Bạn cần dùng đường dẫn video trực tiếp (ví dụ link đuôi .mp4) để tải được khung hình vẽ."
              : "Kéo chuột để vẽ một ô chữ nhật dài che phụ đề gốc. Hệ thống sẽ bôi mờ phụ đề cũ và đè phụ đề tiếng Việt mới lên trên. Lưu ý: Bạn cần dùng đường dẫn video trực tiếp (ví dụ link đuôi .mp4) để tải được khung hình vẽ."
          }
          onConfirm={(coords) => {
            if (cropType === "logo") {
              setLogoCoordinates(coords);
            } else {
              setSubtitleMask(coords);
            }
            setIsCropOpen(false);
          }}
          onCancel={() => setIsCropOpen(false)}
        />
      )}
    </div>
  );
}

// Sub-components

const AudioModeOption = memo(function AudioModeOption({ mode, checked, disabled, onSelect }) {
  const Icon = mode.icon;
  return (
    <label
      className={`relative cursor-pointer rounded-xl border p-4 transition flex items-start gap-3 select-none ${
        checked
          ? "border-brand-500 bg-brand-500/5 shadow-sm"
          : "border-zinc-850 bg-zinc-950/40 hover:border-zinc-700"
      } ${disabled ? "opacity-40 pointer-events-none" : "active:scale-[0.98]"}`}
    >
      <input
        type="radio"
        name="audioMode"
        value={mode.value}
        checked={checked}
        onChange={() => onSelect(mode.value)}
        disabled={disabled}
        className="sr-only"
      />
      <div
        className={`shrink-0 mt-0.5 w-8.5 h-8.5 rounded-lg flex items-center justify-center ${
          checked ? "bg-brand-500 text-white" : "bg-zinc-900 text-zinc-550 border border-zinc-800"
        }`}
      >
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm text-zinc-200">{mode.label}</span>
          <span
            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
              checked ? "border-brand-500" : "border-zinc-700"
            }`}
          >
            {checked && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />}
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-1 leading-normal font-medium">{mode.description}</p>
      </div>
    </label>
  );
});

const ResultPanel = memo(function ResultPanel({
  result,
  isProcessing,
  progress,
  videoReady,
  videoError,
  videoSrc,
  placeholderMessage,
  onReset,
  onVideoReady,
  onVideoError,
  onSetError,
}) {
  return (
    <div className="bg-zinc-900/25 border border-zinc-900 rounded-2xl p-6 backdrop-blur-md flex flex-col h-full justify-between">
      <div>
        <div className="flex items-start justify-between gap-3 mb-6 select-none">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-200">Tác vụ đang xử lý</h2>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                Task ID: <span className="text-emerald-400">{result.taskId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-zinc-400 hover:text-white underline underline-offset-4 decoration-zinc-800 transition"
          >
            Tạo task khác
          </button>
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="mb-6 select-none">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-1.5">
              <span>ĐANG XỬ LÝ...</span>
              <span className="text-zinc-200">{progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="bg-zinc-900 h-1.5 w-full rounded-full overflow-hidden"
            >
              <div
                className="bg-brand-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Video Player */}
        <div className="rounded-xl overflow-hidden bg-black border border-zinc-850 aspect-video relative">
          {videoSrc && result.status === "COMPLETED" ? (
            <video
              controls
              preload="none"
              poster=""
              src={videoSrc}
              onLoadedData={onVideoReady}
              onError={onVideoError}
              className={`w-full h-full object-contain ${videoReady ? "block" : "hidden"}`}
            />
          ) : (
            <VideoPlaceholder message={placeholderMessage} />
          )}
          
          {videoError && result.videoUrl && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center">
              <AlertCircle className="w-6 h-6 text-amber-500 mb-2" />
              <p className="text-sm text-zinc-355">Không thể phát trực tiếp video. Hãy thử tải về máy của bạn.</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Actions */}
      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-850 select-none text-sm">
          <span className="text-zinc-400 font-mono uppercase tracking-wider text-xs">Trạng thái:</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                result.status === "COMPLETED"
                  ? "bg-emerald-400"
                  : result.status === "FAILED"
                  ? "bg-red-400"
                  : "bg-amber-400 animate-pulse"
              }`}
            />
            <span className="font-semibold font-mono text-xs">
              {result.status === "COMPLETED" ? "HOÀN TẤT" : result.status === "FAILED" ? "THẤT BẠI" : "ĐANG CHẠY"}
            </span>
          </span>
        </div>

        <div className="flex gap-2.5">
          {result.srtUrl && (
            <a
              href={result.srtUrl}
              download={`phude_viet_${result.taskId}.srt`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4.5 py-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-805 text-zinc-300 text-sm font-semibold active:scale-[0.98] transition"
            >
              <Download className="w-4 h-4" />
              <span>Tải Phụ đề</span>
            </a>
          )}
          {result.videoUrl && result.status === "COMPLETED" && (
            <a
              href={result.videoUrl}
              download={`VietCast_${result.taskId}.mp4`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4.5 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-md shadow-brand-500/10 active:scale-[0.98] transition"
            >
              <Download className="w-4 h-4" />
              <span>Tải Video</span>
            </a>
          )}
        </div>
      </div>

      {result.message && (
        <p className="mt-4 text-xs text-zinc-500 italic text-center select-none">{result.message}</p>
      )}
    </div>
  );
});

const VideoPlaceholder = memo(function VideoPlaceholder({ message = "Đang render video..." }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 bg-zinc-950 p-4 text-center select-none">
      <Loader2 className="w-7 h-7 animate-spin text-brand-500 mb-3" />
      <p className="text-sm font-semibold text-zinc-300">{message}</p>
      <p className="text-xs text-zinc-600 mt-1.5 font-medium">Kết quả sẽ hiển thị ngay khi pipeline hoàn thành.</p>
    </div>
  );
});