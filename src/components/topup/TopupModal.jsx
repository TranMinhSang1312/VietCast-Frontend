import { useEffect, useState } from "react";
import { Coins, Loader2, X, AlertCircle } from "lucide-react";
import {
  createPaymentLink,
  formatVnd,
} from "../../services/payment";

const PRESETS = Object.freeze([
  { vnd: 10_000,    label: "10.000" },
  { vnd: 50_000,    label: "50.000" },
  { vnd: 100_000,   label: "100.000" },
  { vnd: 200_000,   label: "200.000" },
  { vnd: 500_000,   label: "500.000" },
  { vnd: 1_000_000, label: "1.000.000" },
]);

const MIN_AMOUNT = 10_000;
const MAX_AMOUNT = 100_000_000;

export default function TopupModal({ isOpen, onClose, onSuccess, prefillAmount }) {
  const [presetVnd, setPresetVnd] = useState(PRESETS[1].vnd); // 50k default
  const [customStr, setCustomStr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSubmitting(false);
      // Populate the credit field with the missing-credits amount the
      // caller passed in (see the "Insufficient credit" warning in
      // VideoDashboard). The default is the credits delta; the user can
      // still pick a preset or change the custom value before submit.
      // We do NOT snap to a preset — the caller probably wants this
      // exact number, so we leave the input in custom mode.
      if (prefillAmount && prefillAmount > 0) {
        setCustomStr(String(Math.ceil(prefillAmount)));
        setPresetVnd(null);
      } else {
        setCustomStr("");
        setPresetVnd(PRESETS[1].vnd);
      }
    }
  }, [isOpen, prefillAmount]);

  if (!isOpen) return null;

  const effectiveVnd = (() => {
    const parsed = parseInt(customStr.replaceAll(".", ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return Number.isFinite(presetVnd) ? presetVnd : 0;
  })();
  const effectiveCredits = effectiveVnd;
  const isCustom = customStr !== "";

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
      <div className="w-full max-w-md rounded-3xl border border-white/[0.06] bg-slate-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] shadow-black/40 overflow-hidden font-sans text-zinc-100">
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
              Chọn gói nhanh (VND)
            </label>
            <div className="grid grid-cols-4 gap-2">
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
                    className={`px-2 py-2 rounded-xl text-xs font-medium border transition disabled:opacity-50 select-none ${
                      selected
                        ? "bg-emerald-400 border-emerald-400 text-slate-950 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98]"
                        : "bg-slate-950/70 border-white/[0.06] text-slate-400 hover:border-white/[0.12] active:scale-[0.98]"
                    }`}
                  >
                    {p.label}
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
                className={`px-2 py-2 rounded-xl text-xs font-medium border transition disabled:opacity-50 select-none ${
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
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-white/[0.06] text-zinc-100 placeholder:text-slate-600 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 focus:outline-none transition disabled:opacity-50 text-xs"
            />
          </div>

          {/* Summary info box */}
          <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] px-4 py-3 flex items-center justify-between select-none">
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
