import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { XCircle, ArrowLeft, Coins } from "lucide-react";

// ---------------------------------------------------------------------------
// PaymentCancel — landing page for the {@code payos.cancel-url}.
//
// PayOS redirects the browser here when the user clicks "Back" on the
// checkout page. We do NOT cancel the order server-side: the PENDING
// row sits in the DB and will eventually expire (a future cron job
// can mark stale ones CANCELLED — see PaymentOrderRepository).
//
// Why not call /payment/cancel ourselves? PayOS does not require it
// — the redirect is just a UX nicety — and avoiding it keeps the
// cancel page stateless. A user can simply close the browser tab to
// leave the order PENDING.
// ---------------------------------------------------------------------------

export default function PaymentCancel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const orderCode =
    searchParams.get("orderCode") ||
    searchParams.get("id") ||
    null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 p-8 text-center">
        <XCircle
          className="w-16 h-16 mx-auto text-yellow-300"
          strokeWidth={1.5}
        />
        <h1 className="mt-5 text-2xl font-bold text-slate-100">
          Đã hủy thanh toán
        </h1>
        <p className="mt-3 text-slate-400 text-sm">
          Bạn đã đóng trang PayOS trước khi hoàn tất. Không có credit nào
          được cộng — bạn có thể thử lại bất cứ lúc nào.
        </p>

        {orderCode && (
          <div className="mt-4 inline-block rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-1.5 text-xs font-mono text-slate-300">
            {orderCode}
          </div>
        )}

        <p className="mt-5 text-xs text-slate-500 flex items-center justify-center gap-1.5">
          <Coins className="w-3.5 h-3.5" />
          <span>Đơn hàng đã được tạo nhưng chưa thanh toán.</span>
        </p>

        <div className="mt-7 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard", { replace: true })}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Về trang chính</span>
          </button>
          <Link
            to="/dashboard"
            className="px-5 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 text-sm transition"
          >
            Đóng
          </Link>
        </div>
      </div>
    </div>
  );
}