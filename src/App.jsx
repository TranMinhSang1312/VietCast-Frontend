import { Suspense, lazy, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import TopupModal from "./components/topup/TopupModal";
import { Wand2, History, LogOut, Coins, Loader2, Shield } from "lucide-react";

// Lazy-load the heavy tab contents so the initial bundle only ships the
// Login + nav chrome. Each tab is its own chunk that gets fetched the
// first time the user clicks the tab — measurable cold-start win on
// the first paint.
const VideoDashboard = lazy(() => import("./pages/VideoDashboard"));
const VideoHistory   = lazy(() => import("./pages/VideoHistory"));

// Admin surface is its own lazy chunk so a non-admin user never pays
// the bytes. Mounted only when user.role === "ADMIN" (see App below).
const AdminApp        = lazy(() => import("./pages/admin/AdminApp"));

// PayOS landing pages — small enough to inline but kept lazy for
// consistency with the rest of the chrome.
const PaymentSuccess  = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancel   = lazy(() => import("./pages/PaymentCancel"));

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

function AppContent() {
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard" | "history"
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100">
      <nav className="sticky top-0 z-10 backdrop-blur-xl bg-zinc-950/70 border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-300 mr-2">
                VietCast
              </span>
              <div className="inline-flex rounded-xl bg-slate-900/60 border border-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("dashboard")}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "dashboard"
                      ? "bg-brand-600 text-white shadow shadow-brand-500/30"
                      : "text-slate-300 hover:text-slate-100"
                  }`}
                >
                  <Wand2 className="w-4 h-4" />
                  <span>Lồng tiếng</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "history"
                      ? "bg-brand-600 text-white shadow shadow-brand-500/30"
                      : "text-slate-300 hover:text-slate-100"
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Lịch sử</span>
                </button>
              </div>
            </div>

            {/* User info & Logout */}
            <div className="flex items-center gap-4">
              {/* Admin shortcut — only visible for ROLE_ADMIN users. The
                  link uses a normal anchor (not a tab state) so it shares
                  the /admin route with React Router. Non-admins don't even
                  see the badge. */}
              {user?.role === "ADMIN" && (
                <a
                  href="/admin"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/20 transition"
                  title="Mở trang quản trị"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Quản trị</span>
                </a>
              )}
              {/* Credit balance + Topup trigger */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-slate-200">
                    {user?.creditBalance ?? 0} credit
                  </span>
                </div>
                {/* PayOS topup — opens the modal that POSTs to
                    /api/v1/payment/create and redirects to the
                    returned checkoutUrl. Visible to every
                    authenticated user (incl. ROLE_ADMIN — they pay
                    the merchant subscription themselves). */}
                <button
                  type="button"
                  onClick={() => setIsTopupOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-medium hover:bg-amber-500/20 transition"
                  title="Nạp thêm credit qua PayOS / VietQR"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Nạp tiền</span>
                </button>
              </div>

              {/* Username */}
              <div className="hidden sm:block text-sm text-slate-400">
                {user?.username}
              </div>

              {/* Logout button */}
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
        {activeTab === "dashboard" && <VideoDashboard />}
        {activeTab === "history" && <VideoHistory />}
      </Suspense>

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

          {/* Main dashboard — explicit route so post-login redirect
              has a real destination (instead of relying on the catch-
              all). Any authenticated user may land here. */}
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? <AppContent /> : <Navigate to="/login" replace />
            }
          />

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
              authenticated user fall through to the tabbed UI. */}
          <Route
            path="/*"
            element={
              isAuthenticated ? <AppContent /> : <Navigate to="/login" replace />
            }
          />
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default App;