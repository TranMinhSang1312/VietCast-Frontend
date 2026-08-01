import { useCallback, useEffect, useRef, useState, memo } from "react";
import axios from "axios";
import {
    History,
    Loader2,
    Download,
    AlertCircle,
    Film,
    Subtitles,
    Clock,
    RefreshCw,
    Mic,
    VolumeX,
} from "lucide-react";
import { API_BASE_URL_PROVIDER } from "../config";
import { getVideoModePolicy } from "../config/videoModes";
import { getPublicTaskFailureMessage } from "../utils/taskMessages";
import PaginationControls from "../components/history/PaginationControls";
import { openVideoInline, shouldOpenVideoInline } from "../utils/mobileVideo";
import {
    getPipelineProgress,
    getPipelineStageLabel,
    publishActiveVideoTask,
    readActiveVideoTask,
    sameTaskId,
} from "../utils/videoTaskProgress";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;
const POLL_INTERVAL_MS = 7000;
const PAGE_SIZE = 10;

const MODE_ICONS = Object.freeze({
    original: Mic,
    mute: VolumeX,
    subtitle: Subtitles,
    dub: Film,
    mix: Film,
});

const STATUS_STYLES = {
    PROCESSING: {
        label: "Đang xử lý",
        className: "bg-yellow-400/10 text-yellow-300 border-yellow-400/30",
        dotClass: "bg-yellow-300 animate-pulse",
    },
    COMPLETED: {
        label: "Hoàn tất",
        className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-400",
    },
    FAILED: {
        label: "Thất bại",
        className: "bg-rose-500/10 text-rose-300 border-rose-500/20",
        dotClass: "bg-red-400",
    },
};

const FALLBACK_STATUS_STYLE = {
    label: "UNKNOWN",
    className: "bg-white/[0.04] text-slate-400 border-white/[0.06]",
    dotClass: "bg-zinc-450",
};

