import { useState, Suspense, lazy } from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, Users, LogOut, Coins, Shield, Loader2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

// Lazy-load tab contents so the admin bundle does NOT load when the user
// is on the regular /dashboard. Each tab becomes its own chunk.
const AdminDashboard = lazy(() => import("./AdminDashboard"));
const AdminUsers      = lazy(() => import("./AdminUsers"));

const TABS = [
  { id: "dashboard", label: "Tổng quan", icon: BarChart3, path: "/admin" },
  { id: "users",      label: "Người dùng", icon: Users,     path: "/admin/users" },
];

function TabFallback() {
  return (
    <div className="min-h-[40vh] w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
        <span className="text-sm">Đang tải…</span>
      </div>
    </div>
  );
}

/**
 * Shell cho toàn bộ surface admin: nav + outlet. Được route `/admin`
 * render từ App.jsx sau khi gate `user.role === "ADMIN"` pass.
 */
export default function AdminApp() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const activeTabId = location.pathname.startsWith("/admin/users") ? "users" : "dashboard";

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100">
      <nav className="sticky top-0 z-10 backdrop-blur-xl bg-slate-950/70 border-b border-slate-800/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 border border-violet-500/30 px-2.5 py-1 text-xs font-semibold text-violet-300">
                <Shield className="w-3.5 h-3.5" />
                ADMIN
              </span>
              <span className="text-sm font-semibold text-slate-300">VietCast</span>
              <Link
                to="/dashboard"
                className="ml-2 text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                ← Về app
              </Link>
              <div className="inline-flex rounded-xl bg-slate-900/60 border border-white/[0.06] p-1 ml-2">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTabId === tab.id;
                  return (
                    <Link
                      key={tab.id}
                      to={tab.path}
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                        active
                          ? "bg-indigo-500 text-white shadow-[0_8px_30px_-12px_rgba(99,102,241,0.4)]"
                          : "text-slate-300 hover:text-slate-100"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-white/[0.06]">
                <Coins className="w-4 h-4 text-yellow-300" />
                <span className="text-sm font-medium text-slate-200">
                  {user?.creditBalance ?? 0} credit
                </span>
              </div>
              <div className="hidden sm:block text-sm text-slate-400">{user?.username}</div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <Suspense fallback={<TabFallback />}>
        {activeTabId === "users" ? <AdminUsers /> : <AdminDashboard />}
      </Suspense>
    </div>
  );
}