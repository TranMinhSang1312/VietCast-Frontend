import { useState } from "react";
import { Coins, Loader2, X, AlertCircle } from "lucide-react";
import {
  createPaymentLink,
  formatVnd,
} from "../../services/payment";
import { PRICING } from "../../config/pricing";

const PRESETS = Object.freeze([
  { vnd: 2_000 },
  { vnd: 10_000 },
  { vnd: 50_000 },
  { vnd: 100_000 },
  { vnd: 200_000 },
  { vnd: 500_000 },
]);

const MIN_AMOUNT = 2_000;
const MAX_AMOUNT = 100_000_000;

function fullMinutes(credits, perMinute) {
  return Math.max(0, Math.floor(credits / perMinute));
}

export default function TopupModal({ isOpen, onClose, onSuccess, prefillAmount }) {
  const initialMissing = Math.max(0, Math.ceil(Number(prefillAmount) || 0));
  const [presetVnd, setPresetVnd] = useState(initialMissing > 0 ? null : PRESETS[2].vnd); // 50k default
  const [customStr, setCustomStr] = useState(
    initialMissing > 0 ? String(Math.max(MIN_AMOUNT, initialMissing)) : "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const effectiveVnd = (() => {
    const parsed = parseInt(customStr.replaceAll(".", ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return Number.isFinite(presetVnd) ? presetVnd : 0;
  })();
  const effectiveCredits = effectiveVnd;
  const isCustom = customStr !== "";
  const subtitleMinutes = fullMinutes(effectiveCredits, PRICING.subtitlePerMinute);
  const dubbingMinutes = fullMinutes(effectiveCredits, PRICING.dubPerMinute);
  const missingCredits = initialMissing;

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
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl border border-white/[0.06] bg-slate-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] shadow-black/40 font-sans text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 select-none">
            <Coins className="w-5 h-5 text-yellow-300" />
            <h2
              id="topup-title"
              className="text-sm font-bold tracking-tight text-slate-200"
            >
              Nạp credit
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] disabled:opacity-50 transition active:scale-[0.95]"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Presets + Custom shortcut */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2 select-none">
              Chọn theo nhu cầu sử dụng
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => {
                const selected = !isCustom && presetVnd === p.vnd;
                return (
                  <button
                    key={p.vnd}
                    type="button"
                    onClick={() => {
                      setPresetVnd(p.vnd);
                      setCustomStr("");
                    }}
                    disabled={isSubmitting}
                    className={`px-3 py-3 rounded-xl text-left border transition disabled:opacity-50 select-none ${
                      selected
                        ? "bg-emerald-400 border-emerald-400 text-slate-950 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98]"
                        : "bg-slate-950/70 border-white/[0.06] text-slate-400 hover:border-white/[0.12] active:scale-[0.98]"
                    }`}
                  >
                    <span className="block text-sm font-bold">{formatVnd(p.vnd)}đ</span>
                    <span className={`mt-1 block text-[10px] leading-relaxed ${selected ? "text-slate-800" : "text-slate-500"}`}>
                      ≈ {fullMinutes(p.vnd, PRICING.dubPerMinute)} phút lồng tiếng · {fullMinutes(p.vnd, PRICING.subtitlePerMinute)} phút phụ đề
                    </span>
                  </button>
                );
              })}
              <button
                key="__custom__"
                type="button"
                onClick={() => {
                  setCustomStr(customStr === "" ? String(presetVnd) : customStr);
                  document.getElementById("topup-custom")?.focus();
                }}
                disabled={isSubmitting}
                className={`px-3 py-3 rounded-xl text-xs font-semibold border transition disabled:opacity-50 select-none ${
                  isCustom
                    ? "bg-emerald-400 border-emerald-400 text-slate-950 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98]"
                    : "bg-slate-950/70 border-white/[0.06] text-slate-400 hover:border-white/[0.12] active:scale-[0.98]"
                }`}
              >
                Tuỳ chỉnh
              </button>
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <label
              htmlFor="topup-custom"
              className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2 select-none"
            >
              Hoặc nạp đúng số credit đang thiếu
            </label>
            <input
              id="topup-custom"
              type="text"
              inputMode="numeric"
              value={customStr}
              onChange={(e) => setCustomStr(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ví dụ: 12500"
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-white/[0.06] text-zinc-100 placeholder:text-slate-600 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 focus:outline-none transition disabled:opacity-50 text-xs"
            />
          </div>

          {missingCredits > 0 && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-3 text-xs leading-relaxed text-emerald-100">
              {missingCredits >= MIN_AMOUNT
                ? `Đã nhập đúng ${formatVnd(missingCredits)}đ — tương ứng ${formatVnd(missingCredits)} credit bạn đang thiếu.`
                : `Bạn đang thiếu ${formatVnd(missingCredits)} credit. Mức nạp tối thiểu qua cổng thanh toán là ${formatVnd(MIN_AMOUNT)}đ.`}
            </div>
          )}

          {/* Summary info box */}
          <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] px-4 py-3 select-none">
            <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Số tiền thanh toán</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">
                {formatVnd(effectiveVnd)} VND
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Số credit nhận được</div>
              <div className="text-base font-bold text-yellow-300 mt-0.5">
                {formatVnd(effectiveCredits)} credit
              </div>
            </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 text-xs">
              <div className="rounded-lg bg-slate-950/60 px-3 py-2">
                <div className="text-slate-500">Chỉ tạo phụ đề</div>
                <div className="mt-0.5 font-semibold text-slate-200">≈ {subtitleMinutes} phút</div>
              </div>
              <div className="rounded-lg bg-slate-950/60 px-3 py-2">
                <div className="text-slate-500">Lồng tiếng / trộn âm</div>
                <div className="mt-0.5 font-semibold text-slate-200">≈ {dubbingMinutes} phút</div>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Quy đổi hiện tại: 1 VND = 1 credit. Số phút được làm tròn xuống.</p>
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-950/30 border border-rose-900/40 text-rose-200">
              <AlertCircle className="w-4.5 h-4.5 mt-0.5 shrink-0 text-rose-400" />
              <div className="text-xs">{error}</div>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed select-none"
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
