import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Coins,
  Loader2,
  AlertCircle,
  History,
  Wallet,
  Languages,
  Mic2,
  Film,
  Gift,
  RefreshCcw,
} from "lucide-react";
import { listMyTransactions, TX_TYPE } from "../services/transactions";

// ---------------------------------------------------------------------------
// CreditUsageHistory — "Lịch sử tiêu credit" page.
//
// Renders every credit-movement Transaction row for the signed-in user,
// newest first. Spend events (TRANSLATE / TTS / VIDEO_RENDER) are shown
// with a minus-sign in red; TOPUP / REFUND / ADMIN_GRANT in green.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 15_000;

const TYPE_META = {
  [TX_TYPE.TOPUP]: {
    label: "Nạp credit",
    icon: Coins,
    colorClass: "text-amber-300",
    signClass: "text-amber-300",
  },
  [TX_TYPE.TRANSLATE]: {
    label: "Dịch thuật",
    icon: Languages,
    colorClass: "text-sky-300",
    signClass: "text-red-300",
  },
  [TX_TYPE.TTS]: {
    label: "Text-to-Speech",
    icon: Mic2,
    colorClass: "text-violet-300",
    signClass: "text-red-300",
  },
  [TX_TYPE.VIDEO_RENDER]: {
    label: "Render video",
    icon: Film,
    colorClass: "text-pink-300",
    signClass: "text-red-300",
  },
  [TX_TYPE.REFUND]: {
    label: "Hoàn credit",
    icon: RefreshCcw,
    colorClass: "text-emerald-300",
    signClass: "text-emerald-300",
  },
  [TX_TYPE.ADMIN_GRANT]: {
    label: "Admin cấp credit",
    icon: Gift,
    colorClass: "text-emerald-300",
    signClass: "text-emerald-300",
  },
};

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export default function CreditUsageHistory() {
  const [txns, setTxns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    try {
      const list = await listMyTransactions({ page: 0, size: 100 });
      setTxns(list);
      setError(null);
    } catch (err) {
      setError(err?.message || "Không thể tải lịch sử sử dụng. Đang thử lại…");
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(true);
  }, [fetch]);

  useEffect(() => {
    const id = setInterval(() => fetch(false), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetch]);

  const hasItems = Array.isArray(txns) && txns.length > 0;

  return (
    <div className="min-h-screen w-full flex items-start justify-center px-4 py-10 sm:py-16 bg-zinc-950 font-sans text-zinc-100 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-500/3 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-2xl z-10">
        <header className="text-center mb-10 select-none">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-violet-500/10 border border-violet-500/20 mb-4">
            <Wallet className="w-7 h-7 text-violet-300" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-white">
            Lịch sử sử dụng credit
          </h1>
          <p className="mt-2.5 text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Tất cả biến động credit: nạp, dịch, TTS, render video, hoàn credit. Mới nhất trước.
          </p>
        </header>

        <div className="mb-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Về trang chính</span>
          </Link>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3 select-none">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            <span className="text-sm font-mono tracking-wider">ĐANG TẢI LỊCH SỬ…</span>
          </div>
        )}

        {!isLoading && error && (
          <div
            role="alert"
            className="flex items-start gap-3 p-4 rounded-xl bg-red-950/20 border border-red-900/40 text-red-200 mb-6"
          >
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-400" />
            <div className="text-sm leading-relaxed flex-1">
              <div className="font-semibold mb-0.5">Không tải được dữ liệu</div>
              {error}
            </div>
            <button
              type="button"
              onClick={() => fetch(true)}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-900/40 hover:bg-red-900/70 border border-red-700/60 text-xs font-semibold text-red-100 transition active:scale-[0.98] select-none"
            >
              <Loader2 className="w-3.5 h-3.5" />
              Thử lại
            </button>
          </div>
        )}

        {!isLoading && !error && !hasItems && (
          <div className="bg-zinc-900/25 border border-zinc-900 rounded-2xl p-10 text-center backdrop-blur-md select-none">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-850 mb-4">
              <History className="w-6 h-6 text-zinc-500" />
            </div>
            <h2 className="text-base font-semibold text-zinc-300 mb-1.5">
              Chưa có biến động nào
            </h2>
            <p className="text-sm text-zinc-500 max-w-[260px] mx-auto leading-relaxed">
              Khi bạn nạp credit hoặc sử dụng các chức năng dịch / TTS / render video, lịch sử sẽ xuất hiện tại đây.
            </p>
          </div>
        )}

        {!isLoading && !error && hasItems && (
          <div className="space-y-3">
            {txns.map((t) => {
              const meta = TYPE_META[t.type] ?? {
                label: t.type,
                icon: Coins,
                colorClass: "text-zinc-300",
                signClass: t.amount >= 0 ? "text-emerald-300" : "text-red-300",
              };
              const Icon = meta.icon;
              const isCredit = (t.amount ?? 0) >= 0;
              return (
                <article
                  key={t.id}
                  className="bg-zinc-900/25 border border-zinc-900 rounded-xl p-4 sm:p-5 backdrop-blur-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="shrink-0 w-9 h-9 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                        <Icon className={`w-4.5 h-4.5 ${meta.colorClass}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`text-sm font-semibold ${meta.colorClass}`}>
                            {meta.label}
                          </h3>
                          {t.reference && (
                            <span className="font-mono text-[10px] text-zinc-500 truncate">
                              #{t.reference}
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <p className="mt-0.5 text-xs text-zinc-400 truncate">
                            {t.description}
                          </p>
                        )}
                        <div className="mt-1 text-[11px] font-mono text-zinc-500">
                          {formatDateTime(t.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-base font-bold font-mono ${meta.signClass}`}>
                        {isCredit ? "+" : ""}
                        {t.amount}
                      </div>
                      <div className="mt-0.5 text-[10px] font-mono text-zinc-500">
                        sau: {t.creditAfter}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!isLoading && hasItems && (
          <div className="mt-6 flex items-center justify-end select-none">
            <button
              type="button"
              onClick={() => fetch(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 text-sm text-zinc-400 hover:text-zinc-200 transition active:scale-[0.98]"
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
