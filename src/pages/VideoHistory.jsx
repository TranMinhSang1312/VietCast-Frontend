import { useEffect, useRef, useState } from "react";
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
        className:
            "bg-amber-500/15 text-amber-300 border-amber-500/30",
        dotClass: "bg-amber-400 animate-pulse",
    },
    COMPLETED: {
        label: "Hoàn tất",
        className:
            "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        dotClass: "bg-emerald-400",
    },
    FAILED: {
        label: "Thất bại",
        className: "bg-red-500/15 text-red-300 border-red-500/30",
        dotClass: "bg-red-400",
    },
};

function formatTimestamp(value) {
    if (!value) return "—";
    // Backend uses java.time.Instant which serialises as ISO-8601 UTC
    // (e.g. "2026-07-09T01:23:45.678Z"). Normalise then render in local time.
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function StatusPill({ status }) {
    const style = STATUS_STYLES[status] ?? {
        label: status ?? "UNKNOWN",
        className: "bg-slate-700/40 text-slate-300 border-slate-600/40",
        dotClass: "bg-slate-400",
    };
    return (
        <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium ${style.className}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${style.dotClass}`} />
            {style.label}
        </span>
    );
}

function ProgressBar({ value }) {
    const pct = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
    return (
        <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>Tiến độ</span>
                <span className="font-mono text-slate-200">{pct}%</span>
            </div>
            <div
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden"
            >
                <div
                    className="h-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function VideoHistoryItem({ video }) {
    const status = video.status;
    const isCompleted = status === "COMPLETED";
    const isFailed = status === "FAILED";
    const isProcessing = status === "PROCESSING";
    const fileName = `VietCast_${video.taskId}.mp4`;

    return (
        <article className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-lg shadow-black/30 p-5 sm:p-6">
            <header className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
                        <Film className="w-5 h-5 text-brand-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-semibold text-slate-100 truncate">
                                Task {video.taskId}
                            </h3>
                            <StatusPill status={status} />
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatTimestamp(video.createdAt)}</span>
                        </div>
                    </div>
                </div>
            </header>

            {video.message && (
                <p className="text-sm text-slate-400 italic mb-3 line-clamp-2">
                    {video.message}
                </p>
            )}

            {isProcessing && <ProgressBar value={video.progress ?? 0} />}

            {isFailed && (
                <div className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-red-950/30 border border-red-800/40 text-sm text-red-200">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                    <span>{video.message || "Pipeline thất bại. Vui lòng thử lại."}</span>
                </div>
            )}

            <footer className="mt-4 flex flex-wrap gap-2">
                {isCompleted && video.videoUrl ? (
                    <a
                        href={video.videoUrl}
                        download={fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-medium shadow-md shadow-emerald-500/30 transition focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                    >
                        <Download className="w-4 h-4" />
                        <span>Tải xuống Video</span>
                    </a>
                ) : isCompleted ? (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-sm text-slate-400">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Sẵn sàng (file đang được tải)</span>
                    </span>
                ) : null}

                {video.srtUrl && (
                    <a
                        href={video.srtUrl}
                        download={`phude_viet_${video.taskId}.srt`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-medium text-sm transition"
                    >
                        <Subtitles className="w-4 h-4" />
                        <span>Phụ đề SRT</span>
                    </a>
                )}

                {!isCompleted && !isFailed && (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/70 border border-slate-700 text-xs text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Đang chờ pipeline hoàn tất…
                    </span>
                )}
            </footer>
        </article>
    );
}

export default function VideoHistory() {
    const [history, setHistory] = useState([]);
    // isLoading only flips true -> false on the very first load (so the
    // page shows a spinner while history is empty). Subsequent polls run
    // silently in the background and never toggle the spinner.
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const pollTimerRef = useRef(null);
    // Mirror of `history` kept inside a ref so the polling tick can read the
    // current in-flight status without triggering a setState in the timer.
    const historyRef = useRef(history);
    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    const fetchHistory = async (showSpinner = false) => {
        // The setStates below are driven by a network request kicked off
        // inside a useEffect; they are the response, not synchronous churn.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (showSpinner) setIsLoading(true);
        try {
            // GET /api/v1/history is backed by the `usage_logs` table and
            // is filtered to the authenticated user server-side. It is
            // durable (lives across server restarts) whereas the older
            // /api/v1/videos/history read from an in-memory cache that
            // got evicted 30 min after each task terminated.
            const { data } = await axios.get(
                `${API_BASE_URL}/api/v1/history`,
                { timeout: 10000 }
            );
            // Defensive: server may return null briefly during HMR restarts.
            setHistory(Array.isArray(data) ? data : []);
            setError(null);
        } catch (err) {
            // Keep the previous list visible; only surface the error.
            // Interceptor in src/config.js already translated the
            // axios error into a Vietnamese message.
            setError(err?.message || "Không thể tải lịch sử. Đang thử lại…");
        } finally {
            if (showSpinner) setIsLoading(false);
        }
    };

    useEffect(() => {
        // Kick off the initial load — only purpose here is to subscribe to
        // the backend's state, which is exactly what useEffect is for. The
        // subsequent setIsLoading/setHistory calls are responses to the
        // network event, not synchronous state churn.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchHistory(true);

        const tick = () => {
            // Only poll while there is at least one task still being processed,
            // otherwise the page is idle and we do not pummel the backend.
            // Read current history through a ref so we never need to setState
            // just to *decide* whether to issue a network request.
            const current = historyRef.current;
            const hasInFlight =
                Array.isArray(current) &&
                current.some((v) => v && v.status === "PROCESSING");
            if (hasInFlight) fetchHistory(false);
        };

        pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);

        return () => {
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hasItems = Array.isArray(history) && history.length > 0;

    return (
        <div className="min-h-screen w-full flex items-start justify-center px-4 py-10 sm:py-16">
            <div className="w-full max-w-3xl">
                <header className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/30 mb-4">
                        <History className="w-7 h-7 text-brand-500" strokeWidth={2} />
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-br from-white via-slate-200 to-brand-500 bg-clip-text text-transparent">
                        Lịch sử Video
                    </h1>
                    <p className="mt-2 text-sm text-slate-400">
                        Toàn bộ task đã chạy qua VietCast Engine — tải lại video đã hoàn tất ở đây.
                    </p>
                </header>

                {isLoading && (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin mr-3 text-brand-500" />
                        <span>Đang tải lịch sử…</span>
                    </div>
                )}

                {!isLoading && error && (
                    <div
                        role="alert"
                        className="flex items-start gap-3 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 mb-4"
                    >
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-400" />
                        <div className="text-sm leading-relaxed">
                            <div className="font-semibold mb-0.5">Không tải được lịch sử</div>
                            {error}
                        </div>
                        <button
                            type="button"
                            onClick={() => fetchHistory(true)}
                            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/70 border border-red-700/60 text-xs text-red-100 transition"
                        >
                            <Loader2 className="w-3.5 h-3.5" />
                            Thử lại
                        </button>
                    </div>
                )}

                {!isLoading && !error && !hasItems && (
                    <div className="bg-slate-900/60 backdrop-blur-xl border border-dashed border-slate-700/60 rounded-2xl p-10 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700 mb-4">
                            <Film className="w-6 h-6 text-slate-400" />
                        </div>
                        <h2 className="text-base font-semibold text-slate-200 mb-1">
                            Chưa có video nào
                        </h2>
                        <p className="text-sm text-slate-400">
                            Hãy thử tạo một video mới!
                        </p>
                    </div>
                )}

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

                {!isLoading && hasItems && (
                    <div className="mt-6 flex items-center justify-end">
                        <button
                            type="button"
                            onClick={() => fetchHistory(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 transition"
                        >
                            <Loader2 className="w-3.5 h-3.5" />
                            Làm mới
                        </button>
                    </div>
                )}

                <footer className="mt-10 text-center text-xs text-slate-500">
                    VietCast Engine · Trang lịch sử · API: <span className="font-mono">{API_BASE_URL}/api/v1/videos/history</span>
                </footer>
            </div>
        </div>
    );
}
