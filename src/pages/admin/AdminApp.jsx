import { Suspense, lazy } from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, Users, LogOut, Shield, Loader2, Cookie } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

// Lazy-load tab contents so the admin bundle does NOT load when the user
// is on the regular /dashboard. Each tab becomes its own chunk.
const AdminDashboard = lazy(() => import("./AdminDashboard"));
const AdminUsers      = lazy(() => import("./AdminUsers"));
const CookieManager   = lazy(() => import("./CookieManager"));

const TABS = [
  { id: "dashboard", label: "Tổng quan", icon: BarChart3, path: "/admin" },
  { id: "users",      label: "Quản lý Người dùng", icon: Users,     path: "/admin/users" },
  { id: "cookies",    label: "Quản lý Cookie", icon: Cookie,  path: "/admin/cookies" },
];

function TabFallback() {
  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <span className="text-sm font-medium">Đang tải dữ liệu quản trị…</span>
      </div>
    </div>
  );
}

/**
 * Dedicated Standalone Admin Console Shell.
 * Exclusively for ADMIN roles - without any regular user clutter.
 */
export default function AdminApp() {
  const location = useLocation();
  const { user, logout } = useAuth();

  let activeTabId = "dashboard";
  if (location.pathname.startsWith("/admin/users")) {
    activeTabId = "users";
  } else if (location.pathname.startsWith("/admin/cookies")) {
    activeTabId = "cookies";
  }

  return (
    <div className="min-h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Sleek Dedicated Admin Navbar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full">
          <div className="flex items-center justify-between gap-4 py-3.5">
            {/* Brand & Tabs */}
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 text-white font-bold">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-extrabold text-white tracking-tight">VietCast</span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                      Admin
                    </span>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <nav className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-1 rounded-xl">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTabId === tab.id;
                  return (
                    <Link
                      key={tab.id}
                      to={tab.path}
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition active:scale-95 ${
                        active
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="whitespace-nowrap">{tab.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Admin User Info & Logout */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-400 font-mono">{user?.email || user?.username}</span>
              </div>

              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/30 transition active:scale-95"
                title="Đăng xuất khỏi hệ thống"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="font-semibold">Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Admin Surface */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Suspense fallback={<TabFallback />}>
          {activeTabId === "users" ? (
            <AdminUsers />
          ) : activeTabId === "cookies" ? (
            <CookieManager />
          ) : (
            <AdminDashboard />
          )}
        </Suspense>
      </main>
    </div>
  );
}
