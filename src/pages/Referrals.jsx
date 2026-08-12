import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  Gift,
  Loader2,
  Send,
  Share2,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { applyReferralCode, getReferralDashboard } from "../services/referrals";
import { formatCountdown, formatCredit } from "../utils/format";
import { useAuth } from "../contexts/AuthContext";

const MILESTONES = [
  { count: 1, total: 5_000 },
  { count: 2, total: 7_000 },
  { count: 3, total: 10_000 },
];

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function statusCopy(status) {
  if (status === "QUALIFIED") return "Đã nhận thưởng";
  if (status === "EXPIRED") return "Đã hết hạn";
  return "Chờ hoàn thành tác vụ đầu tiên";
}

export default function Referrals() {
  const { syncProfile } = useAuth();
  const [data, setData] = useState(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    getReferralDashboard()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Không thể tải chương trình giới thiệu.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const shareUrl = useMemo(() => {
    if (!data?.referralCode) return "";
    return `${window.location.origin}/login?ref=${encodeURIComponent(data.referralCode)}`;
  }, [data?.referralCode]);

  const handleCopy = async (value, message) => {
    try {
      await copyText(value);
      setNotice(message);
      window.setTimeout(() => setNotice(""), 2500);
    } catch {
      setError("Trình duyệt không cho phép sao chép. Hãy giữ và sao chép mã thủ công.");
    }
  };

  const handleShare = async () => {
    const text = `Dùng mã ${data.referralCode} để nhận 5.000 credit VietCast sau tác vụ đầu tiên.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "VietCast", text, url: shareUrl });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    await handleCopy(`${text}\n${shareUrl}`, "Đã sao chép lời mời.");
  };

  const handleApply = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,16}$/.test(normalized)) {
      setError("Mã giới thiệu chưa đúng định dạng.");
      return;
    }
    setApplying(true);
    try {
      const next = await applyReferralCode(normalized);
      setData(next);
      setCode("");
      setNotice("Đã ghi nhận mã. 5.000 credit sẽ được cộng sau tác vụ đầu tiên thành công.");
      await syncProfile();
    } catch (err) {
      setError(err?.message || "Không thể áp dụng mã giới thiệu.");
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  const qualified = Math.min(Number(data?.qualifiedInvitees || 0), 3);
  const referralDeadline = data?.referralExpiresAt
    ? new Date(data.referralExpiresAt).getTime()
    : 0;
  const active = Boolean(data?.programActive && referralDeadline > now);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
            <Sparkles className="h-3.5 w-3.5" />
            Chương trình 3 ngày
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Giới thiệu bạn bè, cùng nhận credit
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Bạn bè nhận 5.000 credit sau tác vụ đầu tiên thành công. Phần thưởng của bạn tăng theo tổng mốc 5.000 → 7.000 → 10.000 credit.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 self-start rounded-xl border px-3 py-2 text-xs font-medium ${active ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
          <Clock3 className="h-4 w-4" />
          {active ? `Còn ${formatCountdown(data.referralExpiresAt)}` : "Chương trình đã hết hạn"}
        </div>
      </div>

      {(error || notice) && (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-400/25 bg-rose-400/[0.08] text-rose-200" : "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200"}`}>
          {error || notice}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-2xl border border-white/[0.07] bg-slate-900/55 p-5 shadow-2xl shadow-black/10 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/25">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-white">Mã của bạn</h2>
              <p className="text-xs text-slate-500">Mỗi người bạn chỉ được dùng một mã.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-indigo-400/20 bg-indigo-500/[0.07] p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 font-mono text-2xl font-black tracking-[0.16em] text-white">
              {data.referralCode}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleCopy(data.referralCode, "Đã sao chép mã.")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.09] sm:flex-none">
                <Copy className="h-4 w-4" /> Sao chép
              </button>
              <button type="button" onClick={handleShare} disabled={!active} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">
                <Send className="h-4 w-4" /> Chia sẻ
              </button>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Tiến độ của bạn</span>
              <span className="font-mono text-emerald-300">{qualified}/3 người hoàn tất</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all" style={{ width: `${(qualified / 3) * 100}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {MILESTONES.map((milestone) => {
                const reached = qualified >= milestone.count;
                return (
                  <div key={milestone.count} className={`rounded-xl border p-3 ${reached ? "border-emerald-400/25 bg-emerald-400/[0.08]" : "border-white/[0.06] bg-slate-950/45"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">Mốc {milestone.count}</span>
                      {reached && <Check className="h-3.5 w-3.5 text-emerald-300" />}
                    </div>
                    <p className={`mt-2 text-sm font-bold ${reached ? "text-emerald-200" : "text-slate-300"}`}>{formatCredit(milestone.total)}</p>
                    <p className="text-[10px] text-slate-500">tổng thưởng</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-slate-950/45 p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500"><Users className="h-4 w-4" /> Đang chờ</div>
              <p className="mt-2 text-xl font-black text-white">{data.pendingInvitees || 0}</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-slate-950/45 p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500"><Gift className="h-4 w-4" /> Đã nhận</div>
              <p className="mt-2 text-xl font-black text-emerald-300">{formatCredit(data.totalReferrerReward || 0)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-slate-900/55 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300 ring-1 ring-amber-300/20">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-white">Mã bạn được giới thiệu</h2>
              <p className="text-xs text-slate-500">Nhập một lần, không thể đổi mã khác.</p>
            </div>
          </div>

          {data.appliedCode ? (
            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-slate-950/55 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-lg font-bold tracking-widest text-white">{data.appliedCode}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${data.appliedStatus === "QUALIFIED" ? "bg-emerald-400/10 text-emerald-300" : data.appliedStatus === "EXPIRED" ? "bg-rose-400/10 text-rose-300" : "bg-amber-400/10 text-amber-200"}`}>
                  {statusCopy(data.appliedStatus)}
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                {data.appliedStatus === "QUALIFIED"
                  ? "5.000 credit đã được cộng vào phúc lợi có hạn của bạn."
                  : data.appliedStatus === "EXPIRED"
                  ? "Mã đã hết hạn trước khi có tác vụ thành công nên không phát sinh thưởng."
                  : "Hãy hoàn thành tác vụ video đầu tiên trước hạn. Hệ thống sẽ tự cộng 5.000 credit, bạn không cần quay lại bấm nhận."}
              </p>
              {data.appliedStatus === "PENDING" && data.qualifyingDeadline && (
                <div className="mt-4 flex items-center gap-2 text-xs text-amber-200/80"><Clock3 className="h-4 w-4" /> Còn {formatCountdown(data.qualifyingDeadline)} để hoàn thành tác vụ</div>
              )}
            </div>
          ) : data.canApplyCode ? (
            <form onSubmit={handleApply} className="mt-5">
              <label htmlFor="referral-code" className="text-xs font-semibold text-slate-300">Nhập mã giới thiệu</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input id="referral-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16))} autoComplete="off" placeholder="VD: VC12AB34CD" className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-slate-950 px-4 py-3 font-mono text-sm uppercase tracking-wider text-white outline-none transition placeholder:text-slate-700 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/10" />
                <button type="submit" disabled={applying || !code.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-45">
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                  Áp dụng
                </button>
              </div>
              <div className="mt-4 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4 text-xs leading-relaxed text-emerald-100/70">
                Credit không cộng ngay khi nhập mã. Cách này giúp chương trình công bằng: xác thực tài khoản, hoàn thành một tác vụ thật, sau đó hệ thống tự phát thưởng.
              </div>
            </form>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-slate-950/55 p-5 text-sm leading-relaxed text-slate-400">
              {active
                ? "Tài khoản đã hoàn thành tác vụ đầu tiên nên không còn đủ điều kiện nhập mã mới. Bạn vẫn có thể chia sẻ mã của mình ở bên trái."
                : "Thời hạn ba ngày để nhập mã đã kết thúc. Bạn vẫn có thể xem lại tiến độ và phần thưởng đã nhận."}
            </div>
          )}

          <div className="mt-6 space-y-3 border-t border-white/[0.06] pt-5 text-xs text-slate-500">
            <p>• Một tài khoản chỉ nhập được một mã và không dùng mã của chính mình.</p>
            <p>• Người được mời phải hoàn thành tác vụ đầu tiên trong thời hạn hiển thị.</p>
            <p>• Thưởng là credit phúc lợi có hạn, không cộng dồn 5.000 + 7.000 + 10.000.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
