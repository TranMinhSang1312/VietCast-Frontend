import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Dropdown cho phép admin chọn khoảng thời gian (granularity + periods)
 * cho các biểu đồ thống kê. Phát `onChange({ granularity, periods })`
 * lên mỗi lần người dùng đổi lựa chọn.
 *
 * Presets (granularity -> periods):
 *   - DAY    -> 30 (30 ngày gần nhất)
 *   - MONTH  -> 12 (12 tháng gần nhất)   <- default
 *   - YEAR   -> 5  (5 năm gần nhất)
 */
const PRESETS = Object.freeze([
  { id: "DAY",   label: "Ngày (30 ngày)",  granularity: "DAY",   periods: 30  },
  { id: "MONTH", label: "Tháng (12 tháng)", granularity: "MONTH", periods: 12 },
  { id: "YEAR",  label: "Năm (5 năm)",     granularity: "YEAR",  periods: 5  },
]);

export default function PeriodSelector({ value, onChange }) {
  const initialId = value?.granularity === "DAY" || value?.granularity === "YEAR"
    ? value.granularity
    : "MONTH";
  const [selectedId, setSelectedId] = useState(initialId);

  // Đồng bộ khi prop `value` thay đổi từ bên ngoài (ví dụ reload).
  useEffect(() => {
    if (value && (value.granularity === "DAY" || value.granularity === "YEAR"
        || value.granularity === "MONTH")) {
      setSelectedId(value.granularity);
    }
  }, [value]);

  const handleSelect = (preset) => {
    setSelectedId(preset.id);
    onChange?.({ granularity: preset.granularity, periods: preset.periods });
  };

  return (
    <div className="relative inline-block">
      <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1.5">
        Khoảng thời gian
      </label>
      <div className="group relative">
        <select
          value={selectedId}
          onChange={(e) => {
            const preset = PRESETS.find((p) => p.id === e.target.value);
            if (preset) handleSelect(preset);
          }}
          className="appearance-none rounded-lg border border-slate-700 bg-slate-900/70 pl-3 pr-9 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      </div>
    </div>
  );
}