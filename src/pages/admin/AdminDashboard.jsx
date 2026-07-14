import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Coins,
  Video,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import {
  fetchDashboardStats,
  fetchRevenueSeries,
  fetchUserGrowth,
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
  const [range, setRange] = useState({ granularity: "MONTH", periods: 12 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [seriesLoading, setSeriesLoading] = useState(true);
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

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    loadSeries(range.granularity, range.periods);
  }, [loadSeries, range]);

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
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/80 transition"
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

      {/* Range selector + charts */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-slate-300">
            <TrendingUp className="w-4 h-4 text-brand-500" />
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

function KpiCard({ icon, title, value, tone = "cyan" }) {
  const toneClass = {
    amber:   "text-amber-300 bg-amber-500/10 border-amber-500/30",
    cyan:    "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
    violet:  "text-violet-300 bg-violet-500/10 border-violet-500/30",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  }[tone] || "text-cyan-300 bg-cyan-500/10 border-cyan-500/30";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 flex items-start gap-3">
      <div className={`rounded-lg border p-2 ${toneClass}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-slate-400">{title}</div>
        <div className="mt-1 text-lg font-semibold text-slate-100 truncate">{value}</div>
      </div>
    </div>
  );
}