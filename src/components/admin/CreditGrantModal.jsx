import { useState, useEffect, useRef } from "react";
import { X, Coins, Loader2, AlertTriangle } from "lucide-react";
import { grantCredit } from "../../services/admin";
import { formatVND } from "../../utils/format";

/**
 * Modal form để admin cộng credit cho 1 user. Submit → POST
 * /api/v1/admin/users/{id}/credit. Parent reloads user list on success.
 *
 * Validation client-side để giảm round-trip vô ích:
 *   - amount 0.01..1,000,000,000
 *   - note bắt buộc, max 500 ký tự
 *
 * Server-side validation vẫn được áp dụng (Bean Validation) — đây chỉ
 * là UX hint.
 */
export default function CreditGrantModal({ user, onClose, onSuccess }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Lock body scroll while modal is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!user) return null;

  const amountNum = amount === "" ? NaN : Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum >= 0.01 && amountNum <= 1_000_000_000;
  const noteValid = note.trim().length > 0 && note.length <= 500;
  const formValid = amountValid && noteValid && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValid) return;
    setSubmitting(true);
    setError("");
    try {
      await grantCredit(user.id, { amount: amountNum, note: note.trim() });
      onSuccess?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Không thể cộng credit.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold text-slate-100">Cộng credit</h2>
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
            <span className="ml-2 text-amber-300">
              (hiện có: {formatVND(user.creditBalance)})
            </span>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1.5">
              Số credit <span className="text-rose-400">*</span>
            </label>
            <input
              ref={inputRef}
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="vd: 50000"
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              required
            />
            {amount !== "" && !amountValid && (
              <p className="mt-1 text-xs text-rose-400">
                Số credit phải nằm trong khoảng 0.01 – 1,000,000,000.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1.5">
              Lý do / ghi chú <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="vd: Refund do lỗi upload..."
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              required
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className={noteValid || note.length === 0 ? "text-slate-500" : "text-rose-400"}>
                {note.length === 0 ? "Bắt buộc — sẽ vào audit log." : ""}
              </span>
              <span className="text-slate-500">{note.length}/500</span>
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
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Cộng credit</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}