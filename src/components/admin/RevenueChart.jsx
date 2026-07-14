import {
  ResponsiveContainer,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { CHART_COLORS, formatVND } from "../../utils/format";

/**
 * Multi-line chart for revenue series. Một đường cho mỗi transaction type
 * (TOPUP, REFUND, TRANSLATE, VIDEO_RENDER, TTS). Các type không có dữ liệu
 * vẫn hiển thị đường phẳng 0 do backend đã fill zeros cho từng bucket.
 *
 * Props:
 *   points: Array<{ period: string, amountsByType: Record<string, number> }>
 *   types:  string[] ordered list of types to render (legend order)
 *   loading: boolean — nếu true hiển thị skeleton
 */
export default function RevenueChart({ points, types = [], loading }) {
  if (loading) {
    return (
      <div className="h-72 w-full rounded-xl border border-slate-800 bg-slate-900/40 animate-pulse" />
    );
  }

  if (!points || points.length === 0 || types.length === 0) {
    return (
      <div className="h-72 w-full rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-sm">
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
            tickFormatter={(v) => formatVND(v).replace(/\s*₫$/, "")}
            width={80}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#f1f5f9",
            }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(value, name) => [formatVND(value), name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }}
            iconType="line"
          />
          {types.map((typeName, idx) => (
            <Line
              key={typeName}
              type="monotone"
              dataKey={(d) => d.amountsByType?.[typeName] ?? 0}
              name={typeName}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}