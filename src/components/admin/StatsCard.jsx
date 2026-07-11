import { TrendingUp, TrendingDown } from "lucide-react";

/**
 * KPI tile used on the admin overview page.
 *
 * <p>Each tile is self-contained — pass the title, value, and an
 * optional formatter. A tiny trend delta can be shown for at-a-glance
 * changes (e.g. "+12% vs last week"); when {@code trend} is
 * {@code undefined} the indicator is omitted so the tile is purely
 * informational.
 */
export default function StatsCard({
  title,
  value,
  icon: Icon,
  accent = "brand",
  formatter,
  trend,
  trendLabel,
}) {
  const formatted = formatter ? formatter(value) : value;

  // Color schemes per accent — kept inline so the file works without
  // a Tailwind config override.
  const accentMap = {
    brand: {
      iconBg: "bg-brand-500/15 border-brand-500/30",
      iconText: "text-brand-300",
    },
    emerald: {
      iconBg: "bg-emerald-500/15 border-emerald-500/30",
      iconText: "text-emerald-300",
    },
    amber: {
      iconBg: "bg-amber-500/15 border-amber-500/30",
      iconText: "text-amber-300",
    },
    rose: {
      iconBg: "bg-rose-500/15 border-rose-500/30",
      iconText: "text-rose-300",
    },
  };
  const c = accentMap[accent] || accentMap.brand;

  const trendIsUp = typeof trend === "number" && trend >= 0;
  const trendCls = trendIsUp
    ? "text-emerald-400 bg-emerald-500/10"
    : "text-rose-400 bg-rose-500/10";
  const TrendIcon = trendIsUp ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 hover:border-slate-700 transition">
      <div className="flex items-start justify-between mb-4">
        <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border ${c.iconBg}`}>
          {Icon && <Icon className={`w-5 h-5 ${c.iconText}`} />}
        </div>
        {typeof trend === "number" && (
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${trendCls}`}>
            <TrendIcon className="w-3 h-3" />
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
      </div>
      <div className="text-2xl font-semibold text-slate-100 tabular-nums">
        {formatted}
      </div>
      <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
        <span>{title}</span>
        {trendLabel && (
          <span className="text-slate-500">· {trendLabel}</span>
        )}
      </div>
    </div>
  );
}