import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Coins,
  Video,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Activity,
} from "lucide-react";
import {
  fetchDashboardStats,
  fetchRevenueSeries,
  fetchUserGrowth,
  fetchCostSummary,
  fetchLowMarginJobs,
} from "../../services/admin";
import { formatVND, formatNumber, formatRelative } from "../../utils/format";
import PeriodSelector from "../../components/admin/PeriodSelector";
import RevenueChart from "../../components/admin/RevenueChart";
import UserGrowthChart from "../../components/admin/UserGrowthChart";

/**
 * Thứ tự type hiển thị trên chart doanh thu — khớp với
 * Transaction.Type enum ở backend. Backend luôn trả đầy đủ 5 key với
 * zeros cho bucket rỗng, nên legend ổn định qua mỗi lần reload.
 */
const TRANSACTION_TYPE_ORDER = [
  "TOPUP",
  "REFUND",
  "TRANSLATE",
  "VIDEO_RENDER",
  "TTS",
];

/**
 * Trang dashboard chính cho admin. Gồm:
 *   - 4 KPI card (từ /dashboard/stats)
 *   - PeriodSelector chung cho cả 2 biểu đồ
 *   - Biểu đồ doanh thu (đa-line theo type)
 *   - Biểu đồ tăng trưởng người dùng (newUsers + totalUsers)
 */
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState({ points: [], granularity: null });
  const [growth, setGrowth] = useState({ points: [], granularity: null });
  const [cost, setCost] = useState(null);
  const [lowMargin, setLowMargin] = useState([]);
  const [range, setRange] = useState({ granularity: "MONTH", periods: 12 });
  const [costWindow, setCostWindow] = useState(30);
  const [statsLoading, setStatsLoading] = useState(true);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [costLoading, setCostLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (err) {
      setError(err?.message || "Không tải được thống kê tổng quan.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadSeries = useCallback(async (g, p) => {
    setSeriesLoading(true);
    setError("");
    try {
      const [rev, gr] = await Promise.all([
        fetchRevenueSeries({ granularity: g, periods: p }),
        fetchUserGrowth({ granularity: g, periods: p }),
      ]);
      setRevenue(rev);
      setGrowth(gr);
    } catch (err) {
      setError(err?.message || "Không tải được dữ liệu biểu đồ.");
    } finally {
      setSeriesLoading(false);
    }
  }, []);

  const loadCost = useCallback(async (windowDays) => {
    setCostLoading(true);
    try {
      const [summary, lowMarginRows] = await Promise.all([
        fetchCostSummary({ windowDays }),
        fetchLowMarginJobs({ limit: 10 }),
      ]);
      setCost(summary);
      setLowMargin(Array.isArray(lowMarginRows) ? lowMarginRows : []);
    } catch (err) {
      // Cost widget is operator-side; surface the error inline rather
      // than blowing away the whole page's error banner.
      console.error("[AdminDashboard] cost summary failed:", err);
      setCost(null);
    } finally {
      setCostLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    loadSeries(range.granularity, range.periods);
  }, [loadSeries, range]);
  useEffect(() => { loadCost(costWindow); }, [loadCost, costWindow]);

  // Derive revenue type set with stable legend order — backend returns
  // the full set already, but we re-derive defensively so a future
  // backend change cannot silently break the legend.
  const revenueTypes = useMemo(() => {
    const seen = new Set();
    (revenue.points || []).forEach((p) => {
      Object.keys(p.amountsByType || {}).forEach((k) => seen.add(k));
    });
    return TRANSACTION_TYPE_ORDER.filter((t) => seen.has(t));
  }, [revenue.points]);

  const handleRangeChange = (next) => setRange(next);

  const handleRefresh = () => {
    loadStats();
    loadSeries(range.granularity, range.periods);
    loadCost(costWindow);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">
            Dashboard quản trị
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {stats?.generatedAt
              ? `Cập nhật ${formatRelative(stats.generatedAt)}`
              : "Đang tải…"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/80 transition"
        >
          <RefreshCw className={`w-4 h-4 ${(statsLoading || seriesLoading) ? "animate-spin" : ""}`} />
          <span>Làm mới</span>
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-700/40 bg-rose-900/30 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Coins className="w-5 h-5" />}
          title="Tổng doanh thu"
          value={statsLoading ? "…" : formatVND(stats?.totalRevenue)}
          tone="amber"
        />
        <KpiCard
          icon={<Users className="w-5 h-5" />}
          title="Tổng người dùng"
          value={statsLoading ? "…" : formatNumber(stats?.totalUsers)}
          tone="cyan"
        />
        <KpiCard
          icon={<Video className="w-5 h-5" />}
          title="Video đã hoàn tất"
          value={statsLoading ? "…" : formatNumber(stats?.totalVideosCompleted)}
          tone="violet"
        />
        <KpiCard
          icon={<UserPlus className="w-5 h-5" />}
          title="Đăng ký 7 ngày qua"
          value={statsLoading ? "…" : formatNumber(stats?.newSignupsLast7Days)}
          tone="emerald"
        />
      </section>

      {/* Cost widget — operator-side margin tracker.
          Powers the "Tổng cost / revenue / margin %" KPIs and a per-mode
          breakdown, plus a list of the latest loss-leading jobs so the
          operator can spot regressions early. */}
      <section className="rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-slate-300">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-semibold">Cost &amp; margin</h2>
            <span className="text-[11px] text-slate-500">
              (Gemini STT/translate + Render CPU + R2)
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Khoảng:</span>
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setCostWindow(d)}
                className={
                  "rounded-md px-2.5 py-1 font-semibold transition " +
                  (costWindow === d
                    ? "bg-emerald-500/20 border border-emerald-400/40 text-emerald-200"
                    : "bg-slate-900/60 border border-white/[0.06] text-slate-300 hover:bg-slate-800/80")
                }
              >
                {d} ngày
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<DollarSign className="w-5 h-5" />}
            title="Tổng cost"
            value={costLoading || !cost ? "…" : `$${cost.totalCostUsd.toFixed(2)}`}
            tone="amber"
          />
          <KpiCard
            icon={<Coins className="w-5 h-5" />}
            title="Tổng revenue (render)"
            value={costLoading || !cost ? "…" : `$${cost.totalRevenueUsd.toFixed(2)}`}
            tone="emerald"
          />
          <KpiCard
            icon={<TrendingUp className="w-5 h-5" />}
            title="Margin"
            value={
              costLoading || !cost
                ? "…"
                : `${(cost.marginPct ?? 0).toFixed(1)}%`
            }
            tone={(cost?.marginPct ?? 0) >= 30 ? "emerald" : (cost?.marginPct ?? 0) >= 0 ? "cyan" : "amber"}
            subtitle={cost ? `$${cost.totalMarginUsd.toFixed(2)} tuyệt đối` : null}
          />
          <KpiCard
            icon={<Activity className="w-5 h-5" />}
            title="Số job"
            value={costLoading || !cost ? "…" : formatNumber(cost.jobCount)}
            tone="violet"
            subtitle={
              cost
                ? `${formatNumber(cost.failedCount)} lỗi · ${formatNumber(cost.totalDurationSeconds)} giây render`
                : null
            }
          />
        </div>

        {cost && cost.byMode && cost.byMode.length > 0 && (
          <div className="border-t border-slate-800 pt-5">
            <h3 className="text-sm font-medium text-slate-300 mb-3">
              Margin theo chế độ
            </h3>
            <div className="overflow-x-auto rounded-lg border border-white/[0.05]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/60 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">
                    <th className="text-left px-4 py-2 font-medium">Chế độ</th>
                    <th className="text-right px-4 py-2 font-medium">Số job</th>
                    <th className="text-right px-4 py-2 font-medium">Cost (USD)</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue (USD)</th>
                    <th className="text-right px-4 py-2 font-medium">Margin (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.byMode.map((m) => (
                    <tr key={m.audioMode || "unknown"} className="border-t border-white/[0.04]">
                      <td className="px-4 py-2 font-semibold text-slate-200">
                        {m.audioMode || "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300">
                        {formatNumber(m.jobCount)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300">
                        ${m.totalCostUsd.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right text-emerald-300">
                        ${m.totalRevenueUsd.toFixed(2)}
                      </td>
                      <td
                        className={
                          "px-4 py-2 text-right font-semibold " +
                          (m.totalMarginUsd >= 0 ? "text-emerald-300" : "text-rose-300")
                        }
                      >
                        ${m.totalMarginUsd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {lowMargin.length > 0 && (
          <div className="border-t border-slate-800 pt-5">
            <h3 className="text-sm font-medium text-slate-300 mb-3">
              Job margin thấp gần đây
            </h3>
            <div className="overflow-x-auto rounded-lg border border-white/[0.05]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/60 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">
                    <th className="text-left px-4 py-2 font-medium">Task ID</th>
                    <th className="text-left px-4 py-2 font-medium">User</th>
                    <th className="text-left px-4 py-2 font-medium">Chế độ</th>
                    <th className="text-right px-4 py-2 font-medium">Cost</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue</th>
                    <th className="text-right px-4 py-2 font-medium">Margin</th>
                    <th className="text-left px-4 py-2 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {lowMargin.map((row) => (
                    <tr key={row.taskId} className="border-t border-white/[0.04]">
                      <td className="px-4 py-2 font-mono text-slate-300 text-xs">{row.taskId}</td>
                      <td className="px-4 py-2 text-slate-300">#{row.userId}</td>
                      <td className="px-4 py-2 text-slate-300">{row.audioMode || "—"}</td>
                      <td className="px-4 py-2 text-right text-slate-300">
                        ${(row.totalCostUsd ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right text-emerald-300">
                        ${(row.userChargedUsd ?? 0).toFixed(2)}
                      </td>
                      <td
                        className={
                          "px-4 py-2 text-right font-semibold " +
                          ((row.marginUsd ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")
                        }
                      >
                        ${(row.marginUsd ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            "inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold " +
                            (row.outcome === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-400/30"
                              : "bg-rose-500/10 text-rose-300 border border-rose-400/30")
                          }
                        >
                          {row.outcome || "UNKNOWN"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {cost && cost.jobCount === 0 && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 py-3 text-sm text-slate-400">
            Chưa có job nào trong khoảng {costWindow} ngày. Cost tracking sẽ tự
            populate sau khi pipeline ghi nhận render đầu tiên.
          </div>
        )}
      </section>
      <section className="rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-slate-300">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-semibold">Thống kê theo thời gian</h2>
          </div>
          <PeriodSelector value={range} onChange={handleRangeChange} />
        </div>

        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            Doanh thu theo loại giao dịch
          </h3>
          <RevenueChart
            points={revenue.points}
            types={revenueTypes}
            loading={seriesLoading}
          />
        </div>

        <div className="border-t border-slate-800 pt-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            Tăng trưởng người dùng
          </h3>
          <UserGrowthChart points={growth.points} loading={seriesLoading} />
        </div>
      </section>
    </div>
  );
}

function KpiCard({ icon, title, value, tone = "cyan", subtitle = null }) {
  const toneClass = {
    amber:   "text-yellow-300 bg-yellow-400/10 border-yellow-400/30",
    cyan:    "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
    violet:  "text-violet-300 bg-violet-500/10 border-violet-500/30",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  }[tone] || "text-cyan-300 bg-cyan-500/10 border-cyan-500/30";

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4 flex items-start gap-3">
      <div className={`rounded-lg border p-2 ${toneClass}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-slate-400">{title}</div>
        <div className="mt-1 text-lg font-semibold text-slate-100 truncate">{value}</div>
        {subtitle && (
          <div className="mt-0.5 text-[11px] text-slate-500 truncate">{subtitle}</div>
        )}
      </div>
    </div>
  );
}