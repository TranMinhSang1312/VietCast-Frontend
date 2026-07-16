import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Coins,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Receipt,
} from "lucide-react";
import { listMyTopups } from "../services/payment";

// ---------------------------------------------------------------------------
// TopupHistory — "Lịch sử nạp credit" page.
//
// Renders every PayOS topup the signed-in user has created, newest first.
// Includes PENDING rows (in-flight checkouts that have not landed yet) and
// CANCELLED / FAILED rows (failed attempts the user might want to retry).
//
// Auto-refreshes every 15 s while at least one PENDING row is visible so
// the page flips to SUCCESS without a manual reload when a slow webhook
// lands.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 15_000;

const STATUS_STYLES = {
  PENDING: {
    label: "Đang chờ",
    icon: Clock,
    className: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    dotClass: "bg-amber-400 animate-pulse",
  },
  SUCCESS: {
    label: "Thành công",
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    dotClass: "bg-emerald-400",
  },
  CANCELLED: {
    label: "Đã huỷ",
    icon: XCircle,
    className: "bg-zinc-800/40 text-zinc-300 border-zinc-700/40",
    dotClass: "bg-zinc-400",
  },
  FAILED: {
    label: "Thất bại",
    icon: XCircle,
    className: "bg-red-500/10 text-red-300 border-red-500/20",
    dotClass: "bg-red-400",
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

function formatVnd(vnd) {
  if (typeof vnd !== "number" || Number.isNaN(vnd)) return "0";
  return Math.round(vnd).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export default function TopupHistory() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    try {
      const list = await listMyTopups({ page: 0, size: 50 });
      setOrders(list);
      setError(null);
    } catch (err) {
      setError(err?.message || "Không thể tải lịch sử nạp. Đang thử lại…");
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(true);
  }, [fetch]);

  // While there is at least one PENDING row visible, poll so the page
  // flips to SUCCESS when the webhook eventually credits the user.
  // Stop polling as soon as everything is terminal — no point hammering
  // the API for an empty reason.
  useEffect(() => {
    const hasPending = orders.some((o) => o.status === "PENDING");
    if (!hasPending) return undefined;
    const id = setInterval(() => fetch(false), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [orders, fetch]);

  const hasItems = Array.isArray(orders) && orders.length > 0;

  return (
    <div className="w-full flex items-start justify-center px-4 py-10 sm:py-16 bg-zinc-950 font-sans text-zinc-100 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/3 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-2xl z-10">
        <header className="text-center mb-10 select-none">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
            <Receipt className="w-7 h-7 text-amber-400" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-white">
            Lịch sử nạp credit
          </h1>
          <p className="mt-2.5 text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Tất cả các giao dịch nạp credit qua PayOS / VietQR trên tài khoản của bạn.
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
              <Coins className="w-6 h-6 text-zinc-500" />
            </div>
            <h2 className="text-base font-semibold text-zinc-300 mb-1.5">
              Chưa có giao dịch nạp nào
            </h2>
            <p className="text-sm text-zinc-500 max-w-[240px] mx-auto leading-relaxed">
              Bấm nút "Nạp tiền" trên thanh công cụ để bắt đầu.
            </p>
          </div>
        )}

        {!isLoading && !error && hasItems && (
          <div className="space-y-4">
            {orders.map((o) => {
              const style = STATUS_STYLES[o.status] ?? STATUS_STYLES.PENDING;
              const StatusIcon = style.icon;
              return (
                <article
                  key={o.orderCode}
                  className="bg-zinc-900/25 border border-zinc-900 rounded-2xl p-5 sm:p-6 backdrop-blur-md"
                >
                  <header className="flex items-start justify-between gap-3 mb-3 select-none">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-zinc-150 font-mono truncate">
                          {o.orderCode}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold font-mono tracking-wider uppercase ${style.className}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dotClass}`} />
                          {style.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-xs font-mono text-zinc-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Tạo: {formatDateTime(o.createdAt)}</span>
                        {o.paidAt && (
                          <>
                            <span className="mx-1">·</span>
                            <StatusIcon className="w-3.5 h-3.5" />
                            <span>Thanh toán: {formatDateTime(o.paidAt)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </header>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="rounded-xl bg-zinc-950/60 border border-zinc-900 px-4 py-3">
                      <div className="text-[10px] uppercase tracking-wider font-mono text-zinc-500 mb-1">
                        Số tiền
                      </div>
                      <div className="text-base font-bold text-zinc-100 font-mono">
                        {formatVnd(o.amountVnd)} <span className="text-xs text-zinc-500">VND</span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-zinc-950/60 border border-zinc-900 px-4 py-3">
                      <div className="text-[10px] uppercase tracking-wider font-mono text-zinc-500 mb-1">
                        Credit
                      </div>
                      <div className="text-base font-bold text-amber-300 font-mono inline-flex items-center gap-1.5">
                        <Coins className="w-4 h-4" />
                        +{o.creditAmount}
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