function formatTimestamp(value) {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

const StatusPill = memo(function StatusPill({ status }) {
    const style = STATUS_STYLES[status] ?? {
        ...FALLBACK_STATUS_STYLE,
        label: status ?? FALLBACK_STATUS_STYLE.label,
    };
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold font-mono tracking-wider uppercase ${style.className}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${style.dotClass}`} />
            {style.label}
        </span>
    );
});

const ProgressBar = memo(function ProgressBar({ video }) {
    const pct = typeof video?.progress === "number"
        ? Math.max(0, Math.min(100, video.progress))
        : 0;
    const pipeline = getPipelineProgress(video || {});
    const stageLabel = getPipelineStageLabel(video || {});
    return (
        <div className="mt-4 select-none">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-1.5">
                <span className="truncate pr-3">{stageLabel}</span>
                <span className="shrink-0 text-zinc-200">{pct}%</span>
            </div>
            <div
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={pct + "% hoàn thành"}
                className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden"
            >
                <div
                    className="h-full bg-indigo-500 transition-all duration-500 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)]"
                    style={{ width: pct + "%" }}
                />
            </div>
            <div className="mt-3 flex gap-1.5">
                {pipeline.steps.map((step, index) => (
                    <span
                        key={step.key}
                        title={step.label}
                        className={"h-1.5 flex-1 rounded-full transition-colors " + (
                            index < pipeline.completedCount
                                ? "bg-emerald-400"
                                : index === pipeline.activeIndex
                                    ? "bg-indigo-300/80 animate-pulse"
                                    : "bg-white/10"
                        )}
                    />
                ))}
            </div>
        </div>
    );
});
const VideoHistoryItem = memo(function VideoHistoryItem({ video, onRetry }) {
    const status = video.status;
    const isCompleted = status === "COMPLETED";
    const isFailed = status === "FAILED";
    const isProcessing = status === "PROCESSING";
    const [isRetrying, setIsRetrying] = useState(false);
    const [downloadingType, setDownloadingType] = useState(null); // 'video' | 'srt' | null
    const [actionError, setActionError] = useState(null);

    const knownMode = Object.hasOwn(MODE_ICONS, video.audioMode);
    const policy = getVideoModePolicy(video.audioMode);
    const mode = knownMode
        ? { ...policy, icon: MODE_ICONS[policy.id] }
        : {
            label: "Tác vụ video",
            output: video.srtUrl && !video.videoUrl ? "File SRT" : "Kết quả xử lý",
            video: Boolean(video.videoUrl),
            srt: Boolean(video.srtUrl),
            icon: Film,
        };
    const ModeIcon = mode.icon;

    const handleRetryClick = async () => {
        if (isRetrying) return;
        setActionError(null);
        setIsRetrying(true);
        try {
            await onRetry(video.taskId);
        } catch (err) {
            setActionError(err?.message || "Không thể chạy lại tác vụ. Vui lòng thử lại sau.");
        } finally {
            setIsRetrying(false);
        }
    };

    // Mobile opens the public result inline for the native media viewer.
    // Desktop keeps the backend's presigned attachment download.
    const handleDownload = async (type) => {
        if (downloadingType) return; // single in-flight per row
        setActionError(null);
        if (type === "video" && video.videoUrl && shouldOpenVideoInline()) {
            openVideoInline(video.videoUrl);
            return;
        }
        setDownloadingType(type);
        try {
            const resp = await axios.get(
                `${API_BASE_URL}/api/v1/videos/${video.taskId}/download`,
                { params: { type } }
            );
            const { downloadUrl, filename } = resp.data || {};
            if (!downloadUrl) {
                throw new Error("Backend did not return a downloadUrl");
            }
            // Same-origin (backend) → browser respects `download` and
            // R2 honours the `Content-Disposition: attachment` we
            // asked for when presigning. The user gets a Save dialog.
            const a = document.createElement("a");
            a.href = downloadUrl;
            if (filename) a.download = filename;
            a.rel = "noopener";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            // Surface as a non-blocking console + (best-effort) alert.
            // Most common cause: 422 UNSUPPORTED_URL when the row was
            // written before this column existed; fall back to the
            // public URL so the user can still get the file inline.
            const code = err.response?.data?.code;
            const status = err.response?.status;
            const msg = err.response?.data?.message;
            const fallbackUrl = type === "srt" ? video.srtUrl : video.videoUrl;
            if (code === "FILE_EXPIRED" || status === 410) {
                setActionError(msg || "Tệp này đã hết hạn lưu trữ 7 ngày trên hệ thống. Vui lòng thực hiện lại tác vụ nếu cần.");
            } else if (code === "UNSUPPORTED_URL" && fallbackUrl) {
                window.open(fallbackUrl, "_blank", "noopener");
            } else {
                console.error("[download] failed", err);
                setActionError(msg || err.message || "Không thể tải file. Vui lòng thử lại.");
            }
        } finally {
            setDownloadingType(null);
        }
    };

    return (
        <article className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 backdrop-blur-md sm:rounded-3xl sm:p-6">
            <header className="flex items-start justify-between gap-3 mb-3 select-none">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-950 ring-1 ring-white/[0.06] flex items-center justify-center">
                        <ModeIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-slate-100 font-mono">
                                Task #{video.taskId}
                            </h3>
                            <StatusPill status={status} />
                            <span className="inline-flex items-center rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-slate-400">
                                {mode.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-xs font-mono text-zinc-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatTimestamp(video.createdAt)}</span>
                        </div>
                    </div>
                </div>
            </header>

            {video.originalUrl && (
                <p className="text-sm text-zinc-400 truncate mb-4 select-none font-mono">
                  Source: <span className="underline underline-offset-2">{video.originalUrl}</span>
                </p>
            )}

            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-slate-950/40 px-3.5 py-2.5 text-xs">
                <span className="text-slate-500">Đầu ra</span>
                <span className="font-semibold text-slate-200">{mode.output}</span>
            </div>

            {isProcessing && <ProgressBar video={video} />}

            {isFailed && (
                <div className="mt-3 flex items-start gap-2.5 p-4 rounded-xl bg-rose-950/30 border border-rose-900/40 text-sm text-red-200">
                    <AlertCircle className="w-4.5 h-4.5 mt-0.5 shrink-0 text-rose-400" />
                    <span>{getPublicTaskFailureMessage(video.message)}</span>
                </div>
            )}

            {actionError && (
                <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-900/40 bg-rose-950/30 p-3 text-xs text-rose-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <span>{actionError}</span>
                </div>
            )}

            <footer className="mt-5 flex flex-wrap gap-2.5">
                {isCompleted && mode.video && video.videoUrl && (
                    <button
                        type="button"
                        onClick={() => handleDownload("video")}
                        disabled={downloadingType !== null}
                        className="inline-flex items-center justify-center gap-2 px-4.5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 text-slate-950 font-semibold text-xs shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98] transition select-none cursor-pointer"
                    >
                        {downloadingType === "video" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                        {downloadingType === "video" ? (
                            <span>Đang tải...</span>
                        ) : (
                            <>
                                <span className="md:hidden">Lưu vào thư viện</span>
                                <span className="hidden md:inline">Tải video</span>
                            </>
                        )}
                    </button>
                )}

                {isCompleted && mode.srt && video.srtUrl && (
                    <button
                        type="button"
                        onClick={() => handleDownload("srt")}
                        disabled={downloadingType !== null}
                        className="inline-flex items-center justify-center gap-2 px-4.5 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] disabled:opacity-60 text-zinc-350 text-xs font-semibold active:scale-[0.98] transition select-none cursor-pointer"
                    >
                        {downloadingType === "srt" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Subtitles className="w-4 h-4" />
                        )}
                        <span>{downloadingType === "srt" ? "Đang tải..." : "Phụ đề SRT"}</span>
                    </button>
                )}

                {isCompleted && ((mode.video && !video.videoUrl) || (mode.srt && !video.srtUrl)) && (
                    <span className="inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-2.5 text-xs text-amber-200">
                        <AlertCircle className="h-4 w-4" />
                        Chưa nhận đủ file đầu ra
                    </span>
                )}

                {isFailed && (
                    <button
                        type="button"
                        disabled={isRetrying}
                        onClick={handleRetryClick}
                        className="inline-flex items-center justify-center gap-2 px-4.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:opacity-50 text-white font-semibold text-xs active:scale-[0.98] transition select-none cursor-pointer"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                        <span>{isRetrying ? "Đang gửi..." : "Thử lại"}</span>
                    </button>
                )}

                {!isCompleted && !isFailed && (
                    <span className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-slate-950/70 border border-white/[0.06] text-xs font-mono uppercase tracking-wider text-zinc-500 select-none">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                        Đang xử lý...
                    </span>
                )}
            </footer>
        </article>
    );
});

export default function VideoHistory() {
    const [history, setHistory] = useState([]);
    const [page, setPage] = useState(0);
    const [pageInfo, setPageInfo] = useState({ totalItems: 0, totalPages: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const pollTimerRef = useRef(null);
    const historyRef = useRef(history);
    
    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    const fetchHistory = useCallback(async (showSpinner = false) => {
        if (showSpinner) setIsLoading(true);
        try {
            console.log("[VideoHistory] GET /api/v1/tasks — fetching history…");
            const { data, headers } = await axios.get(
                `${API_BASE_URL}/api/v1/tasks`,
                { timeout: 10000, params: { page, size: PAGE_SIZE } }
            );
            console.log(
                `[VideoHistory] GET /api/v1/tasks — received ${Array.isArray(data) ? data.length : "?"} task(s)`
            );
            const items = Array.isArray(data) ? data : [];
            const hasPageMetadata = headers["x-total-pages"] !== undefined;
            const visibleItems = hasPageMetadata
                ? items
                : items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            const active = readActiveVideoTask();
            const hydratedItems = visibleItems.map((item) => (
                active && sameTaskId(item?.taskId, active.taskId)
                    ? {
                        ...item,
                        ...active,
                        taskId: item.taskId,
                        originalUrl: item.originalUrl ?? active.originalUrl ?? active.url,
                    }
                    : item
            ));
            setHistory(hydratedItems);
            setPageInfo(hasPageMetadata
                ? {
                    totalItems: Number(headers["x-total-count"] ?? 0),
                    totalPages: Number(headers["x-total-pages"] ?? 0),
                }
                : {
                    totalItems: items.length,
                    totalPages: Math.ceil(items.length / PAGE_SIZE),
                });
            setError(null);
        } catch (err) {
            console.error("[VideoHistory] GET /api/v1/tasks — FAILED");
            setError(err?.message || "Không thể tải lịch sử. Đang thử lại…");
        } finally {
            if (showSpinner) setIsLoading(false);
        }
    }, [page]);

    const handleRetryTask = useCallback(async (taskId) => {
        try {
            await axios.post(`${API_BASE_URL}/api/v1/videos/${taskId}/retry`);
            const previous = historyRef.current.find((item) => sameTaskId(item?.taskId, taskId));
            const retryTask = {
                ...(previous || {}),
                taskId: String(taskId),
                status: "PROCESSING",
                progress: 0,
                message: "Đang xếp hàng để xử lý lại...",
                submittedAt: new Date().toISOString(),
                videoUrl: null,
                srtUrl: null,
            };
            publishActiveVideoTask(retryTask);
            setHistory((current) => current.map((item) => (
                sameTaskId(item?.taskId, taskId) ? { ...item, ...retryTask } : item
            )));
            fetchHistory(false);
        } catch (err) {
            const serverMessage = err.response?.data?.message || err.message || "Không thể chạy lại tác vụ. Vui lòng thử lại sau.";
            throw new Error(serverMessage, { cause: err });
        }
    }, [fetchHistory]);

    useEffect(() => {
        const onBackgroundStatus = (event) => {
            const next = event.detail;
            if (!next?.taskId) return;
            setHistory((current) => current.map((item) => (
                sameTaskId(item?.taskId, next.taskId) ? { ...item, ...next } : item
            )));
        };
        window.addEventListener("vietcast:video-task-status", onBackgroundStatus);
        return () => window.removeEventListener("vietcast:video-task-status", onBackgroundStatus);
    }, []);
    const clearPollInterval = useCallback(() => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        // Defer the initial state update out of the effect body and cancel
        // it if the page unmounts before the next task.
        const initialFetchTimer = setTimeout(() => fetchHistory(true), 0);

        const tick = () => {
            const current = historyRef.current;
            const hasInFlight =
                Array.isArray(current) &&
                current.some((v) => v && v.status === "PROCESSING");
            if (hasInFlight) fetchHistory(false);
        };

        pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);

        return () => {
            clearTimeout(initialFetchTimer);
            clearPollInterval();
        };
    }, [fetchHistory, clearPollInterval]);

    const handleManualRefresh = useCallback(() => fetchHistory(true), [fetchHistory]);

    const hasItems = Array.isArray(history) && history.length > 0;

    return (
        <div className="relative flex w-full items-start justify-center overflow-x-hidden bg-slate-950 px-3 py-6 font-sans text-slate-100 sm:px-4 sm:py-16">
            {/* Ambient glows */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/8 rounded-full blur-[140px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-600/8 rounded-full blur-[140px] pointer-events-none" />

            <div className="w-full max-w-2xl z-10">
                {/* Header */}
                <header className="mb-6 text-center select-none sm:mb-10">
                    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-400/30 sm:mb-4 sm:h-14 sm:w-14">
                        <History className="w-7 h-7 text-indigo-400" strokeWidth={2} />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tighter text-white sm:text-3xl">
                        Lịch sử Tác vụ
                    </h1>
                </header>

                {/* 7-Day Retention Notice Banner */}
                <div className="mb-6 p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 flex items-start gap-3 backdrop-blur-md">
                    <Clock className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                    <div className="text-xs sm:text-sm text-indigo-200/90 leading-relaxed">
                        <span className="font-semibold text-white">Chính sách lưu trữ 7 ngày:</span> Các tệp Video và Phụ đề kết quả được hệ thống tự động lưu trữ trong <strong className="text-indigo-300 font-bold">7 ngày</strong>. Hãy tải về máy cá nhân của bạn trước khi hết hạn lưu trữ.
                    </div>
                </div>

                {/* Loading state */}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3 select-none">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                        <span className="text-sm font-mono tracking-wider">ĐANG TẢI LỊCH SỬ...</span>
                    </div>
                )}

                {/* Error alert */}
                {!isLoading && error && (
                    <div
                        role="alert"
                        className="flex items-start gap-3 p-4 rounded-xl bg-rose-950/30 border border-rose-900/40 text-red-200 mb-6"
                    >
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-rose-400" />
                        <div className="text-sm leading-relaxed flex-1">
                            <div className="font-semibold mb-0.5">Không tải được dữ liệu</div>
                            {error}
                        </div>
                        <button
                            type="button"
                            onClick={handleManualRefresh}
                            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-900/40 hover:bg-rose-900/60 border border-rose-800/60 text-xs font-semibold text-rose-100 transition active:scale-[0.98] select-none"
                        >
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Thử lại
                        </button>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && !hasItems && (
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-6 text-center backdrop-blur-md select-none sm:rounded-3xl sm:p-10">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-950 border border-white/[0.06] mb-4">
                            <Film className="w-6 h-6 text-zinc-500" />
                        </div>
                        <h2 className="text-base font-semibold text-zinc-300 mb-1.5">
                            Chưa có tác vụ nào
                        </h2>
                        <p className="text-sm text-zinc-500 max-w-[240px] mx-auto leading-relaxed">
                            Chọn một chức năng trên Dashboard để tạo video hoặc phụ đề đầu tiên.
                        </p>
                    </div>
                )}

                {/* History List */}
                {!isLoading && !error && hasItems && (
                    <div className="space-y-4">
                        {history.map((video) => (
                            <VideoHistoryItem
                                key={video.taskId}
                                video={video}
                                onRetry={handleRetryTask}
                            />
                        ))}
                    </div>
                )}

                {!isLoading && !error && (
                    <PaginationControls
                        page={page}
                        totalPages={pageInfo.totalPages}
                        totalItems={pageInfo.totalItems}
                        disabled={isLoading}
                        onChange={(nextPage) => {
                            setPage(nextPage);
                            document.querySelector(".app-scroll-region")?.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                    />
                )}

                {/* Refresh Trigger */}
                {!isLoading && hasItems && (
                    <div className="mt-6 flex items-center justify-end select-none">
                        <button
                            type="button"
                            onClick={handleManualRefresh}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-sm text-zinc-400 hover:text-zinc-200 transition active:scale-[0.98]"
                        >
                            <Loader2 className="w-4 h-4" />
                            Làm mới
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
