import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  LogOut,
  Activity,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Left navigation rail for the admin dashboard.
 *
 * <p>Navigation items are intentionally short — the admin area is
 * read-mostly at this stage, and the KPI summary page ({@code /})
 * is the primary destination. New entries should default to inactive
 * and live behind feature flags; we don't want a half-built menu
 * confusing admins.
 */
const NAV_ITEMS = [
  { to: "/admin-secret", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { to: "/admin-secret/users", label: "Người dùng", icon: Users, exact: false },
  { to: "/admin-secret/transactions", label: "Giao dịch", icon: CreditCard, exact: false, disabled: true },
  { to: "/admin-secret/system", label: "Hệ thống", icon: Settings, exact: false, disabled: true },
];

export default function AdminSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="w-60 shrink-0 bg-slate-950 border-r border-slate-800/80 flex flex-col">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow shadow-brand-500/30">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">VietCast</div>
            <div className="text-[11px] text-slate-500 tracking-wide">ADMIN CONSOLE</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          // active detection: navigate() returns the current pathname via
          // window.location; we read it here so we don't need a parent
          // route element to pass it down.
          const current = typeof window !== "undefined" ? window.location.pathname : "";
          const isActive = item.exact
            ? current === item.to
            : current.startsWith(item.to);
          const baseCls =
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition";
          const stateCls = item.disabled
            ? "text-slate-600 cursor-not-allowed"
            : isActive
              ? "bg-brand-600/20 text-brand-200 border border-brand-500/30"
              : "text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent";
          return (
            <button
              key={item.to}
              type="button"
              disabled={item.disabled}
              onClick={() => !item.disabled && navigate(item.to)}
              className={`${baseCls} ${stateCls}`}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.disabled && (
                <span className="text-[10px] uppercase tracking-wide text-slate-600">
                  soon
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer (user chip + logout) */}
      <div className="px-3 py-3 border-t border-slate-800/80">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-slate-900/60">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-semibold text-xs">
            {(user?.username || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-200 truncate">{user?.username}</div>
            <div className="text-[10px] text-amber-400 uppercase tracking-wide">Admin</div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Đăng xuất"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}