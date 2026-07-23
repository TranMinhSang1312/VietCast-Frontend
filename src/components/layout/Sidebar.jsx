import { NavLink } from "react-router-dom";
import {
  Wand2,
  Film,
  Receipt,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
  Coins,
} from "lucide-react";

// Single source of truth for the user-facing sidebar. Adding a new entry
// here automatically renders a NavLink with active styling.
const NAV = [
  { id: "dashboard",     label: "Lồng tiếng",    icon: Wand2,   path: "/dashboard"     },
  { id: "video-history", label: "Lịch sử video", icon: Film,    path: "/video-history" },
  { id: "topup",         label: "Lịch sử nạp",   icon: Receipt, path: "/topup-history" },
  { id: "credit",        label: "Lịch sử tiêu",  icon: Wallet,  path: "/credit-usage"  },
  { id: "pricing",       label: "Phí dịch vụ",   icon: Coins,   path: "/pricing"       },
];

export default function Sidebar({ collapsed, onToggle }) {
  return (
    <aside
      className={`hidden md:flex ${
        collapsed ? "md:w-16" : "md:w-60 lg:w-64"
      } shrink-0 flex-col bg-slate-950/90 border-r border-white/[0.06] backdrop-blur-xl transition-[width] duration-200 ease-in-out`}
    >
      {/* Brand area. Hidden when collapsed (the icon-only variant is
          skipped — a slim chevron at the top still hints at the brand
          without competing for space with the toggle button. */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/[0.06]">
        {collapsed ? (
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0 select-none">
            <img src="/logo.png" alt="VietCast Logo" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 select-none min-w-0">
            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="VietCast Logo" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold tracking-tight text-white">
                VietCast
              </span>
              <p className="mt-0.5 text-[10px] text-slate-500 uppercase tracking-[0.18em] font-mono">
                Studio
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          title={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.06] transition active:scale-[0.95]"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon, path }) => (
          <NavLink
            key={id}
            to={path}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              [
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
                collapsed ? "justify-center" : "",
                isActive
                  ? "bg-indigo-500/10 text-white ring-1 ring-indigo-400/30 shadow-[0_8px_30px_-12px_rgba(99,102,241,0.4)]"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition ${
                    isActive
                      ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/30"
                      : "bg-white/[0.04] text-slate-400 group-hover:text-white"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                {!collapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-5 py-3 border-t border-white/[0.06]">
          <p className="text-[11px] text-slate-500 font-mono">
            v1.0 · Bản nội bộ
          </p>
        </div>
      )}
    </aside>
  );
}
