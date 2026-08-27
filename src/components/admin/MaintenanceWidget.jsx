import { useState, useEffect } from "react";
import { Wrench, AlertTriangle, ShieldCheck, Clock, Check, X, Loader2 } from "lucide-react";
import { getAdminMaintenanceStatus, setAdminMaintenanceMode } from "../../services/system";

export default function MaintenanceWidget({ onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [targetEnabled, setTargetEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [estimatedEndTime, setEstimatedEndTime] = useState("");
  const [error, setError] = useState("");

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await getAdminMaintenanceStatus();
      setStatus(data);
      setMessage(data.message || "Hệ thống đang được bảo trì để nâng cấp tính năng. Xin vui lòng quay lại sau.");
      setEstimatedEndTime(data.estimatedEndTime || "");
    } catch (err) {
      console.error("Failed to load maintenance status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const openToggleModal = (enable) => {
    setTargetEnabled(enable);
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    setUpdating(true);
    setError("");
    try {
      const res = await setAdminMaintenanceMode({
        enabled: targetEnabled,
        message: message.trim(),
        estimatedEndTime: estimatedEndTime.trim(),
      });
      setStatus(res);
      setModalOpen(false);
      if (onStatusChange) onStatusChange(res);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Không thể cập nhật trạng thái bảo trì.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-slate-900/50 p-4 animate-pulse h-20" />
    );
  }

  const isMaint = Boolean(status?.maintenance);

  return (
    <>
      <div className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all ${
        isMaint
          ? "border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-slate-900/70 to-slate-900/60 shadow-lg shadow-amber-500/10"
          : "border-emerald-500/20 bg-slate-900/50 hover:border-emerald-500/30"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
              isMaint
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-lg shadow-amber-500/20"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}>
              {isMaint ? (
                <Wrench className="w-5 h-5 animate-pulse" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">
                  Chế độ bảo trì hệ thống
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  isMaint
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse"
                    : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isMaint ? "bg-amber-400" : "bg-emerald-400"}`} />
                  {isMaint ? "Đang Bật (User bị khóa)" : "Đang Tắt (Bình thường)"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                {isMaint
                  ? "Hệ thống đang chặn toàn bộ người dùng thông thường và chuyển hướng về trang bảo trì. Chỉ Admin mới có quyền truy cập."
                  : "Mọi người dùng đang truy cập và sử dụng dịch vụ bình thường. Bật chế độ này khi bạn cần nâng cấp hệ thống."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
            {isMaint ? (
              <button
                type="button"
                onClick={() => openToggleModal(false)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-600/20 active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Tắt bảo trì (Mở lại hệ thống)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openToggleModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600/90 hover:bg-amber-500 text-white font-semibold text-xs transition shadow-lg shadow-amber-600/20 active:scale-95"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Bật bảo trì hệ thống</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation & Config Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 text-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  targetEnabled ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
                }`}>
                  {targetEnabled ? <AlertTriangle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {targetEnabled ? "Xác nhận bật chế độ bảo trì" : "Xác nhận tắt chế độ bảo trì"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {targetEnabled
                      ? "Người dùng thông thường sẽ ngay lập tức bị chặn và chuyển hướng về trang bảo trì."
                      : "Hệ thống sẽ mở lại toàn bộ tính năng cho người dùng truy cập."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {error}
              </div>
            )}

            {targetEnabled && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Thông điệp hiển thị cho người dùng:
                  </label>
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Nhập lý do bảo trì..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Thời gian dự kiến hoàn tất (tùy chọn):</span>
                  </label>
                  <input
                    type="text"
                    value={estimatedEndTime}
                    onChange={(e) => setEstimatedEndTime(e.target.value)}
                    placeholder="Ví dụ: 02:30 sáng, 30 phút nữa..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={updating}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={updating}
                className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white transition shadow-lg ${
                  targetEnabled
                    ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/30"
                    : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                } disabled:opacity-50`}
              >
                {updating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang cập nhật...</span>
                  </>
                ) : (
                  <span>{targetEnabled ? "Xác nhận Bật bảo trì" : "Xác nhận Mở hệ thống"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
