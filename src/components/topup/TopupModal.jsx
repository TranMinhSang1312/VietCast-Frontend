import { useEffect, useState } from "react";
import { Coins, Loader2, X, AlertCircle, ExternalLink } from "lucide-react";
import {
  createPaymentLink,
  formatVnd,
  vndToCredits,
} from "../../services/payment";

// ---------------------------------------------------------------------------
// Quick-pick packages — chosen so 1 000 VND = 1 credit stays whole.
// Picked by product; if pricing changes, update this list AND the
// server-side VND_PER_CREDIT constant together.
// ---------------------------------------------------------------------------
const PRESETS = Object.freeze([
  { vnd: 10_000,  label: "10.000" },        // 10 credits
  { vnd: 50_000,  label: "50.000" },        // 50 credits
  { vnd: 100_000, label: "100.000" },       // 100 credits
  { vnd: 500_000, label: "500.000" },       // 500 credits
  { vnd: 1_000_000, label: "1.000.000" },   // 1 000 credits
]);

const MIN_AMOUNT = 10_000;
const MAX_AMOUNT = 100_000_000;

/**
 * Modal dialog for the PayOS topup flow.
 *
 * <p>Opens a checkout URL in the same tab on a successful create —
 * the merchant page will redirect back to the configured
 * {@code payos.return-url} when the user finishes (or back to
 * {@code payos.cancel-url} if they back out). Both routes are handled
 * by separate {@code pages/PaymentSuccess.jsx} and
 * {@code pages/PaymentCancel.jsx} components.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onSuccess?: (resultUrl: string) => void,
 * }} props
 */
export default function TopupModal({ isOpen, onClose, onSuccess }) {
  const [presetVnd, setPresetVnd] = useState(PRESETS[1].vnd);   // 50k default
  const [customStr, setCustomStr] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reset transient state every time the modal is re-opened so a stale
  // error from a previous attempt does not bleed into a new session.
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setCustomStr("");
      setDescription("");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Custom input wins when non-empty; otherwise use the active preset.
  const effectiveVnd = (() => {
    const parsed = parseInt(customStr.replaceAll(".", ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : presetVnd;
  })();
  const effectiveCredits = vndToCredits(effectiveVnd);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (effectiveVnd < MIN_AMOUNT) {
      setError(`Số tiền tối thiểu là ${formatVnd(MIN_AMOUNT)} VND.`);
      return;
    }
    if (effectiveVnd > MAX_AMOUNT) {
      setError(`Số tiền tối đa là ${formatVnd(MAX_AMOUNT)} VND.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createPaymentLink({
        amount: effectiveVnd,
        description: description.trim() || undefined,
      });
      // PayOS expects a top-level redirect. We do NOT use
      // window.open() — opening in a new tab loses the session
      // cookie that PayOS uses to remember returning users on some
      // banks.
      window.location.href = result.checkoutUrl;
      if (onSuccess) onSuccess(result.checkoutUrl);
    } catch (err) {
      setError(
        err?.message ||
          "Không thể tạo link thanh toán. Vui lòng thử lại sau."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="topup-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        // Click on backdrop closes the modal — but not while a request
        // is in flight, otherwise the user can double-fire by closing
        // and reopening.
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            <h2
              id="topup-title"
              className="text-lg font-semibold text-slate-100"
            >
              Nạp credit qua PayOS
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-50 transition"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Presets */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Chọn gói nhanh
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => {
                const selected =
                  customStr === "" && presetVnd === p.vnd;
                return (
                  <button
                    key={p.vnd}
                    type="button"
                    onClick={() => {
                      setPresetVnd(p.vnd);
                      setCustomStr("");
                    }}
                    disabled={isSubmitting}
                    className={`px-2 py-2.5 rounded-xl text-sm font-medium border transition disabled:opacity-50 ${
                      selected
                        ? "bg-brand-600 border-brand-500 text-white shadow shadow-brand-500/30"
                        : "bg-slate-950/70 border-slate-700 text-slate-300 hover:border-brand-500/60"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <label
              htmlFor="topup-custom"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Hoặc nhập số tiền khác (VND)
            </label>
            <input
              id="topup-custom"
              type="text"
              inputMode="numeric"
              value={customStr}
              onChange={(e) => setCustomStr(e.target.value)}
              disabled={isSubmitting}
              placeholder="vd: 200000"
              className="w-full px-4 py-3 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="topup-desc"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Ghi chú (tùy chọn, hiển thị trên trang PayOS)
            </label>
            <input
              id="topup-desc"
              type="text"
              maxLength={25}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              placeholder="vd: Topup thang 7"
              className="w-full px-4 py-3 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50"
            />
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-slate-950/50 border border-slate-800 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Số tiền thanh toán</div>
              <div className="text-lg font-semibold text-slate-100">
                {formatVnd(effectiveVnd)} VND
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Credit nhận được</div>
              <div className="text-lg font-semibold text-amber-300">
                {effectiveCredits} credit
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-400" />
              <div className="text-sm">{error}</div>
            </div>
          )}

          {/* Helper note */}
          <p className="text-xs text-slate-500 flex items-start gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>
              Bạn sẽ được chuyển sang trang PayOS. Sau khi thanh toán, hệ
              thống tự động cộng credit và chuyển về trang này.
            </span>
          </p>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Đang tạo link thanh toán...</span>
              </>
            ) : (
              <>
                <Coins className="w-5 h-5" />
                <span>Nạp {formatVnd(effectiveVnd)} VND</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}