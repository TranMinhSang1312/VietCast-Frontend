import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Coins, Loader2, XCircle, ArrowRight, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { confirmPayment } from "../services/payment";

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
//
// As a fallback for environments where the webhook never reaches us
// (typical localhost dev: PayOS servers cannot POST to a private IP),
// the page also exposes a "Tôi đã thanh toán — kiểm tra ngay" button
// that calls POST /api/v1/payment/confirm/{orderCode} to manually
// reconcile the order.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState(0);
  // Baseline balance is captured AFTER the first profile refresh (not
  // from a possibly-stale ``user?.creditBalance`` snapshot from
  // localStorage). This avoids displaying "credited N" against a
  // baseline the user already had bumped in another tab.
  const [creditBefore, setCreditBefore] = useState(null);
  const [creditAfter, setCreditAfter] = useState(null);
  const [error, setError] = useState(null);
  // Manual reconciliation state — triggered by the "Tôi đã thanh toán"
  // button as a fallback when the webhook never arrives (dev localhost).
  const [confirming, setConfirming] = useState(false);
  const [confirmOutcome, setConfirmOutcome] = useState(null);
  // Guard against double-mount in React 19 strict mode firing two
  // polling intervals at once.
  const stoppedRef = useRef(false);

  const orderCode = searchParams.get("orderCode")
    || searchParams.get("id")
    || null;

  useEffect(() => {
    let timer = null;
    let cancelled = false;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    async function poll() {
      if (stoppedRef.current || cancelled) return;
      const updated = await refreshProfile();
      if (cancelled) return;
      if (updated) {
        // Lock in the FIRST observed balance as the baseline. The
        // server is authoritative here; if the webhook landed in the
        // few hundred ms between page load and first poll, this still
        // reflects the user's actual pre-payment balance (because the
        // webhook is idempotent and our baseline is captured once).
        if (creditBefore == null) {
          setCreditBefore(updated.creditBalance);
          setCreditAfter(updated.creditBalance);
        } else {
          setCreditAfter(updated.creditBalance);
          if (updated.creditBalance > creditBefore) {
            // Webhook landed — stop polling.
            stoppedRef.current = true;
            return;
          }
        }
      }
      setAttempts((n) => n + 1);
      if (Date.now() < deadline && !stoppedRef.current && !cancelled) {
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
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // creditBefore is captured on the first poll; we only want the
    // closure to re-create when the component remounts, not when local
    // state changes. eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const credited = creditAfter !== null && creditBefore !== null && creditAfter > creditBefore;
  const creditedAmount =
    creditAfter !== null && creditBefore !== null
      ? Math.max(0, creditAfter - creditBefore)
      : 0;
  const stillWaiting = !stoppedRef.current && !credited && !error && creditBefore !== null;

  // Translate a ConfirmOutcome string from the backend into a friendly
  // Vietnamese message. We deliberately do NOT echo the SDK error text
  // because the user does not need to know about webhook races.
  const confirmLabel = (() => {
    if (!confirmOutcome) return null;
    switch (confirmOutcome) {
      case "JUST_PAID":
        return "Đã ghi nhận thanh toán và cộng credit thành công.";
      case "ALREADY_TERMINAL":
        return "Giao dịch này đã được xử lý trước đó.";
      case "STILL_PENDING":
        return "Hệ thống chưa nhận được xác nhận từ PayOS. Vui lòng đợi thêm vài giây rồi thử lại.";
      case "UNKNOWN_ORDER":
        return "Không tìm thấy giao dịch này. Vui lòng kiểm tra lại mã đơn hoặc liên hệ hỗ trợ.";
      default:
        return null;
    }
  })();

  // Manual reconciliation handler. POSTs to the backend which asks
  // PayOS for the authoritative order status. Safe to spam — the
  // backend is idempotent and returns JUST_PAID once.
  const handleManualConfirm = async () => {
    if (!orderCode || confirming) return;
    setConfirming(true);
    setConfirmOutcome(null);
    try {
      const res = await confirmPayment(orderCode);
      setConfirmOutcome(res.outcome);
      // Pull the latest balance so the "Số dư hiện tại" line updates
      // even when the polling loop has already stopped.
      const refreshed = await refreshProfile();
      if (res.outcome === "JUST_PAID" || res.outcome === "ALREADY_TERMINAL") {
        // Stop the polling loop AND mirror the post-credit balance into
        // local state so `credited` flips true and the "Đã thử N lần"
        // affordance disappears. Without this branch the page lingers
        // on the "Đã nhận được yêu cầu thanh toán" state even though
        // credit already landed — confusing because the success banner
        // never appears.
        const finalBalance =
          typeof res.creditBalance === "number"
            ? res.creditBalance
            : refreshed?.creditBalance ?? null;
        if (finalBalance !== null) {
          // Seed creditBefore to the same value so the "+creditedAmount"
          // copy reads sensibly (delta is 0 on a no-op ALREADY_TERMINAL
          // path, which is correct — credit landed on a prior flow).
          setCreditBefore((prev) => (prev == null ? finalBalance : prev));
          setCreditAfter(finalBalance);
        }
        stoppedRef.current = true;
      }
    } catch {
      setConfirmOutcome("STILL_PENDING");
    } finally {
      setConfirming(false);
    }
  };

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
            className="w-16 h-16 mx-auto text-rose-400"
            strokeWidth={1.5}
          />
        ) : (
          <Loader2
            className="w-16 h-16 mx-auto text-indigo-400 animate-spin"
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
              <span className="font-semibold text-yellow-300">
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
              Hệ thống đang xác nhận giao dịch với PayOS. Vui lòng giữ
              trang này mở trong vài giây...
            </>
          ) : (
            <>
              Thanh toán đã được PayOS xác nhận. Hệ thống đang xử lý và sẽ
              cộng credit cho bạn trong ít phút. Bạn có thể tải lại trang
              chính để kiểm tra — credit sẽ tự động hiển thị khi sẵn sàng.
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
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-medium shadow-[0_18px_60px_-18px_rgba(99,102,241,0.55)] hover:shadow-[0_18px_60px_-18px_rgba(99,102,241,0.7)] transition"
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

        {/* Manual reconciliation block — only useful when polling has
            timed out and credit has not yet landed. We hide it once
            credited to avoid suggesting duplicate actions. */}
        {!credited && !error && orderCode && (
          <div className="mt-6 pt-5 border-t border-slate-700/60">
            <button
              type="button"
              onClick={handleManualConfirm}
              disabled={confirming}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-medium border border-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang kiểm tra với PayOS...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Tôi đã thanh toán — kiểm tra ngay</span>
                </>
              )}
            </button>
            {confirmLabel && (
              <p
                className={`mt-3 text-xs text-center ${
                  confirmOutcome === "JUST_PAID"
                    ? "text-emerald-300"
                    : confirmOutcome === "ALREADY_TERMINAL"
                      ? "text-slate-300"
                      : "text-yellow-300"
                }`}
              >
                {confirmLabel}
              </p>
            )}
          </div>
        )}

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