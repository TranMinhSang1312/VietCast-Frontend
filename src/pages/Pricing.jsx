import { useEffect, useMemo, useState } from "react";
import {
  Coins,
  Subtitles,
  Mic,
  VolumeX,
  CheckCircle2,
  Receipt,
  Clock,
  ShieldCheck,
  ChevronDown,
  Wallet,
  RefreshCcw,
  Sparkles,
  Zap,
  Gift,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { VND_PER_CREDIT, formatVnd } from "../services/payment";
import { formatCredit, formatCountdown } from "../utils/format";

// Source of truth for the numbers shown here:
//   - CreditService.java (TRANSLATE_COST, VIDEO_COST) on the Java side.
//   - VideoController.java applies the original / mute flat surcharge
//     (1000 credit) on top of the per-minute rate.
//   - PaymentService.java owns VND_PER_CREDIT (the topup rate).
// If pricing changes, only these constants and the controllers move.

const RATE_TRANSLATE_PER_CUE = 1;
const RATE_DUB_PER_MINUTE = 500;
const RATE_FLAT_MODES = 1000;

const PRESET_AMOUNTS = [100_000, 200_000, 500_000, 1_000_000, 2_000_000];

function credit(n) {
  return n.toLocaleString("vi-VN") + " credit";
}

// Shared glass surface tokens. Keeping these as local strings avoids
// drifting `bg-white/5` variants across the three cards.
const SURFACE = "rounded-3xl border border-white/[0.06] bg-white/[0.025] backdrop-blur-xl";
const SURFACE_RAISED = "rounded-3xl border border-indigo-400/20 bg-white/[0.04] backdrop-blur-2xl";

// Magnetic nudge on the primary CTA. The wrapper listens for pointer
// position and skews the button a few pixels toward the cursor. We use
// a plain `transform` so it stays cheap on retina.
function MagneticCTA({ children, className = "", ...rest }) {
  const handleMove = (e) => {
    const btn = e.currentTarget;
    const r = btn.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 6;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 6;
    btn.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };
  const handleLeave = (e) => {
    e.currentTarget.style.transform = "translate(0, 0)";
  };
  return (
    <button
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`group relative inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] transition-transform duration-200 ease-out active:scale-[0.98] ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default function Pricing() {
  const [openFaq, setOpenFaq] = useState(0);
  const { user } = useAuth();

  // SIGNUP_BONUS data — sourced from /me so the banner matches the
  // header pill exactly. Countdown re-renders every 30s.
  const bonusAmount = Number(user?.bonusCreditBalance ?? 0);
  const bonusDeadline = user?.bonusExpiresAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!bonusAmount) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [bonusAmount]);
  const countdown = bonusAmount > 0 && bonusDeadline
    ? formatCountdown(bonusDeadline)
    : null;
  const msLeft = bonusDeadline ? new Date(bonusDeadline).getTime() - now : Infinity;
  const bonusUrgent = countdown != null && msLeft > 0 && msLeft < 24 * 60 * 60 * 1000;

  const presets = useMemo(
    () =>
      PRESET_AMOUNTS.map((vnd) => ({
        vnd,
        credit: Math.floor(vnd / VND_PER_CREDIT),
      })),
    []
  );

  return (
    <div className="w-full min-h-screen flex flex-col items-center px-4 py-16 sm:py-24 bg-slate-950 font-sans text-zinc-100 relative overflow-x-hidden">
      {/* Ambient mesh: deep midnight base with a single indigo glow.
          Lower density than the rest of the app so the cards stay the hero. */}
      <div className="absolute top-[-20%] right-[-10%] w-[720px] h-[720px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-25%] left-[-15%] w-[520px] h-[520px] bg-violet-600/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.06),transparent_55%)] pointer-events-none" />

      <div className="w-full max-w-7xl z-10">
        {/* Header */}
        <header className="flex flex-col items-center text-center pb-12 mb-14 select-none">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300">
            <Sparkles className="w-3.5 h-3.5" />
            Bảng phí dịch vụ
          </div>
          <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-[-0.03em] text-white leading-[1.05] max-w-3xl">
            Chọn gói phù hợp.{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300">
              Trả theo đúng việc bạn làm.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
            Mỗi tác vụ AI trên VietCast tiêu tốn một lượng credit theo bảng
            dưới đây. Bạn nạp VND qua PayOS, hệ thống quy đổi theo tỉ lệ{" "}
            <span className="font-mono text-slate-200">{formatVnd(VND_PER_CREDIT)} VND</span>{" "}
            = <span className="font-mono text-slate-200">1 credit</span>.
          </p>

          {/* The yellow hook. The Free SRT pill is the single most
              important conversion nudge on the page. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400/10 border border-yellow-400/40 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-yellow-300">
              <Zap className="w-3.5 h-3.5 fill-yellow-300" />
              Miễn phí file SRT kèm theo mọi tác vụ
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              Hoàn credit tự động khi tác vụ lỗi
            </span>
          </div>

          {/* SIGNUP_BONUS banner — shown when the authenticated user
              has a live welcome reward. Hidden on first paint so we
              don't render an empty card for anonymous visitors. */}
          {bonusAmount > 0 && countdown && (
            <div
              className={
                "mt-6 inline-flex flex-col sm:flex-row items-center gap-2 sm:gap-3 rounded-2xl border px-4 py-2.5 " +
                (bonusUrgent
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                  : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200")
              }
            >
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4" />
                <span className="text-sm font-semibold">
                  Bạn đang có {formatCredit(bonusAmount)} credit tặng khi đăng ký
                </span>
              </div>
              <span className={"text-xs " + (bonusUrgent ? "text-amber-200/90" : "text-emerald-200/90")}>
                {bonusUrgent ? "Sắp hết hạn" : "Còn hạn"} {countdown}
              </span>
            </div>
          )}
        </header>

        {/* Editorial layout: hero text on the left, asymmetric pricing
            stack on the right. The "Lồng tiếng" card is the VIP and
            visually dominates by being wider, taller, and lifted up. */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          {/* LEFT: hero column */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className={`${SURFACE} p-8 sm:p-10 flex flex-col gap-6 h-full`}>
              <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-indigo-300">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_12px_2px_rgba(129,140,248,0.6)]" />
                Một nền tảng. Mọi bước của video.
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-[1.1]">
                Lồng tiếng, lọc logo, xuất phụ đề. Tất cả trong một dòng credit.
              </h2>
              <p className="text-base text-slate-400 leading-relaxed">
                Không có gói tháng, không có phí ẩn. Bạn nạp bao nhiêu dùng
                bấy nhiêu. Hết credit thì nạp tiếp, dừng bất kỳ lúc nào.
              </p>

              <ul className="flex flex-col gap-3 mt-2">
                {[
                  "Phí tính theo giây, làm tròn đến credit gần nhất",
                  "Tự động hoàn phần thừa khi video ngắn hơn 1 phút",
                  "Không giới hạn thời lượng cho chế độ giữ tiếng gốc",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                    <span className="leading-snug">{t}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-4">
                <MagneticCTA className="w-full sm:w-auto">
                  <Coins className="w-4 h-4" />
                  Nạp credit ngay
                </MagneticCTA>
                <p className="mt-3 text-[11px] text-slate-500">
                  Tối thiểu {formatVnd(10_000)} VND. Thanh toán qua PayOS.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT: asymmetric pricing stack. The VIP card (Lồng tiếng)
              is intentionally larger and offset upward to break the
              equal-card grid. */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6">
            {/* VIP card. Spans two rows on the right column, scaled up,
                with a subtle ring + glow. */}
            <article className={`sm:row-span-2 ${SURFACE_RAISED} relative p-7 sm:p-8 flex flex-col gap-6 shadow-[0_30px_80px_-30px_rgba(99,102,241,0.35)] hover:border-indigo-300/40 transition`}>
              {/* Vertical indigo glow behind the VIP card */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/12 via-violet-500/8 to-transparent pointer-events-none" />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 ring-1 ring-indigo-400/30 flex items-center justify-center">
                    <Mic className="w-5.5 h-5.5 text-indigo-300" strokeWidth={2.2} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight">
                      Lồng tiếng AI
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Đè giọng hoặc giữ nhạc nền gốc
                    </p>
                  </div>
                </div>
                {/* VIP badge: emerald ring + label, replaces the old
                    amber "Phổ biến" pill to match the CTA color story. */}
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 border border-emerald-400/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  <Sparkles className="w-3 h-3" />
                  VIP
                </span>
              </div>

              <div className="relative">
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-extrabold tracking-[-0.04em] text-white">
                    {RATE_DUB_PER_MINUTE.toLocaleString("vi-VN")}
                  </span>
                  <span className="text-base font-medium text-slate-400">
                    credit / phút
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                  Tính chi tiết theo từng giây. Đặt cọc trước 1 phút, hoàn
                  trả phần thừa hoặc trừ thêm phần chênh lệch khi render xong.
                </p>
              </div>

              {/* Yellow hook IN the VIP card. This is the highest-attention
                  spot on the page so the "Miễn phí file SRT" guarantee
                  gets its own row. */}
              <div className="relative flex items-center gap-2 rounded-2xl border border-yellow-400/30 bg-yellow-400/[0.06] px-4 py-3">
                <span className="w-8 h-8 rounded-xl bg-yellow-400/15 ring-1 ring-yellow-400/30 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-yellow-300/80">
                    Bonus đính kèm
                  </div>
                  <div className="text-sm font-bold text-yellow-200 leading-tight">
                    Miễn phí file SRT song ngữ
                  </div>
                </div>
              </div>

              <div className="relative flex flex-col gap-3 rounded-2xl border border-white/[0.05] bg-slate-950/40 p-4">
                <DetailRow icon={Clock} label="Đơn giá" value={`${RATE_DUB_PER_MINUTE} credit / phút`} />
                <DetailRow icon={Wallet} label="Số dư tối thiểu để bắt đầu" value={credit(RATE_DUB_PER_MINUTE)} />
                <DetailRow
                  icon={RefreshCcw}
                  label="Cơ chế thu phí"
                  value="Đặt cọc 1 phút, hoàn thừa / trừ thêm sau render"
                  accent="text-emerald-300"
                />
              </div>

              <ul className="relative flex flex-col gap-2.5 text-sm text-slate-300">
                <Bullet text="Lồng tiếng đè giọng mới (mode dub)" />
                <Bullet text="Lồng tiếng kết hợp giữ nhạc nền (mode mix)" />
                <Bullet text="Bao trọn gói dịch phụ đề, không thu thêm" />
                <Bullet text="Hoàn lại tiền cọc khi job thất bại" />
              </ul>

              <div className="relative mt-auto pt-2">
                <button className="w-full inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-400 shadow-[0_18px_60px_-18px_rgba(99,102,241,0.55)] transition active:scale-[0.98]">
                  <Mic className="w-4 h-4" />
                  Render ngay
                </button>
              </div>
            </article>

            {/* Mode 1: flat (original / mute). Smaller, sits top-right. */}
            <article className={`${SURFACE} relative p-6 flex flex-col gap-5 hover:border-white/[0.12] transition`}>
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-950 ring-1 ring-white/[0.08] flex items-center justify-center">
                  <VolumeX className="w-5 h-5 text-slate-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white leading-tight">
                    Giữ tiếng gốc / Video câm
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Phí cố định, không phụ thuộc thời lượng
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-[-0.03em] text-white">
                    {RATE_FLAT_MODES.toLocaleString("vi-VN")}
                  </span>
                  <span className="text-sm font-medium text-slate-400">
                    credit / video
                  </span>
                </div>
              </div>

              <ul className="relative flex flex-col gap-2 text-sm text-slate-300">
                <Bullet text="Giữ nguyên audio gốc của video" />
                <Bullet text="Tắt hoàn toàn tiếng, xuất video câm" />
                <Bullet text="Không giới hạn thời lượng video" />
                <Bullet text="Hoàn đủ 1.000 credit nếu job lỗi" />
              </ul>

              <div className="relative mt-auto pt-2 text-[11px] text-slate-500">
                Cần tối thiểu{" "}
                <span className="font-mono text-slate-300">{credit(RATE_FLAT_MODES)}</span> trong tài khoản.
              </div>
            </article>

            {/* Mode 3: per-cue manual translate. Smaller, sits bottom-right. */}
            <article className={`${SURFACE} relative p-6 flex flex-col gap-5 hover:border-white/[0.12] transition`}>
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-950 ring-1 ring-white/[0.08] flex items-center justify-center">
                  <Subtitles className="w-5 h-5 text-slate-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white leading-tight">
                    Dịch phụ đề thủ công
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Bấm "Dịch lại" trong trang chỉnh sửa
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-[-0.03em] text-white">
                    {RATE_TRANSLATE_PER_CUE}
                  </span>
                  <span className="text-sm font-medium text-slate-400">
                    credit / cue
                  </span>
                </div>
              </div>

              <ul className="relative flex flex-col gap-2 text-sm text-slate-300">
                <Bullet text="Tính theo số cue thực gửi dịch" />
                <Bullet text="Không cần chạy lại toàn bộ video" />
                <Bullet text="Phù hợp sửa vài dòng lẻ" />
                <Bullet text="Miễn phí khi đi kèm lồng tiếng" />
              </ul>

              <div className="relative mt-auto pt-2 text-[11px] text-slate-500">
                Cần tối thiểu{" "}
                <span className="font-mono text-slate-300">{credit(RATE_TRANSLATE_PER_CUE)}</span> trong tài khoản.
              </div>
            </article>
          </div>
        </section>

        {/* Policy row */}
        <section className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4">
          <PolicyCard
            icon={Wallet}
            title="Đặt cọc trước"
            body={
              <>
                Hệ thống kiểm tra số dư trước khi bắt đầu job. Bạn cần có{" "}
                <strong className="text-slate-200">đúng số credit tối thiểu</strong>{" "}
                cho từng chế độ (1.000 cho mode cố định, 500 cho mỗi phút
                lồng tiếng đầu tiên).
              </>
            }
          />
          <PolicyCard
            icon={RefreshCcw}
            title="Hoàn tiền khi lỗi"
            body={
              <>
                Nếu job thất bại ở bất kỳ bước nào, hệ thống tự hoàn lại toàn
                bộ credit đã trừ và ghi dòng <code className="text-slate-300 font-mono">HOAN_CREDIT</code> trong lịch sử tiêu.
              </>
            }
          />
          <PolicyCard
            icon={ShieldCheck}
            title="Minh bạch & an toàn"
            body={
              <>
                Mỗi giao dịch trừ hoặc hoàn credit đều có mã tham chiếu (job id)
                để đối chiếu. Tỉ lệ quy đổi cố định {formatVnd(VND_PER_CREDIT)}{" "}
                VND = 1 credit.
              </>
            }
          />
        </section>

        {/* Topup conversion table */}
        <section className="mt-16">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-900 ring-1 ring-white/[0.06] flex items-center justify-center">
                <Receipt className="w-4.5 h-4.5 text-slate-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Quy đổi nạp tiền</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mức nạp gợi ý. Bạn có thể nhập số tiền tuỳ ý trong cửa sổ nạp.
                </p>
              </div>
            </div>
          </div>

          <div className={`${SURFACE} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-950/60 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
                  <th className="text-left px-5 py-3 font-medium">Số tiền thanh toán</th>
                  <th className="text-right px-5 py-3 font-medium">Credit nhận được</th>
                  <th className="text-right px-5 py-3 font-medium hidden sm:table-cell">
                    Tương đương
                  </th>
                </tr>
              </thead>
              <tbody>
                {presets.map(({ vnd, credit: c }) => (
                  <tr
                    key={vnd}
                    className="border-t border-white/[0.04] hover:bg-white/[0.02] transition"
                  >
                    <td className="px-5 py-3 font-semibold text-slate-200">
                      {formatVnd(vnd)} VND
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-300">
                      {c.toLocaleString("vi-VN")} credit
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-500 hidden sm:table-cell">
                      ≈ {Math.floor(c / RATE_FLAT_MODES)} video (giữ tiếng/câm){" "}
                      <span className="text-slate-700">·</span>{" "}
                      {Math.floor(c / RATE_DUB_PER_MINUTE)} phút lồng tiếng
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-16 mb-4">
          <h2 className="text-lg font-bold text-white mb-5">Câu hỏi thường gặp</h2>
          <div className="flex flex-col gap-2.5">
            <Faq
              q="Vì sao video 30 giây và video 30 phút có giá khác nhau tuỳ chế độ?"
              a={
                <>
                  Với chế độ "Giữ tiếng gốc" hoặc "Video câm", hệ thống tính phí
                  cố định 1.000 credit / video bất kể thời lượng. Với chế độ
                  "Lồng tiếng", phí là 500 credit cho mỗi phút (tính theo từng
                  giây), nên video dài sẽ tốn nhiều credit hơn theo đúng thời
                  lượng thực tế.
                </>
              }
              open={openFaq === 0}
              onToggle={() => setOpenFaq(openFaq === 0 ? -1 : 0)}
            />
            <Faq
              q="Đặt cọc trước 1 phút là sao? Có bị mất tiền oan không?"
              a={
                <>
                  Khi bấm lồng tiếng, hệ thống trừ trước 500 credit tương ứng 1
                  phút đầu. Sau khi video render xong, hệ thống tính lại theo
                  thời lượng thật: video dưới 1 phút sẽ được hoàn phần thừa, video
                  trên 1 phút sẽ trừ thêm phần chênh lệch. Nếu job thất bại, bạn
                  được hoàn đủ tiền cọc.
                </>
              }
              open={openFaq === 1}
              onToggle={() => setOpenFaq(openFaq === 1 ? -1 : 1)}
            />
            <Faq
              q="Khi chạy lồng tiếng có bị tính thêm phí dịch phụ đề không?"
              a={
                <>
                  Không. Phí lồng tiếng đã bao trọn gói dịch phụ đề. Hệ thống tự
                  dịch phụ đề phục vụ cho việc lồng tiếng, bạn không bị tính
                  thêm 1 credit / cue cho phần dịch tự động đó.
                </>
              }
              open={openFaq === 2}
              onToggle={() => setOpenFaq(openFaq === 2 ? -1 : 2)}
            />
            <Faq
              q="Dịch thủ công từng dòng thì phí tính sao?"
              a={
                <>
                  Mỗi lần bấm "Dịch lại" trên giao diện chỉnh sửa phụ đề, hệ
                  thống đếm số cue bạn gửi dịch và trừ đúng 1 credit cho mỗi cue.
                  Dịch 5 cue = 5 credit, dịch 20 cue = 20 credit.
                </>
              }
              open={openFaq === 3}
              onToggle={() => setOpenFaq(openFaq === 3 ? -1 : 3)}
            />
            <Faq
              q="Credit là gì và mua bằng cách nào?"
              a={
                <>
                  Credit là đơn vị dùng để trả phí cho các tác vụ AI trên
                  VietCast. Bạn nạp VND qua PayOS, hệ thống quy đổi theo tỉ lệ{" "}
                  {formatVnd(VND_PER_CREDIT)} VND = 1 credit. Vào mục "Lịch sử
                  nạp" hoặc "Lịch sử tiêu" ở sidebar để xem chi tiết từng giao
                  dịch.
                </>
              }
              open={openFaq === 4}
              onToggle={() => setOpenFaq(openFaq === 4 ? -1 : 4)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------- small helpers --------------------------------------------------

function Bullet({ text }) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
      <span className="leading-snug">{text}</span>
    </li>
  );
}

function DetailRow({ icon: Icon, label, value, accent = "text-slate-200" }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div className="inline-flex items-center gap-1.5 text-slate-500 shrink-0">
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>
      <span className={`font-mono font-semibold text-right ${accent}`}>{value}</span>
    </div>
  );
}

function PolicyCard({ icon: Icon, title, body }) {
  return (
    <div className={`${SURFACE} p-5`}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg bg-slate-950 ring-1 ring-white/[0.06] flex items-center justify-center">
          <Icon className="w-4 h-4 text-indigo-300" />
        </div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{body}</p>
    </div>
  );
}

function Faq({ q, a, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`text-left rounded-2xl ${SURFACE} px-5 py-4 transition ${
        open ? "border-indigo-400/40" : "hover:border-white/[0.12]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-100">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            open ? "rotate-180 text-indigo-300" : ""
          }`}
        />
      </div>
      {open && <div className="mt-2.5 text-sm text-slate-400 leading-relaxed">{a}</div>}
    </button>
  );
}
