import { useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import VideoDashboard from "./pages/VideoDashboard";
import VideoHistory from "./pages/VideoHistory";
import VersionCheckModal from "./components/VersionCheckModal";
import { Wand2, History, LogOut, Coins } from "lucide-react";

function AppContent() {
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard" | "history"
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100">
      <nav className="sticky top-0 z-10 backdrop-blur-xl bg-slate-950/70 border-b border-slate-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
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
              {/* Credit balance */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-slate-200">
                  {user?.creditBalance ?? 0} credit
                </span>
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

      {activeTab === "dashboard" && <VideoDashboard />}
      {activeTab === "history" && <VideoHistory />}
    </div>
  );
}

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  // Forced update modal — rendered FIRST, OUTSIDE the auth gate, so
  // even unauthenticated users with an outdated build cannot bypass it.
  // The modal itself is non-dismissible when shown.
  return (
    <HashRouter>
      <VersionCheckModal />

      {/* Show loading spinner while checking auth */}
      {isLoading ? (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-950">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-sm">Đang tải...</span>
          </div>
        </div>
      ) : (
        <Routes>
          {/* Login page — accessible to unauthenticated users */}
          <Route path="/login" element={<Login />} />

          {/* Main dashboard — explicit route so post-login redirect
              has a real destination (instead of relying on the catch-
              all). Any authenticated user may land here. */}
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? <AppContent /> : <Navigate to="/login" replace />
            }
          />

          {/* Catch-all — also requires auth, so an unknown URL
              bounces an anonymous user back to /login and lets an
              authenticated user fall through to the tabbed UI. The
              admin surface is intentionally NOT mounted here —
              admins use a separate external app. */}
          <Route
            path="/*"
            element={
              isAuthenticated ? <AppContent /> : <Navigate to="/login" replace />
            }
          />
        </Routes>
      )}
    </HashRouter>
  );
}

export default App;