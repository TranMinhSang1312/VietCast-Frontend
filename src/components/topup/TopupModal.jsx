import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Coins, Loader2, X, AlertCircle, ExternalLink, Receipt, Wallet } from "lucide-react";
import {
  createPaymentLink,
  formatVnd,
  vndToCredits,
} from "../../services/payment";

const PRESETS = Object.freeze([
  { vnd: 10_000,  label: "10.000" },
  { vnd: 50_000,  label: "50.000" },
  { vnd: 100_000, label: "100.000" },
  { vnd: 500_000, label: "500.000" },
  { vnd: 1_000_000, label: "1.000.000" },
]);

const MIN_AMOUNT = 10_000;
const MAX_AMOUNT = 100_000_000;

export default function TopupModal({ isOpen, onClose, onSuccess }) {
  const [presetVnd, setPresetVnd] = useState(PRESETS[1].vnd); // 50k default
  const [customStr, setCustomStr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setCustomStr("");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
      // Backend now automatically generates a safe random transaction description (e.g. VC123456)
      // to avoid validation issues with Vietnamese accents/spaces.
      const result = await createPaymentLink({
        amount: effectiveVnd,
      });

      // Security: only redirect to known PayOS hosts. A compromised
      // backend (or a buggy proxy) returning a phishing URL would
      // otherwise land the user on a clone of the PayOS checkout.
      let parsedUrl;
      try {
        parsedUrl = new URL(result.checkoutUrl);
      } catch {
        throw new Error("Phản hồi từ máy chủ không chứa URL hợp lệ.");
      }
      if (parsedUrl.protocol !== "https:") {
        throw new Error("Link thanh toán phải dùng giao thức HTTPS.");
      }
      const host = parsedUrl.hostname.toLowerCase();
      const allowed =
        host === "payos.vn" ||
        host === "checkout.payos.vn" ||
        host.endsWith(".payos.vn");
      if (!allowed) {
        throw new Error(
          "Link thanh toán trỏ tới máy chủ không xác định — đã hủy."
        );
      }

      // Navigate BEFORE firing the callback so the navigation wins the
      // microtask race (the callback would otherwise schedule a setState
      // on a component about to unmount).
      window.location.href = parsedUrl.toString();
      if (onSuccess) onSuccess(parsedUrl.toString());
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
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden font-sans text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900">
          <div className="flex items-center gap-2 select-none">
            <Coins className="w-5 h-5 text-amber-500" />
            <h2
              id="topup-title"
              className="text-sm font-bold tracking-tight text-zinc-200"
            >
              Nạp credit qua PayOS
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-250 hover:bg-zinc-900 disabled:opacity-50 transition active:scale-[0.95]"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Presets */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2 select-none">
              Chọn gói nhanh (VND)
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
                    className={`px-2 py-2 rounded-xl text-xs font-medium border transition disabled:opacity-50 select-none ${
                      selected
                        ? "bg-brand-500 border-brand-500 text-white shadow-md shadow-brand-500/10 active:scale-[0.98]"
                        : "bg-zinc-950/70 border-zinc-850 text-zinc-400 hover:border-zinc-700 active:scale-[0.98]"
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
              className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2 select-none"
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
              className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-850 text-zinc-100 placeholder:text-zinc-650 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50 text-xs"
            />
          </div>

          {/* Summary info box */}
          <div className="rounded-xl bg-zinc-900/10 border border-zinc-850 px-4 py-3 flex items-center justify-between select-none">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Số tiền thanh toán</div>
              <div className="text-base font-bold text-zinc-200 mt-0.5">
                {formatVnd(effectiveVnd)} VND
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Credit nhận được</div>
              <div className="text-base font-bold text-amber-500 mt-0.5">
                {effectiveCredits} credit
              </div>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/20 border border-red-900/40 text-red-200">
              <AlertCircle className="w-4.5 h-4.5 mt-0.5 shrink-0 text-red-400" />
              <div className="text-xs">{error}</div>
            </div>
          )}

          {/* Helper note */}
          <p className="text-[10px] leading-relaxed text-zinc-500 flex items-start gap-1.5 select-none">
            <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              Bạn sẽ được chuyển hướng sang trang thanh toán PayOS. Nội dung chuyển khoản (ghi chú) sẽ được tạo ngẫu nhiên để tăng tính bảo mật và tự động hóa xử lý giao dịch.
            </span>
          </p>

          {/* History shortcuts — quick audit trail for the user without
              leaving the topup flow. Both routes are mounted in App.jsx
              behind the authenticated gate. Closing the modal after
              clicking keeps the rest of the dashboard state intact. */}
          <div className="grid grid-cols-2 gap-2 pt-1 select-none">
            <Link
              to="/topup-history"
              onClick={() => !isSubmitting && onClose()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-950/70 border border-zinc-850 text-[11px] font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 hover:border-zinc-700 active:scale-[0.98] transition"
            >
              <Receipt className="w-3.5 h-3.5 text-amber-400" />
              <span>Lịch sử nạp</span>
            </Link>
            <Link
              to="/credit-usage"
              onClick={() => !isSubmitting && onClose()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-950/70 border border-zinc-850 text-[11px] font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 hover:border-zinc-700 active:scale-[0.98] transition"
            >
              <Wallet className="w-3.5 h-3.5 text-violet-300" />
              <span>Lịch sử tiêu</span>
            </Link>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed select-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang tạo link thanh toán...</span>
              </>
            ) : (
              <>
                <Coins className="w-4 h-4" />
                <span>Nạp {formatVnd(effectiveVnd)} VND</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}