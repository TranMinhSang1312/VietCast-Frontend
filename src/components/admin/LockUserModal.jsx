import { useState, useEffect, useRef } from "react";
import { X, Lock, Loader2, AlertTriangle } from "lucide-react";
import { lockUser } from "../../services/admin";

/**
 * Modal xác nhận khóa tài khoản. Yêu cầu nhập lý do (bắt buộc — sẽ lưu
 * vào User.lockedReason và audit row).
 *
 * Không có modal "Unlock" riêng — hành động unlock dùng inline confirm.
 */
export default function LockUserModal({ user, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!user) return null;

  const reasonValid = reason.trim().length > 0 && reason.length <= 500;
  const formValid = reasonValid && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValid) return;
    setSubmitting(true);
    setError("");
    try {
      await lockUser(user.id, { reason: reason.trim() });
      onSuccess?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Không thể khóa tài khoản.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-rose-800/60 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-semibold text-slate-100">Khóa tài khoản</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
            <span className="text-slate-400">User: </span>
            <span className="font-medium text-slate-100">{user.username || user.email}</span>
          </div>

          <div className="rounded-lg border border-rose-700/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
            User sẽ bị đăng xuất ngay lập tức (mọi request tiếp theo sẽ
            nhận 401). Lý do sẽ được lưu vào hồ sơ và audit log. Admin
            không thể tự khóa chính mình.
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1.5">
              Lý do <span className="text-rose-400">*</span>
            </label>
            <textarea
              ref={inputRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="vd: Chargeback pending, vi phạm điều khoản..."
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              required
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-slate-500">Bắt buộc — sẽ vào audit log.</span>
              <span className="text-slate-500">{reason.length}/500</span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-700/40 bg-rose-900/30 px-3 py-2 text-sm text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!formValid}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Khóa tài khoản</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}