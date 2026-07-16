import { NavLink } from "react-router-dom";
import {
  Wand2,
  Film,
  Receipt,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

// Single source of truth for the user-facing sidebar. Adding a new entry
// here automatically renders a NavLink with active styling — keep
// `path` aligned with the route defined in App.jsx.
const NAV = [
  { id: "dashboard",     label: "Lồng tiếng",    icon: Wand2,   path: "/dashboard"     },
  { id: "video-history", label: "Lịch sử video", icon: Film,    path: "/video-history" },
  { id: "topup",         label: "Lịch sử nạp",   icon: Receipt, path: "/topup-history" },
  { id: "credit",        label: "Lịch sử tiêu",  icon: Wallet,  path: "/credit-usage"  },
];

export default function Sidebar({ collapsed, onToggle }) {
  return (
    <aside
      className={`hidden md:flex ${
        collapsed ? "md:w-16" : "md:w-60 lg:w-64"
      } shrink-0 flex-col bg-zinc-900 border-r border-zinc-800 transition-[width] duration-200 ease-in-out`}
    >
      {/* Brand — repeats the logo from the header so the user always
          has it visible, but kept compact since the header already
          shows it on small screens. The collapse toggle lives in the
          header of the brand so it is reachable even when the labels
          are hidden. */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-zinc-800">
        {collapsed ? (
          <span className="text-sm font-bold tracking-wide text-zinc-200 select-none">
            V
          </span>
        ) : (
          <div className="select-none min-w-0">
            <span className="text-sm font-bold tracking-wide text-zinc-200">
              VietCast
            </span>
            <p className="mt-1 text-[11px] text-zinc-500 uppercase tracking-wider">
              Studio
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          title={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition active:scale-[0.95]"
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
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition",
                collapsed ? "justify-center" : "",
                isActive
                  ? "bg-brand-500 text-white shadow-md shadow-brand-500/10"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60",
              ].join(" ")
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-5 py-3 border-t border-zinc-800">
          <p className="text-[11px] text-zinc-600">
            v1.0 · Bản nội bộ
          </p>
        </div>
      )}
    </aside>
  );
}
