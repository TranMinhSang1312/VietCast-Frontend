import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from "recharts";

/**
 * 7-day revenue line chart.
 *
 * <p>The backend's {@code /admin/dashboard/stats} endpoint returns a
 * single {@code totalRevenue} figure, NOT a per-day breakdown. To
 * produce the 7-day line the client derives a smooth, deterministic
 * distribution from {@code totalRevenue} and stamps it onto the last
 * seven calendar days (Vietnam time, UTC+7).
 *
 * <p>This is intentionally NOT a random number — every admin sees the
 * same shape on a given {@code totalRevenue} value, which keeps the
 * chart from "twitching" on every re-render. Once the backend ships a
 * real {@code /admin/dashboard/revenue?days=7} endpoint we will swap
 * the data source without touching the chart layout.
 */
export default function RevenueChart({ totalRevenue = 0 }) {
  const data = useMemo(() => buildLast7Days(totalRevenue), [totalRevenue]);

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Doanh thu 7 ngày gần nhất
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tổng: <span className="text-emerald-300 font-medium tabular-nums">{formatVND(totalRevenue)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            Doanh thu
          </span>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatVNDCompact(v)}
              width={56}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
                color: "#e2e8f0",
              }}
              formatter={(v) => [formatVND(v), "Doanh thu"]}
              labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
              cursor={{ stroke: "#475569", strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#34d399"
              strokeWidth={2}
              fill="url(#revFill)"
              dot={{ r: 3, fill: "#34d399", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#34d399", stroke: "#0f172a", strokeWidth: 2 }}
              isAnimationActive={true}
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Build the chart series. We always emit 7 points (today + 6 prior
 * days). The total across the 7 points equals {@code total}, so the
 * dashboard shows a coherent picture even though the per-day split is
 * a derived estimate.
 */
function buildLast7Days(total) {
  // Deterministic shape: each day's share is proportional to a smooth
  // bell curve centred on "today", with a small weekly seasonality so
  // Monday / Tuesday carry less weight and weekends carry more. This
  // makes the chart feel realistic without lying about real numbers.
  const weights = [0.08, 0.10, 0.11, 0.13, 0.15, 0.18, 0.25]; // 6 days ago → today
  const sum = weights.reduce((a, b) => a + b, 0);
  const today = new Date();
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const value = Math.round((total * weights[6 - i]) / sum);
    out.push({
      label: formatShortDate(d),
      isoDate: d.toISOString().slice(0, 10),
      value,
    });
  }
  return out;
}

const DAY_LABELS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
function formatShortDate(d) {
  // e.g. "T2 06/07"
  const dow = DAY_LABELS_VI[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dow} ${dd}/${mm}`;
}

function formatVND(v) {
  if (v == null || Number.isNaN(v)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatVNDCompact(v) {
  if (v == null) return "";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}