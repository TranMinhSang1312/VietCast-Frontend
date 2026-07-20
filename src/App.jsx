import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Sidebar from "./components/layout/Sidebar";
import CreditPill from "./components/layout/CreditPill";
import TopupModal from "./components/topup/TopupModal";
import { LogOut, Loader2, Shield } from "lucide-react";

// Lazy-load the heavy tab contents so the initial bundle only ships the
// Login + nav chrome.
const VideoDashboard     = lazy(() => import("./pages/VideoDashboard"));
const VideoHistory       = lazy(() => import("./pages/VideoHistory"));

// Admin surface is its own lazy chunk so a non-admin user never pays
// the bytes. Mounted only when user.role === "ADMIN".
const AdminApp           = lazy(() => import("./pages/admin/AdminApp"));

// PayOS landing pages — small enough to inline but kept lazy.
const PaymentSuccess     = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancel      = lazy(() => import("./pages/PaymentCancel"));

const TopupHistory       = lazy(() => import("./pages/TopupHistory"));
const CreditUsageHistory = lazy(() => import("./pages/CreditUsageHistory"));
const Pricing            = lazy(() => import("./pages/Pricing"));
const LandingPage        = lazy(() => import("./pages/LandingPage"));

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

// Shell rendered for any authenticated user route. Each tab maps to its
// own URL so deep-linking, browser-back, and shared links all work.
function AppShell() {
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [topupPrefill, setTopupPrefill] = useState(null);
  const { user, logout, syncProfile } = useAuth();

  // Cross-component channel for opening the topup modal from inside
  // any tab (e.g. VideoDashboard's "Insufficient credit" warning).
  // We use a CustomEvent rather than a React Context because:
  //   - the dashboard tab is lazy-loaded, so a shared context would
  //     force-evaluate TopupModal's mount code on every navigation;
  //   - the dispatch is fire-and-forget — the modal does not need
  //     a synchronous response, so a DOM event is the right tool;
  //   - the prefill amount flows through `event.detail` so the modal
  //     can pre-fill the credit input on open.
  useEffect(() => {
    const onOpenTopup = (ev) => {
      const amount = ev?.detail?.prefillAmount;
      setTopupPrefill(typeof amount === "number" && amount > 0 ? amount : null);
      setIsTopupOpen(true);
    };
    window.addEventListener("vietcast:open-topup", onOpenTopup);
    return () => window.removeEventListener("vietcast:open-topup", onOpenTopup);
  }, []);

  // SIGNUP_BONUS pill: refresh the profile every 60s so an expired
  // bonus disappears within a minute of its deadline, even when the
  // user isn't navigating. Cheap call (one SELECT), and avoids
  // requiring a hard refresh on every page.
  useEffect(() => {
    const id = setInterval(() => {
      if (user?.bonusCreditBalance) {
        syncProfile();
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [user?.bonusCreditBalance, syncProfile]);

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex overflow-hidden">
      <Sidebar
        collapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((v) => !v)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top bar — slim and quiet. Only balance + topup + admin chip
            + username + logout live here. Navigation lives in the
            sidebar. The bar uses subtle white/[0.04] borders to stay
            consistent with the rest of the new design system. */}
        <header className="shrink-0 z-10 bg-slate-950/80 border-b border-white/[0.06] backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            {/* Mobile-only brand. */}
            <div className="md:hidden flex items-center gap-2 select-none">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4 text-white"
                  aria-hidden="true"
                >
                  <path d="M12 2 14.39 8.26 21 9.27l-5 4.87L17.18 21 12 17.77 6.82 21 8 14.14l-5-4.87 6.61-1.01L12 2Z" />
                </svg>
              </div>
              <span className="text-sm font-bold tracking-tight text-white">
                VietCast
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              {user?.role === "ADMIN" && (
                <LinkWrapped
                  to="/admin"
                  className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 transition"
                  title="Mở trang quản trị"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Quản trị</span>
                </LinkWrapped>
              )}

              {/* Credit balance + Topup trigger.
                  CreditPill renders the permanent balance, the live
                  SIGNUP_BONUS chip, and the bonus countdown in one
                  block so the user can see their total available
                  credit at a glance. */}
              <CreditPill user={user} onTopup={() => setIsTopupOpen(true)} />

              <div className="hidden md:flex items-center gap-2 pl-2 border-l border-white/[0.06]">
                <div className="hidden md:block text-sm text-slate-400 font-mono">
                  {user?.username}
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-white/[0.06] transition active:scale-[0.98]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Đăng xuất</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-slate-950">
          <Suspense fallback={<TabFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {isTopupOpen && (
        <TopupModal
          key={topupPrefill ?? "standard"}
          isOpen
          onClose={() => {
            setIsTopupOpen(false);
            setTopupPrefill(null);
          }}
          prefillAmount={topupPrefill}
        />
      )}
    </div>
  );
}

// Tiny inline shim so we can use className syntax with react-router
// Link without re-importing at the top of every block.
import { Link } from "react-router-dom";
function LinkWrapped({ to, children, className, title }) {
  return (
    <Link to={to} className={className} title={title}>
      {children}
    </Link>
  );
}

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <BrowserRouter>
      {isLoading ? (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-950">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-sm">Đang tải...</span>
          </div>
        </div>
      ) : (
        <Routes>
          <Route
            path="/"
            element={
              isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />
            }
          />

          <Route path="/login" element={<Login />} />

          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/payment/cancel" element={<PaymentCancel />} />

          {/* Pricing is a public marketing page — anonymous visitors should
              see it without being bounced to /login. Authenticated users
              also land here (it's the same component either way). */}
          <Route path="/pricing" element={<Pricing />} />

          <Route
            element={
              isAuthenticated ? <AppShell /> : <Navigate to="/login" replace />
            }
          >
            <Route path="/dashboard"     element={<VideoDashboard />} />
            <Route path="/video-history" element={<VideoHistory />} />
            <Route path="/topup-history" element={<TopupHistory />} />
            <Route path="/credit-usage"  element={<CreditUsageHistory />} />

            <Route
              path="/admin/*"
              element={
                !isAuthenticated
                  ? <Navigate to="/login" replace />
                  : <AdminApp />
              }
            />

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
