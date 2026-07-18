import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Coins,
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
  ArrowRight,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { VND_PER_CREDIT, formatVnd } from "../services/payment";
import { formatCredit, formatCountdown } from "../utils/format";

// Source of truth for the numbers shown here:
//   - CreditService.java (VIDEO_COST, VIDEO_MAX_MINUTES, VIDEO_MIN_PRICE)
//     on the Java side.
//   - VideoController.java applies the per-minute rate uniformly across
//     all four audio modes (dub / mix / original / mute).
//   - PaymentService.java owns VND_PER_CREDIT (the topup rate).
// If pricing changes, only these constants and the controllers move.
//
// Historical note: previous copy listed a flat 1 000-credit rate for
// "original / mute" and a per-cue rate for manual translate. Both have
// been retired — flat-billed modes were a margin hole (they cost the
// same regardless of a 60-min vs. a 5-min clip) and per-cue manual
// translate returned ~5% of cost. The pricing model is now uniform:
// ceil(duration / 60) × 800 credit, capped at 90 minutes.

const RATE_PER_MINUTE = 800;
const FLAT_VIDEO_COST = 200;
const MAX_MINUTES = 90;
const MIN_MINUTES = 1;

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
    <div className="w-full min-h-screen flex flex-col items-center bg-slate-950 font-sans text-zinc-100 relative overflow-x-hidden">
      {/* Ambient mesh: deep midnight base with a single indigo glow.
          Lower density than the rest of the app so the cards stay the hero. */}
      <div className="absolute top-[-20%] right-[-10%] w-[720px] h-[720px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-25%] left-[-15%] w-[520px] h-[520px] bg-violet-600/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.06),transparent_55%)] pointer-events-none" />

      {/* Top nav */}
      <header className="w-full z-10 px-6 sm:px-10 pt-7">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-2.5 select-none">
            <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              VietCast
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] px-5 py-2.5 text-xs font-semibold text-slate-200 transition active:scale-[0.98]"
              >
                Vào Dashboard
                <ArrowRight className="w-3 h-3" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden sm:inline-flex items-center text-sm font-medium text-slate-400 hover:text-white transition"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 px-5 py-2.5 text-xs font-bold transition active:scale-[0.98]"
                >
                  Bắt đầu miễn phí
                  <ArrowRight className="w-3 h-3" strokeWidth={3} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="w-full max-w-7xl z-10 px-6 sm:px-10 pt-16 sm:pt-24 pb-24">
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
                  "Phí tính đồng nhất theo phút cho mọi chế độ (lồng tiếng, giữ tiếng gốc, video câm)",
                  "Đặt cọc trước 1 phút, hoàn phần thừa khi video ngắn hơn ước tính",
                  "Giới hạn " + MAX_MINUTES + " phút / lần — video dài hơn vui lòng cắt trước khi xử lý",
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
                    {RATE_PER_MINUTE.toLocaleString("vi-VN")}
                  </span>
                  <span className="text-base font-medium text-slate-400">
                    credit / phút
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                  Phí dịch vụ tính theo thời gian thực (từng giây video). Hệ thống đặt cọc trước 1 phút lồng tiếng, sau khi hoàn thành sẽ tự động trả lại phần dư lập tức.
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
                <DetailRow icon={Clock} label="Đơn giá" value={`${RATE_PER_MINUTE.toLocaleString("vi-VN")} credit / phút`} />
                <DetailRow
                  icon={Wallet}
                  label="Số dư tối thiểu để bắt đầu"
                  value={credit(RATE_PER_MINUTE * MIN_MINUTES)}
                />
                <DetailRow
                  icon={ShieldCheck}
                  label="Giới hạn thời lượng"
                  value={`${MAX_MINUTES} phút / lần render`}
                />
                <DetailRow
                  icon={RefreshCcw}
                  label="Cơ chế thu phí"
                  value="Tính theo giây thực tế, tự động hoàn trả credit dư"
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
            </article>             <article className={`${SURFACE} relative p-6 flex flex-col gap-5 hover:border-white/[0.12] transition`}>
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-950 ring-1 ring-white/[0.08] flex items-center justify-center">
                  <VolumeX className="w-5 h-5 text-slate-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white leading-tight">
                    Giữ tiếng gốc / Video câm
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Phí cố định trọn gói cho mỗi video
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-[-0.03em] text-white">
                    {FLAT_VIDEO_COST.toLocaleString("vi-VN")}
                  </span>
                  <span className="text-sm font-medium text-slate-400">
                    credit / video
                  </span>
                </div>
              </div>

              <ul className="relative flex flex-col gap-2 text-sm text-slate-300">
                <Bullet text="Tải và giữ nguyên âm thanh gốc của video" />
                <Bullet text="Loại bỏ âm thanh để xuất video câm" />
                <Bullet text="Không giới hạn thời lượng video" />
                <Bullet text="Tự động hoàn tiền 100% khi xử lý thất bại" />
              </ul>

              <div className="relative mt-auto pt-2 text-[11px] text-slate-500">
                Cần tối thiểu{" "}
                <span className="font-mono text-slate-300">{credit(FLAT_VIDEO_COST)}</span> trong tài khoản.
              </div>
            </article>

            {/* Mode 3 (small card): cap + min — replaces the deprecated
                "Dịch phụ đề thủ công" card which has been retired on
                the backend (see BatchTranslateController). Keeping a
                slot here so the page layout still has 3 cards on the
                right column; the content is now a guard-rail summary
                so users understand the cap and minimum charge. */}
            <article className={`${SURFACE} relative p-6 flex flex-col gap-5 hover:border-white/[0.12] transition`}>
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-950 ring-1 ring-white/[0.08] flex items-center justify-center">
                  <Clock className="w-5 h-5 text-slate-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white leading-tight">
                    Giới hạn &amp; quy tắc
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Áp dụng cho mọi chế độ
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-[-0.03em] text-white">
                    {MAX_MINUTES}
                  </span>
                  <span className="text-sm font-medium text-slate-400">
                    phút tối đa / lần
                  </span>
                </div>
              </div>

              <ul className="relative flex flex-col gap-2 text-sm text-slate-300">
                <Bullet text={`Tối đa ${MAX_MINUTES} phút cho mỗi video tải lên`} />
                <Bullet text="Tính phí chính xác theo từng giây video (không làm tròn phút)" />
                <Bullet text="Tự động hoàn tiền 100% khi xử lý thất bại" />
                <Bullet text="Dịch phụ đề đi kèm hoàn toàn miễn phí" />
              </ul>

              <div className="relative mt-auto pt-2 text-[11px] text-slate-500">
                Cần tối thiểu{" "}
                <span className="font-mono text-slate-300">{credit(FLAT_VIDEO_COST)}</span> để bắt đầu.
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
                Hệ thống kiểm tra số dư trước khi xử lý. Bạn cần có{" "}
                <strong className="text-slate-200">ít nhất {credit(FLAT_VIDEO_COST)}</strong>{" "}
                để bắt đầu thực hiện tác vụ trên hệ thống.
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
                VND = 1 credit. Mọi chế độ đều có giới hạn {MAX_MINUTES} phút / lần.
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
                      ≈ {Math.floor(c / RATE_PER_MINUTE)} phút render{" "}
                      <span className="text-slate-700">·</span>{" "}
                      {Math.floor(c / (RATE_PER_MINUTE * MAX_MINUTES))} video tối đa ({MAX_MINUTES}p)
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
              q={"Vì sao mọi chế độ đều tính cùng một đơn giá " + RATE_PER_MINUTE + " credit / phút?"}
              a={
                <>
                  Trước đây hệ thống có giá khác nhau giữa "Lồng tiếng" (500
                  credit/phút) và "Giữ tiếng gốc / Video câm" (1 000 credit
                  cố định). Mức 1 000 credit cố định khiến hệ thống chịu lỗ
                  nghiêm trọng trên các video dài (chi phí xử lý vẫn tăng
                  theo phút nhưng giá thu không đổi). Từ phiên bản mới, mọi
                  chế độ đều dùng công thức <strong className="text-slate-200">ceil(thời lượng / 60) × {RATE_PER_MINUTE} credit</strong>,
                  giúp bạn dễ dự đoán chi phí và đảm bảo hệ thống có đủ
                  nguồn lực vận hành để phục vụ bạn lâu dài.
                </>
              }
              open={openFaq === 0}
              onToggle={() => setOpenFaq(openFaq === 0 ? -1 : 0)}
            />
            <Faq
              q={"Đặt cọc trước 1 phút là sao? Có bị mất tiền oan không?"}
              a={
                <>
                  Khi bấm lồng tiếng, hệ thống trừ trước {RATE_PER_MINUTE}{" "}
                  credit tương ứng 1 phút đầu. Sau khi video render xong, hệ
                  thống tính lại theo thời lượng thật: video dưới 1 phút sẽ
                  được hoàn phần thừa, video trên 1 phút sẽ trừ thêm phần
                  chênh lệch. Nếu job thất bại, bạn được hoàn đủ tiền cọc.
                </>
              }
              open={openFaq === 1}
              onToggle={() => setOpenFaq(openFaq === 1 ? -1 : 1)}
            />
            <Faq
              q={"Khi chạy lồng tiếng có bị tính thêm phí dịch phụ đề không?"}
              a={
                <>
                  Không. Phí lồng tiếng đã bao trọn gói dịch phụ đề. Hệ thống tự
                  động dịch phụ đề phục vụ cho việc lồng tiếng và không thu
                  thêm phí dịch — bạn chỉ trả theo đơn giá {RATE_PER_MINUTE}{" "}
                  credit / phút video.
                </>
              }
              open={openFaq === 2}
              onToggle={() => setOpenFaq(openFaq === 2 ? -1 : 2)}
            />
            <Faq
              q={"Vì sao có giới hạn " + MAX_MINUTES + " phút / lần render?"}
              a={
                <>
                  Video dài sẽ chiếm dụng toàn bộ worker trong nhiều giờ, làm
                  hàng đợi ùn tắt cho người dùng khác. Giới hạn {MAX_MINUTES}{" "}
                  phút giúp hệ thống cân bằng tải và giữ giá cho mọi người ở
                  mức hợp lý. Video dài hơn vui lòng cắt thành nhiều phần
                  bằng công cụ yêu thích (CapCut, FFmpeg, …) rồi submit từng
                  phần — bạn vẫn được tính giá {RATE_PER_MINUTE} credit / phút
                  cho mỗi phần.
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
      </main>
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
