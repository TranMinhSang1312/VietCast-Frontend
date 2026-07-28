import { Link } from "react-router-dom";
import {
  Coins,
  Mic,
  Subtitles,
  VolumeX,
  Zap,
  ArrowRight,
  Play,
  ShieldCheck,
  RefreshCcw,
  Wallet,
  Clock3,
  Database,
  Headphones,
} from "lucide-react";
import { PRICING } from "../config/pricing";

// Reused across the page so the surface tokens stay consistent.
const SURFACE = "rounded-3xl border border-white/[0.06] bg-white/[0.025] backdrop-blur-xl";

// The hero CTA. Same MagneticCTA pattern as Pricing.jsx so the two
// pages feel like one brand without re-implementing it here. Kept
// inline because it's only used twice on this page.
function MagneticPrimary({ children, className = "", ...rest }) {
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
    <Link
      to="/login"
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`group relative inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] transition-transform duration-200 ease-out active:scale-[0.98] ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="w-full min-h-screen flex flex-col items-center bg-slate-950 font-sans text-zinc-100 relative overflow-x-hidden">
      {/* Ambient mesh. Two indigo glows + a single radial wash at the
          top, so the page reads "studio" without crowding the content. */}
      <div className="absolute top-[-25%] right-[-15%] w-[820px] h-[820px] bg-indigo-600/12 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute top-[35%] left-[-15%] w-[520px] h-[520px] bg-violet-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.08),transparent_55%)] pointer-events-none" />

      {/* Top nav. Slim: logo left, primary CTA right. No second CTA in
          the nav so the eye lands on the hero. */}
      <header className="w-full z-10 px-6 sm:px-10 pt-7">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 select-none group">
            <img
              src="/logo.png"
              alt="VietCast Logo"
              className="w-9 h-9 object-contain drop-shadow-[0_0_12px_rgba(99,102,241,0.5)] group-hover:scale-105 transition-transform"
            />
            <span className="text-lg font-bold tracking-tight text-white">
              VietCast
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center text-sm font-medium text-slate-400 hover:text-white transition"
            >
              Đăng nhập
            </Link>
            <MagneticPrimary className="px-5 py-2.5 text-xs">
              Bắt đầu miễn phí
              <ArrowRight className="w-3.5 h-3.5" />
            </MagneticPrimary>
          </div>
        </div>
      </header>

      <main className="w-full max-w-7xl z-10 px-6 sm:px-10 pt-16 sm:pt-24 pb-24">
        {/* HERO: editorial asymmetric split. Big left, supporting
            trust card right. Mirrors the Pricing page composition so
            the two feel like one product. */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-7 flex flex-col gap-7">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-yellow-300">
              <Zap className="w-3.5 h-3.5 fill-yellow-300" />
              Tặng SRT khi dịch hoặc lồng tiếng
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.03em] sm:tracking-[-0.04em] text-white leading-[1.02]">
              Lồng tiếng AI. <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300">
                Video của bạn,
              </span>{" "}
              <br />
              chuẩn tiếng Việt.
            </h1>

            <p className="max-w-xl text-lg text-slate-400 leading-relaxed">
              VietCast biến video nước ngoài thành bản lồng tiếng tự nhiên,
              giữ nguyên nhạc nền và xuất phụ đề SRT song ngữ. Trả theo giây,
              không có gói tháng.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-2">
              <MagneticPrimary>
                <Play className="w-4 h-4 fill-current" />
                Dùng thử với video ngắn
              </MagneticPrimary>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] px-6 py-3.5 text-sm font-semibold text-slate-200 transition active:scale-[0.98]"
              >
                <Headphones className="w-4 h-4" />
                Nghe trước / sau
              </a>
            </div>

            <ul className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-xs font-medium text-slate-500">
              <li className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.5)]" />
                Giữ nhạc nền
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_12px_2px_rgba(129,140,248,0.5)]" />
                SRT song ngữ
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_12px_2px_rgba(167,139,250,0.5)]" />
                Hoàn credit khi lỗi
              </li>
            </ul>
          </div>

          {/* Hero right: a single "trust" card showing the cost of a
              typical job. Lifted up slightly so it doesn't sit flat. */}
          <div className="lg:col-span-5 lg:translate-y-[-12px]">
            <div className={`${SURFACE} p-7 sm:p-8 relative overflow-hidden`}>
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none" />

              <div className="relative">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 ring-1 ring-indigo-400/30 flex items-center justify-center">
                    <Mic className="w-5.5 h-5.5 text-indigo-300" strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-indigo-300">
                      Tác vụ phổ biến
                    </div>
                    <div className="text-base font-bold text-white leading-tight">
                      Lồng tiếng video 12 phút
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      Thời lượng
                    </div>
                    <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-white">
                      12:00
                    </div>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300/80">
                      Phí ước tính
                    </div>
                    <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-emerald-300">
                      {(12 * PRICING.dubPerMinute).toLocaleString("vi-VN")}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">credit</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-yellow-400/25 bg-yellow-400/[0.05] px-3.5 py-2.5">
                  <Zap className="w-4 h-4 fill-yellow-300 text-yellow-300 shrink-0" />
                  <span className="text-xs text-yellow-200 font-medium">
                    Tặng kèm file SRT song ngữ. Không tính thêm.
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCcw className="w-3 h-3" />
                    Hoàn credit nếu lỗi
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3" />
                    Tính theo giây
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="mt-16 scroll-mt-8 sm:mt-24">
          <div className="max-w-2xl">
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-300">
              Video mẫu thực tế
            </div>
            <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-[-0.03em] text-white text-balance">
              Xem bản gốc. So sánh bản dịch.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 sm:mt-4 sm:text-base">
              Cùng một video, trước bằng ngôn ngữ gốc và sau khi được VietCast chuyển sang tiếng Việt.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-5 lg:grid-cols-2">
            <DemoVideoCard
              eyebrow="Video gốc"
              title="Trước khi xử lý"
              description="Xem video nguồn để đối chiếu nội dung, nhịp nói và phần âm thanh ban đầu."
              src="/demo/vietcast-original.mp4"
            />
            <DemoVideoCard
              eyebrow="Video đã dịch"
              title="Sau khi xử lý"
              description="Nội dung đã được chuyển sang tiếng Việt để bạn so sánh trực tiếp với video gốc."
              src="/demo/vietcast-translated.mp4"
              accent
            />
          </div>

          <div className="mt-4 sm:mt-5">
            <DemoVideoCard
              eyebrow="Che lớp phủ"
              title="Che logo và che phụ đề có sẵn"
              description="VietCast có thể che vùng logo hoặc phụ đề cũ trước khi xuất video, giúp bản dịch mới sạch và dễ theo dõi hơn."
              src="/demo/vietcast-overlay-mask.mp4"
              accent
            />
          </div>
        </section>

        {/* FEATURE STRIP: three quiet, generous cards. No equal-card
            grid. Card 2 is wider and visually anchored because dubbing
            is the headline product. */}
        <section className="mt-24 grid grid-cols-1 md:grid-cols-12 gap-5">
          <FeatureCard
            icon={VolumeX}
            title="Giữ tiếng gốc / Video câm"
            body={`${PRICING.mutePerMinute} credit/phút, tối thiểu ${PRICING.basicMinimum} credit. Chỉ tải và xử lý âm thanh, không chạy dịch hoặc tạo giọng AI.`}
            accent="slate"
            className="md:col-span-4"
          />
          <FeatureCard
            icon={Mic}
            title="Lồng tiếng AI"
            body={`${PRICING.dubPerMinute} credit/phút, tối thiểu ${PRICING.dubPerMinute} credit. Lồng tiếng đè giọng mới hoặc giữ nhạc nền gốc. Tặng kèm phụ đề SRT song ngữ.`}
            accent="indigo"
            highlight
            className="md:col-span-5"
          />
          <FeatureCard
            icon={Subtitles}
            title="Dịch phụ đề"
            body={`${PRICING.subtitlePerMinute} credit/phút, tối thiểu ${PRICING.subtitlePerMinute} credit. Nhận file SRT tiếng Việt mà không tạo giọng đọc hoặc render lại video.`}
            accent="slate"
            className="md:col-span-3"
          />
        </section>

        {/* POLICY ROW */}
        <section className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <PolicyCard
            icon={Wallet}
            title="Đặt cọc trước"
            body={
              <>
                Hệ thống kiểm tra số dư trước khi bắt đầu job. Cần đúng số
                credit tối thiểu cho từng chế độ.
              </>
            }
          />
          <PolicyCard
            icon={RefreshCcw}
            title="Hoàn tiền khi lỗi"
            body={
              <>
                Job thất bại ở bất kỳ bước nào? Hệ thống tự hoàn lại toàn bộ
                credit đã trừ, có mã tham chiếu để đối chiếu.
              </>
            }
          />
          <PolicyCard
            icon={ShieldCheck}
            title="Minh bạch & an toàn"
            body={
              <>
                Tỉ lệ quy đổi cố định 1 VND = 1 credit. Không gói tháng, không
                phí ẩn.
              </>
            }
          />
          <PolicyCard
            icon={Clock3}
            title="Thời gian xử lý"
            body={
              <>
                Dashboard hiển thị tiến độ theo từng bước. Phụ đề thường nhanh hơn
                lồng tiếng vì không phải tạo giọng và render lại video.
              </>
            }
          />
          <PolicyCard
            icon={Database}
            title="Lưu trữ kết quả"
            body={
              <>
                Kết quả (video & phụ đề) được lưu trữ an toàn trên hệ thống trong vòng <b>7 ngày</b>.
                Sau 7 ngày, hệ thống sẽ tự động dọn dẹp file. Vui lòng tải về thiết bị của bạn sau khi hoàn thành.
              </>
            }
          />
        </section>

        {/* FINAL CTA. One last conversion moment before the footer. */}
        <section className="mt-24">
          <div className={`${SURFACE} relative overflow-hidden p-10 sm:p-14 text-center`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.18),transparent_60%)] pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-yellow-300">
                <Zap className="w-3.5 h-3.5 fill-yellow-300" />
                Sẵn sàng bắt đầu
              </div>
              <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-[-0.03em] text-white">
                Nạp credit. Dịch. Xuất.
              </h2>
              <p className="mt-4 max-w-xl mx-auto text-base text-slate-400 leading-relaxed">
                Đăng nhập, dán URL và xem chi phí trước khi bấm xử lý. Bắt đầu
                bằng một video ngắn để tự đánh giá chất lượng.
              </p>
              <div className="mt-8 flex justify-center">
                <MagneticPrimary>
                  <Coins className="w-4 h-4" />
                  Dùng thử với video ngắn
                </MagneticPrimary>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

// ---------- small helpers --------------------------------------------------

function FeatureCard({ icon: Icon, title, body, accent = "slate", highlight = false, className = "" }) {
  const ring =
    accent === "indigo"
      ? "ring-indigo-400/30 text-indigo-300"
      : "ring-white/[0.08] text-slate-300";
  const border = highlight ? "border-indigo-400/25" : "border-white/[0.06]";
  const glow = highlight
    ? "shadow-[0_30px_80px_-30px_rgba(99,102,241,0.35)]"
    : "";

  return (
    <div className={`${SURFACE} ${border} ${glow} p-7 flex flex-col gap-4 hover:border-white/[0.12] transition ${className}`}>
      <div className={`w-11 h-11 rounded-2xl bg-slate-950 ring-1 ${ring} flex items-center justify-center`}>
        <Icon className="w-5.5 h-5.5" strokeWidth={2.2} />
      </div>
      <h3 className="text-lg font-bold text-white leading-tight">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
      {highlight && (
        <div className="mt-1 inline-flex items-center gap-1.5 self-start rounded-full bg-yellow-400/10 border border-yellow-400/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-yellow-300">
          <Zap className="w-3 h-3 fill-yellow-300" />
          Kèm file SRT miễn phí
        </div>
      )}
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

function DemoVideoCard({ eyebrow, title, description, src, accent = false }) {
  return (
    <article className={`${SURFACE} overflow-hidden rounded-2xl sm:rounded-3xl ${accent ? "border-emerald-400/25" : ""}`}>
      <div className="flex justify-center px-3 pt-3 sm:px-4 sm:pt-4">
        <video
          controls
          preload="metadata"
          src={src}
          aria-label={`${title}: ${description}`}
          className="block h-auto max-h-[26rem] w-auto max-w-[16rem] rounded-xl border border-white/[0.08] bg-slate-950 object-contain sm:max-h-[32rem] sm:max-w-[18rem]"
        />
      </div>
      <div className="p-4 sm:p-6">
        <div className={`text-[10px] font-mono uppercase tracking-[0.2em] ${accent ? "text-emerald-300" : "text-slate-500"}`}>
          {eyebrow}
        </div>
        <h3 className="mt-1.5 text-base font-bold text-white sm:mt-2 sm:text-lg">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:mt-1.5 sm:text-sm">{description}</p>
      </div>
    </article>
  );
}
