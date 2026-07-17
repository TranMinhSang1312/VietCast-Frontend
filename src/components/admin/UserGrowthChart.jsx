import {
  ResponsiveContainer,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { formatNumber } from "../../utils/format";

/**
 * Line chart cho user-growth. Render đường "newUsers" (số tài khoản tạo
 * mới trong bucket) và đường "totalUsers" (running total tới cuối bucket).
 *
 * Props:
 *   points: Array<{ period: string, newUsers: number, totalUsers: number }>
 *   loading: boolean
 */
export default function UserGrowthChart({ points, loading }) {
  if (loading) {
    return (
      <div className="h-72 w-full rounded-xl border border-white/[0.06] bg-slate-900/40 animate-pulse" />
    );
  }

  if (!points || points.length === 0) {
    return (
      <div className="h-72 w-full rounded-xl border border-dashed border-white/[0.06] flex items-center justify-center text-slate-500 text-sm">
        Chưa có dữ liệu
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis
            dataKey="period"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={{ stroke: "#334155" }}
            axisLine={{ stroke: "#334155" }}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={{ stroke: "#334155" }}
            axisLine={{ stroke: "#334155" }}
            tickFormatter={(v) => formatNumber(v)}
            width={60}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#f1f5f9",
            }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(value, name) => [
              formatNumber(value),
              name === "newUsers" ? "Mới trong kỳ" : "Tổng tích lũy",
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }}
            iconType="line"
            formatter={(value) =>
              value === "newUsers" ? "Mới trong kỳ" : "Tổng tích lũy"
            }
          />
          <Line
            type="monotone"
            dataKey="newUsers"
            name="newUsers"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="totalUsers"
            name="totalUsers"
            stroke="#a78bfa"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}