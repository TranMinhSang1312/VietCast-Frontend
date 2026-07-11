import { useEffect, useState, useCallback } from "react";
import { RefreshCw, AlertTriangle, Coins, Users, Download, Bug, Inbox } from "lucide-react";
import { fetchDashboardStats } from "../services/adminApi";
import AdminSidebar from "../components/admin/AdminSidebar";
import StatsCard from "../components/admin/StatsCard";
import RevenueChart from "../components/admin/RevenueChart";

/**
 * Admin overview page — landed at {@code /admin-secret}.
 *
 * <p>Layout: full-height 60/40 split — a fixed left sidebar
 * ({@link AdminSidebar}) + a scrollable right column that hosts the
 * 4 KPI tiles + the 7-day revenue chart.
 *
 * <p>Data source: {@code GET /api/v1/admin/dashboard/stats}. The page
 * polls on focus (so refreshing in DevTools re-fetches) and exposes a
 * manual refresh button. Errors are shown in-page, NOT a toast —
 * admin needs the full HTTP status code to diagnose 403s.
 */
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardStats();
      setStats(data);
      setLastFetchedAt(new Date());
    } catch (err) {
      // Interceptor in src/config.js already translated the error
      // into a Vietnamese, user-safe message. Never render
      // `HTTP xxx:` to end users.
      setError(err?.message || "Không thể tải dữ liệu quản trị.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return (
    <div className="min-h-screen w-full flex bg-slate-950 text-slate-100">
      <AdminSidebar />

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Page header */}
        <header className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/80 backdrop-blur">
          <div>
            <h1 className="text-xl font-semibold">Tổng quan hệ thống</h1>
            <p className="text-xs text-slate-400 mt-1">
              {lastFetchedAt
                ? `Cập nhật lúc ${lastFetchedAt.toLocaleTimeString("vi-VN")}`
                : "Đang tải…"}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-sm transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </header>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium">Không thể tải dữ liệu thống kê.</div>
              <div className="text-xs text-rose-300/80 mt-0.5 font-mono">{error}</div>
            </div>
          </div>
        )}

        {/* KPI tiles */}
        <section className="px-6 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Tổng doanh thu"
              value={stats?.totalRevenue ?? 0}
              icon={Coins}
              accent="emerald"
              formatter={formatVND}
              trendLabel="từ TOPUP"
            />
            <StatsCard
              title="Tổng người dùng"
              value={stats?.totalUsers ?? 0}
              icon={Users}
              accent="brand"
              formatter={formatInt}
              trendLabel={`+${stats?.newSignupsLast7Days ?? 0} trong 7 ngày`}
            />
            <StatsCard
              title="Lượt tải thành công"
              value={stats?.totalVideosCompleted ?? 0}
              icon={Download}
              accent="amber"
              formatter={formatInt}
              trendLabel="video đã render"
            />
            <StatsCard
              title="Số lỗi pipeline"
              value={stats?.totalVideosFailed ?? 0}
              icon={Bug}
              accent="rose"
              formatter={formatInt}
              trendLabel="FFmpeg / Translate / Download"
            />
          </div>
        </section>

        {/* Revenue chart */}
        <section className="px-6 pb-8">
          {loading && !stats ? (
            <ChartSkeleton />
          ) : (
            <RevenueChart totalRevenue={stats?.totalRevenue ?? 0} />
          )}
        </section>

        {/* Empty-state hint when stats haven't loaded yet (no error,
            just very first mount in offline mode) */}
        {!loading && !error && !stats && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              <span>Chưa có dữ liệu thống kê.</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 h-80 animate-pulse">
      <div className="h-4 w-40 bg-slate-800 rounded mb-4" />
      <div className="h-56 w-full bg-slate-800/50 rounded-xl" />
    </div>
  );
}

function formatInt(v) {
  if (v == null || Number.isNaN(v)) return "0";
  return new Intl.NumberFormat("vi-VN").format(v);
}

function formatVND(v) {
  if (v == null || Number.isNaN(v)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(v);
}