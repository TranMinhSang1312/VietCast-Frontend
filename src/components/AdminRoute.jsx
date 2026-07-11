import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ShieldAlert, Loader2 } from "lucide-react";

/**
 * Route guard for admin-only pages (mounted at {@code /admin-secret/...}).
 *
 * <p>Behaviour matrix:
 * <table>
 *   <tr><th>State</th><th>Result</th></tr>
 *   <tr><td>isLoading=true</td>     <td>Spinner (prevents flicker)</td></tr>
 *   <tr><td>!isAuthenticated</td>  <td>Redirect → /login (state.from preserved)</td></tr>
 *   <tr><td>role !== "ADMIN"</td>  <td>Render "forbidden" panel with link back to /</td></tr>
 *   <tr><td>role === "ADMIN"</td>  <td>Render {@code children}</td></tr>
 * </table>
 *
 * <p>Why a local "forbidden" panel instead of redirect-to-/? Because the
 * admin URL is hidden (no nav-link points at /admin-secret), so a
 * silent redirect would leave the legitimate admin wondering why the
 * page is blank. Showing "you are not authorised" with a return link is
 * far less confusing.
 */
export default function AdminRoute({ children }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          <span className="text-slate-400 text-sm">Đang kiểm tra quyền truy cập…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-rose-500/30 p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 mb-4">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
          </div>
          <h1 className="text-lg font-semibold mb-1">Không có quyền truy cập</h1>
          <p className="text-sm text-slate-400 mb-5">
            Tài khoản của bạn không có quyền <span className="font-mono text-rose-300">ROLE_ADMIN</span>.
            Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition"
          >
            Quay lại trang chính
          </a>
        </div>
      </div>
    );
  }

  return children;
}