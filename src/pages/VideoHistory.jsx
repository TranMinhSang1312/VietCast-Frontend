import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import axios from "axios";
import {
    History,
    Loader2,
    Download,
    CheckCircle2,
    AlertCircle,
    Film,
    Subtitles,
    Clock,
} from "lucide-react";
import { API_BASE_URL_PROVIDER } from "../config";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;
const POLL_INTERVAL_MS = 7000;

const STATUS_STYLES = {
    PROCESSING: {
        label: "Đang xử lý",
        className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        dotClass: "bg-amber-400 animate-pulse",
    },
    COMPLETED: {
        label: "Hoàn tất",
        className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-400",
    },
    FAILED: {
        label: "Thất bại",
        className: "bg-red-500/10 text-red-400 border-red-500/20",
        dotClass: "bg-red-400",
    },
};

const FALLBACK_STATUS_STYLE = {
    label: "UNKNOWN",
    className: "bg-zinc-800/40 text-zinc-400 border-zinc-700/40",
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
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-medium font-mono tracking-wider uppercase ${style.className}`}
        >
            <span className={`w-1.2 h-1.2 rounded-full ${style.dotClass}`} />
            {style.label}
        </span>
    );
});

const ProgressBar = memo(function ProgressBar({ value }) {
    const pct = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
    return (
        <div className="mt-3 select-none">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1">
                <span>TIẾN ĐỘ</span>
                <span className="text-zinc-200">{pct}%</span>
            </div>
            <div
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1 w-full rounded-full bg-zinc-900 overflow-hidden"
            >
                <div
                    className="h-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
});

const VideoHistoryItem = memo(function VideoHistoryItem({ video }) {
    const status = video.status;
    const isCompleted = status === "COMPLETED";
    const isFailed = status === "FAILED";
    const isProcessing = status === "PROCESSING";
    const fileName = useMemo(
        () => `VietCast_${video.taskId}.mp4`,
        [video.taskId],
    );
    const srtName = useMemo(
        () => `phude_viet_${video.taskId}.srt`,
        [video.taskId],
    );

    return (
        <article className="bg-zinc-900/25 border border-zinc-900 rounded-2xl p-5 sm:p-6 backdrop-blur-md">
            <header className="flex items-start justify-between gap-3 mb-3 select-none">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                        <Film className="w-4.5 h-4.5 text-zinc-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-zinc-150 font-mono">
                                Task #{video.taskId}
                            </h3>
                            <StatusPill status={status} />
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono text-zinc-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatTimestamp(video.createdAt)}</span>
                        </div>
                    </div>
                </div>
            </header>

            {video.originalUrl && (
                <p className="text-xs text-zinc-500 truncate mb-3 select-none font-mono">
                  Source: <span className="underline underline-offset-2">{video.originalUrl}</span>
                </p>
            )}

            {isProcessing && <ProgressBar value={video.progress ?? 0} />}

            {isFailed && (
                <div className="mt-2 flex items-start gap-2.5 p-3 rounded-xl bg-red-950/20 border border-red-900/40 text-xs text-red-200">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                    <span>{video.message || "Quá trình render thất bại. Vui lòng kiểm tra log hệ thống."}</span>
                </div>
            )}

            <footer className="mt-4 flex flex-wrap gap-2">
                {isCompleted && video.videoUrl ? (
                    <a
                        href={video.videoUrl}
                        download={fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium text-xs shadow-md shadow-brand-500/10 active:scale-[0.98] transition select-none"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải video</span>
                    </a>
                ) : isCompleted ? (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-950 border border-zinc-850 text-xs text-zinc-500 select-none font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>FILE SẴN SÀNG</span>
                    </span>
                ) : null}

                {video.srtUrl && (
                    <a
                        href={video.srtUrl}
                        download={srtName}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 text-zinc-350 text-xs font-medium active:scale-[0.98] transition select-none"
                    >
                        <Subtitles className="w-3.5 h-3.5" />
                        <span>Phụ đề SRT</span>
                    </a>
                )}

                {!isCompleted && !isFailed && (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-950/70 border border-zinc-900 text-[10px] font-mono uppercase tracking-wider text-zinc-500 select-none">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Đang xếp hàng...
                    </span>
                )}
            </footer>
        </article>
    );
});

export default function VideoHistory() {
    const [history, setHistory] = useState([]);
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
            const { data } = await axios.get(
                `${API_BASE_URL}/api/v1/tasks`,
                { timeout: 10000 }
            );
            console.log(
                `[VideoHistory] GET /api/v1/tasks — received ${Array.isArray(data) ? data.length : "?"} task(s)`
            );
            setHistory(Array.isArray(data) ? data : []);
            setError(null);
        } catch (err) {
            console.error("[VideoHistory] GET /api/v1/tasks — FAILED");
            setError(err?.message || "Không thể tải lịch sử. Đang thử lại…");
        } finally {
            if (showSpinner) setIsLoading(false);
        }
    }, []);

    const clearPollInterval = useCallback(() => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        fetchHistory(true);

        const tick = () => {
            const current = historyRef.current;
            const hasInFlight =
                Array.isArray(current) &&
                current.some((v) => v && v.status === "PROCESSING");
            if (hasInFlight) fetchHistory(false);
        };

        pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);

        return clearPollInterval;
    }, [fetchHistory, clearPollInterval]);

    const handleManualRefresh = useCallback(() => fetchHistory(true), [fetchHistory]);

    const hasItems = Array.isArray(history) && history.length > 0;

    return (
        <div className="min-h-screen w-full flex items-start justify-center px-4 py-10 sm:py-16 bg-zinc-950 font-sans text-zinc-100 relative overflow-x-hidden">
            {/* Ambient glows */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/3 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-brand-500/2 rounded-full blur-[100px] pointer-events-none" />

            <div className="w-full max-w-2xl z-10">
                {/* Header */}
                <header className="text-center mb-8 select-none">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 mb-4">
                        <History className="w-6 h-6 text-brand-500" strokeWidth={2} />
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tighter text-white">
                        Lịch sử Tác vụ
                    </h1>
                    <p className="mt-2 text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                        Toàn bộ các tác vụ dịch thuật và lồng tiếng video đã thực hiện trên tài khoản của bạn.
                    </p>
                </header>

                {/* Loading state */}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3 select-none">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                        <span className="text-xs font-mono">ĐANG TẢI LỊCH SỬ...</span>
                    </div>
                )}

                {/* Error alert */}
                {!isLoading && error && (
                    <div
                        role="alert"
                        className="flex items-start gap-3 p-4 rounded-xl bg-red-950/20 border border-red-900/40 text-red-200 mb-6"
                    >
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-400" />
                        <div className="text-xs leading-relaxed flex-1">
                            <div className="font-semibold mb-0.5">Không tải được dữ liệu</div>
                            {error}
                        </div>
                        <button
                            type="button"
                            onClick={handleManualRefresh}
                            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/70 border border-red-700/60 text-[10px] font-medium text-red-100 transition active:scale-[0.98] select-none"
                        >
                            <Loader2 className="w-3 h-3" />
                            Thử lại
                        </button>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && !hasItems && (
                    <div className="bg-zinc-900/25 border border-zinc-900 rounded-2xl p-10 text-center backdrop-blur-md select-none">
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-850 mb-4">
                            <Film className="w-5 h-5 text-zinc-500" />
                        </div>
                        <h2 className="text-sm font-semibold text-zinc-300 mb-1">
                            Chưa có tác vụ nào
                        </h2>
                        <p className="text-xs text-zinc-500 max-w-[200px] mx-auto leading-relaxed">
                            Bắt đầu bằng cách tạo một yêu cầu lồng tiếng video mới!
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
                            />
                        ))}
                    </div>
                )}

                {/* Refresh Trigger */}
                {!isLoading && hasItems && (
                    <div className="mt-6 flex items-center justify-end select-none">
                        <button
                            type="button"
                            onClick={handleManualRefresh}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 text-xs text-zinc-400 hover:text-zinc-200 transition active:scale-[0.98]"
                        >
                            <Loader2 className="w-3.5 h-3.5" />
                            Làm mới
                        </button>
                    </div>
                )}

                {/* Footer API Info */}
                <footer className="mt-16 text-center text-[10px] font-mono text-zinc-600 select-none">
                    VietCast Engine · Trang lịch sử · API: <span className="text-zinc-500">{API_BASE_URL}/api/v1/tasks</span>
                </footer>
            </div>
        </div>
    );
}