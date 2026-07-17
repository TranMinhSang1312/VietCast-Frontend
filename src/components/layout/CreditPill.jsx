import { useEffect, useState } from "react";
import { Coins, Gift } from "lucide-react";
import { formatCredit, formatCountdown } from "../../utils/format";

/**
 * Header pill that surfaces the user's available credit balance.
 *
 * <p>Renders three pieces of information, all in one compact block:
 * <ol>
 *   <li><b>Permanent balance</b> — topups, admin grants, and the
 *       SIGNUP_BONUS once it has been promoted (i.e. moved out of
 *       the bonus pool by the first successful topup).</li>
 *   <li><b>Live bonus</b> — only when the user has a SIGNUP_BONUS
 *       that hasn't expired. Rendered as a small chip inside the
 *       same pill so the total available balance is obvious at a
 *       glance.</li>
 *   <li><b>Bonus countdown</b> — visible below the pill when there
 *       is a live bonus; goes amber once < 24h remain, then
 *       emerald once the bonus has been promoted (so the user sees
 *       a positive "đã thành vĩnh viễn" message after their first
 *       topup).</li>
 * </ol>
 *
 * <p>Re-calculates the countdown every 30s so the displayed text
 * stays accurate without round-tripping to the backend.
 */
export default function CreditPill({ user, onTopup }) {
  const bonusAmount = Number(user?.bonusCreditBalance ?? 0);
  const bonusDeadline = user?.bonusExpiresAt;
  const permanent = Number(user?.creditBalance ?? 0);
  const total = permanent + bonusAmount;

  // Countdown tick — every 30s so the "còn X giờ Y phút" stays
  // accurate. Cheap string reflow, no re-render cost worth caring
  // about.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!bonusAmount) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [bonusAmount]);

  const countdown = bonusAmount > 0 && bonusDeadline
    ? formatCountdown(bonusDeadline)
    : null;
  const bonusExpired = bonusAmount > 0 && !countdown;
  // <24h → amber so the user knows it's about to vanish.
  const msLeft = bonusDeadline ? new Date(bonusDeadline).getTime() - now : Infinity;
  const isUrgent = countdown != null && msLeft > 0 && msLeft < 24 * 60 * 60 * 1000;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.025]">
          <Coins className="w-4 h-4 text-yellow-300" />
          <span className="text-sm font-semibold text-slate-200 font-mono">
            {formatCredit(total)}
          </span>
          <span className="text-[11px] text-slate-500 uppercase tracking-wider">
            credit
          </span>
        </div>
        {bonusAmount > 0 && countdown && (
          <div
            className={
              "hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border " +
              (isUrgent
                ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200")
            }
            title={`Bonus tặng khi đăng ký — hết hạn ${new Date(bonusDeadline).toLocaleString("vi-VN")}`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold">
              +{formatCredit(bonusAmount)} • còn {countdown}
            </span>
          </div>
        )}
        {bonusExpired && (
          <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-rose-400/30 bg-rose-400/10 text-rose-200">
            <Gift className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold">
              Bonus đã hết hạn
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onTopup}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 hover:bg-emerald-300 px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-[0_12px_40px_-15px_rgba(16,185,129,0.55)] transition active:scale-[0.98]"
          title="Nạp thêm credit qua PayOS / VietQR"
        >
          <Coins className="w-3.5 h-3.5" />
          <span>Nạp</span>
        </button>
      </div>
      {bonusAmount > 0 && countdown && (
        <p
          className={
            "hidden sm:block text-[11px] leading-tight " +
            (isUrgent ? "text-amber-300/90" : "text-emerald-300/80")
          }
        >
          Tặng {formatCredit(bonusAmount)} khi đăng ký • {isUrgent ? "sắp hết hạn" : "còn hạn"} {countdown}
        </p>
      )}
    </div>
  );
}
