import { NavLink, Link } from "react-router-dom";
import {
  Wand2,
  Film,
  Receipt,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
  Coins,
} from "lucide-react";
import { Eraser } from "@phosphor-icons/react";

// Single source of truth for the user-facing sidebar. Adding a new entry
// here automatically renders a NavLink with active styling.
const NAV = [
  { id: "dashboard",     label: "Lồng tiếng",        mobileLabel: "Dịch",     icon: Wand2,   path: "/dashboard"          },
  { id: "watermark",     label: "Xóa Logo / Phụ đề", mobileLabel: "Xóa logo", icon: Eraser,  path: "/watermark-remover"  },
  { id: "video-history", label: "Lịch sử video",     mobileLabel: "Video",    icon: Film,    path: "/video-history"      },
  { id: "topup",         label: "Lịch sử nạp",       mobileLabel: "Nạp",      icon: Receipt, path: "/topup-history"      },
  { id: "credit",        label: "Lịch sử tiêu",      mobileLabel: "Chi tiêu", icon: Wallet,  path: "/credit-usage"       },
  { id: "pricing",       label: "Phí dịch vụ",       mobileLabel: "Bảng phí", icon: Coins,   path: "/pricing"            },
];

export default function Sidebar({ collapsed, onToggle }) {
  return (
    <aside
      className={`hidden md:flex ${
        collapsed ? "md:w-16" : "md:w-60 lg:w-64"
      } shrink-0 flex-col bg-slate-950/90 border-r border-white/[0.06] backdrop-blur-xl transition-[width] duration-200 ease-in-out`}
    >
      {/* Brand area with Link to Home */}
      <div className="flex items-center justify-between px-3.5 py-4 border-b border-white/[0.06]">
        {collapsed ? (
          <Link
            to="/"
            title="Về trang chủ"
            className="flex items-center justify-center shrink-0 select-none hover:opacity-90 transition"
          >
            <img src="/logo.png" alt="VietCast Logo" className="w-9 h-9 object-contain" />
          </Link>
        ) : (
          <Link
            to="/"
            title="Về trang chủ"
            className="flex items-center gap-3 select-none min-w-0 group hover:opacity-90 transition"
          >
            <img src="/logo.png" alt="VietCast Logo" className="w-10 h-10 object-contain shrink-0 group-hover:scale-105 transition-transform" />
            <div className="min-w-0">
              <span className="text-base font-extrabold tracking-tight text-white group-hover:text-indigo-200 transition">
                VietCast
              </span>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.18em] font-mono">
                Studio
              </p>
            </div>
          </Link>
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
    </aside>
  );
}

export function MobileBottomNav() {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-slate-950/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden"
    >
      <div className="grid grid-cols-6">
        {NAV.map(({ id, mobileLabel, icon: Icon, path }) => (
          <NavLink
            key={id}
            to={path}
            className={({ isActive }) =>
              [
                "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[9px] font-medium transition active:scale-[0.96]",
                isActive ? "bg-indigo-500/12 text-indigo-200" : "text-slate-500",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-[18px] w-[18px] ${isActive ? "text-indigo-300" : "text-slate-500"}`} />
                <span className="w-full truncate text-center">{mobileLabel}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
