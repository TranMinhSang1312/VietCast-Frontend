import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Coins, Loader2, XCircle, ArrowRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

// ---------------------------------------------------------------------------
// PaymentSuccess — landing page for the {@code payos.return-url}.
//
// PayOS redirects the browser back here after a successful payment.
// It MAY have already POSTed the matching webhook to the backend (which
// is what actually credits the user) OR it may still be in flight —
// the redirect can race the webhook delivery. We poll
// {@code AuthContext.refreshProfile} every 2 s for up to 30 s, then
// hand off to /dashboard so a slow webhook does not block the user
// from continuing. The next manual refresh will catch any missed
// credit.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState(0);
  const [creditBefore, setCreditBefore] = useState(
    () => user?.creditBalance ?? 0
  );
  const [creditAfter, setCreditAfter] = useState(null);
  const [error, setError] = useState(null);
  // Guard against double-mount in React 19 strict mode firing two
  // polling intervals at once.
  const stoppedRef = useRef(false);

  const orderCode = searchParams.get("orderCode")
    || searchParams.get("id")
    || null;

  useEffect(() => {
    let timer = null;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    async function poll() {
      if (stoppedRef.current) return;
      const updated = await refreshProfile();
      if (updated) {
        setCreditAfter(updated.creditBalance);
        if (updated.creditBalance > creditBefore) {
          // Webhook landed — stop polling.
          stoppedRef.current = true;
          return;
        }
      }
      setAttempts((n) => n + 1);
      if (Date.now() < deadline && !stoppedRef.current) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        // Out of patience. Show the success UI anyway — the credit
        // will land on the next refresh. Better UX than a confusing
        // spinner that never resolves.
        stoppedRef.current = true;
      }
    }

    poll();
    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
    };
    // creditBefore is captured at mount; we only want the closure to
    // re-create when the component remounts, not when local state
    // changes. eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const credited = creditAfter !== null && creditAfter > creditBefore;
  const creditedAmount =
    creditAfter !== null && creditBefore !== null
      ? Math.max(0, creditAfter - creditBefore)
      : 0;
  const stillWaiting = !stoppedRef.current && !credited && !error;

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 p-8 text-center">
        {credited ? (
          <CheckCircle2
            className="w-16 h-16 mx-auto text-emerald-400"
            strokeWidth={1.5}
          />
        ) : error ? (
          <XCircle
            className="w-16 h-16 mx-auto text-red-400"
            strokeWidth={1.5}
          />
        ) : (
          <Loader2
            className="w-16 h-16 mx-auto text-brand-400 animate-spin"
            strokeWidth={1.5}
          />
        )}

        <h1 className="mt-5 text-2xl font-bold text-slate-100">
          {credited
            ? "Nạp credit thành công"
            : error
              ? "Không thể xác nhận thanh toán"
              : stillWaiting
                ? "Đang xác nhận thanh toán..."
                : "Đã nhận được yêu cầu thanh toán"}
        </h1>

        <p className="mt-3 text-slate-400 text-sm">
          {credited ? (
            <>
              Đã cộng{" "}
              <span className="font-semibold text-amber-300">
                {creditedAmount} credit
              </span>
              . Số dư hiện tại:{" "}
              <span className="font-semibold text-slate-100">
                {creditAfter}
              </span>
              .
            </>
          ) : error ? (
            error
          ) : stillWaiting ? (
            <>
              Hệ thống đang đợi PayOS xác nhận giao dịch. Vui lòng giữ
              trang này mở trong vài giây...
            </>
          ) : (
            <>
              PayOS đã báo thanh toán thành công nhưng hệ thống chưa cộng
              credit tự động. Vui lòng tải lại trang sau vài phút — nếu vẫn
              chưa nhận được, liên hệ hỗ trợ với mã đơn{" "}
              <span className="font-mono text-slate-200">
                {orderCode ?? "?"}
              </span>
              .
            </>
          )}
        </p>

        {orderCode && (
          <div className="mt-4 inline-block rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-1.5 text-xs font-mono text-slate-300">
            {orderCode}
          </div>
        )}

        <div className="mt-7 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard", { replace: true })}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-medium shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 transition"
          >
            <span>Về trang chính</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <Link
            to="/dashboard"
            className="px-5 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 text-sm transition"
          >
            Đóng
          </Link>
        </div>

        {!credited && !error && (
          <p className="mt-4 text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <Coins className="w-3.5 h-3.5" />
            <span>Đã thử {attempts} lần ({Math.round(attempts * POLL_INTERVAL_MS / 1000)}s)</span>
          </p>
        )}
      </div>
    </div>
  );
}