import { Suspense, lazy, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, Outlet } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Sidebar from "./components/layout/Sidebar";
import TopupModal from "./components/topup/TopupModal";
import { LogOut, Coins, Loader2, Shield } from "lucide-react";

// Lazy-load the heavy tab contents so the initial bundle only ships the
// Login + nav chrome. Each tab is its own chunk that gets fetched the
// first time the user clicks the tab — measurable cold-start win on
// the first paint.
const VideoDashboard     = lazy(() => import("./pages/VideoDashboard"));
const VideoHistory       = lazy(() => import("./pages/VideoHistory"));

// Admin surface is its own lazy chunk so a non-admin user never pays
// the bytes. Mounted only when user.role === "ADMIN" (see App below).
const AdminApp           = lazy(() => import("./pages/admin/AdminApp"));

// PayOS landing pages — small enough to inline but kept lazy for
// consistency with the rest of the chrome.
const PaymentSuccess     = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancel      = lazy(() => import("./pages/PaymentCancel"));

// Credit-history pages — accessible from inside TopupModal via plain
// links. Both reuse the same lazy-load pattern so the initial bundle
// does not grow when the user lands on /dashboard.
const TopupHistory       = lazy(() => import("./pages/TopupHistory"));
const CreditUsageHistory = lazy(() => import("./pages/CreditUsageHistory"));

function TabFallback() {
  return (
    <div className="min-h-[40vh] w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-brand-500" />
        <span className="text-sm">Đang tải…</span>
      </div>
    </div>
  );
}

// Shell rendered for any authenticated user route. The previous design
// used a tab-switch state inside AppContent; we now route each tab to
// its own URL so deep-linking, browser-back, and shared links all work
// the same way. Sidebar lives on the left; the slim header on top only
// carries the high-level affordances — balance + topup, admin link,
// username, logout — keeping the top bar visually quiet.
function AppShell() {
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 shadow-md">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            {/* Mobile-only brand — sidebar is hidden < md and we still
                want a tiny label so the empty header doesn't read as
                broken on phones. */}
            <span className="md:hidden text-sm font-bold text-zinc-200 select-none">
              VietCast
            </span>

            {/* Right cluster — slim on purpose: only Nạp tiền + admin
                chip + username + logout live here. Navigation between
                features lives in the sidebar. */}
            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              {user?.role === "ADMIN" && (
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 transition"
                  title="Mở trang quản trị"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Quản trị</span>
                </Link>
              )}

              {/* Credit balance + Topup trigger */}
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800">
                  <Coins className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium text-zinc-300">
                    {user?.creditBalance ?? 0} credit
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTopupOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition active:scale-[0.98]"
                  title="Nạp thêm credit qua PayOS / VietQR"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Nạp tiền</span>
                </button>
              </div>

              {/* Username */}
              <div className="hidden md:block text-sm text-zinc-400">
                {user?.username}
              </div>

              {/* Logout button */}
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition active:scale-[0.98]"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          {/* Outlet lets each sidebar link render its own page inside
              this shell. The Suspense boundary covers lazy chunks. */}
          <Suspense fallback={<TabFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Topup modal lives at the App root so it can be opened from
          any tab and survives tab switches. */}
      <TopupModal
        isOpen={isTopupOpen}
        onClose={() => setIsTopupOpen(false)}
      />
    </div>
  );
}

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  // We use BrowserRouter (NOT HashRouter) so the production web build
  // serves clean URLs like https://vietcast.com/dashboard. Hash-based
  // routing only made sense inside Electron's loadFile() context where
  // the renderer never sees a real server-side route — on the web we
  // want every URL to be a real, shareable path.
  return (
    <BrowserRouter>
      {/* Show loading spinner while checking auth */}
      {isLoading ? (
        <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-sm">Đang tải...</span>
          </div>
        </div>
      ) : (
        <Routes>
          {/* Login page — accessible to unauthenticated users */}
          <Route path="/login" element={<Login />} />

          {/* PayOS landing pages — public so the redirect after
              payment (which may strip auth headers) still loads.
              Both pages call refreshProfile() on mount so the user
              sees their new balance without re-logging-in. */}
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/payment/cancel" element={<PaymentCancel />} />

          {/* Credit history pages — accessible without shell so a
              direct link to a payment-history URL works the same as
              navigating via the sidebar. */}
          <Route
            path="/topup-history"
            element={
              isAuthenticated
                ? <Suspense fallback={<TabFallback />}><TopupHistory /></Suspense>
                : <Navigate to="/login" replace />
            }
          />
          <Route
            path="/credit-usage"
            element={
              isAuthenticated
                ? <Suspense fallback={<TabFallback />}><CreditUsageHistory /></Suspense>
                : <Navigate to="/login" replace />
            }
          />

          {/* Authenticated shell with sidebar. Each child route
              renders inside <Outlet />. */}
          <Route
            element={
              isAuthenticated ? <AppShell /> : <Navigate to="/login" replace />
            }
          >
            <Route path="/dashboard"     element={<VideoDashboard />} />
            <Route path="/video-history" element={<VideoHistory />} />

            {/* Admin surface — server-side already locks /api/v1/admin/**
                behind hasRole("ADMIN"). Frontend mirrors that gate here so
                a non-admin gets redirected back to /dashboard instead of
                seeing an empty / broken admin shell. */}
            <Route
              path="/admin/*"
              element={
                !isAuthenticated
                  ? <Navigate to="/login" replace />
                  : <AdminApp />
              }
            />

            {/* Catch-all — also requires auth, so an unknown URL
                bounces an anonymous user back to /login and lets an
                authenticated user fall through to the dashboard. */}
            <Route
              path="/*"
              element={<Navigate to="/dashboard" replace />}
            />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default App;
