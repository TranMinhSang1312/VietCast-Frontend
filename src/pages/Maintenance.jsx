import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Wrench, Shield, Clock, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react";
import { getSystemStatus } from "../services/system";
import { useAuth } from "../contexts/AuthContext";

export default function Maintenance() {
  const [status, setStatus] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const fetchStatus = async () => {
    try {
      setIsChecking(true);
      const data = await getSystemStatus();
      setStatus(data);
      // If maintenance is turned off and user visits, redirect to app
      if (!data.maintenance) {
        if (isAuthenticated) {
          navigate(user?.role === "ADMIN" ? "/admin" : "/dashboard", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      }
    } catch (err) {
      console.warn("Could not check maintenance status:", err);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-poll every 12 seconds to auto-recover when admin finishes maintenance
    const timer = setInterval(fetchStatus, 12000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-[100dvh] w-full bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden text-slate-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-amber-500/10 via-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-xl mx-auto text-center flex flex-col items-center">
        {/* Animated Status Icon */}
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-amber-500/20 rounded-3xl blur-xl animate-pulse" />
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-slate-900/90 border border-amber-500/30 flex items-center justify-center shadow-2xl shadow-amber-500/20 backdrop-blur-xl">
            <Wrench className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 animate-bounce duration-1000" />
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-slate-950 animate-ping" />
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-slate-950" />
          </div>
        </div>

        {/* Brand Tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-4">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>Hệ Thống Đang Bảo Trì Nâng Cấp</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
          VietCast Tạm Thời Bảo Trì
        </h1>

        {/* Message */}
        <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-md mx-auto mb-6">
          {status?.message || "Chúng tôi đang tiến hành nâng cấp cụm máy chủ và tối ưu hóa hệ thống để mang lại trải nghiệm tốt nhất. Mọi dịch vụ sẽ sớm hoạt động trở lại."}
        </p>

        {/* Estimated Time Card (if available) */}
        {status?.estimatedEndTime && (
          <div className="w-full max-w-md bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 mb-6 backdrop-blur-md flex items-center justify-center gap-3 text-sm text-slate-300 shadow-lg">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              Dự kiến hoàn tất: <strong className="text-amber-300 font-semibold">{status.estimatedEndTime}</strong>
            </span>
          </div>
        )}

        {/* Auto Refresh Status Pill */}
        <div className="flex items-center gap-3 mb-8">
          <button
            type="button"
            onClick={fetchStatus}
            disabled={isChecking}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-slate-300 transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin text-amber-400" : ""}`} />
            <span>Kiểm tra lại trạng thái</span>
          </button>
        </div>

        {/* Admin Access Section */}
        <div className="w-full max-w-md pt-6 border-t border-slate-800/60 flex flex-col items-center gap-3">
          {isAuthenticated && user?.role === "ADMIN" ? (
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/30 active:scale-95"
            >
              <Shield className="w-4 h-4" />
              <span>Truy cập Trang Quản Trị (Admin)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dành cho Quản trị viên: Đăng nhập quản trị</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
