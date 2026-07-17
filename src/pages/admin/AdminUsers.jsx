import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Coins,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { fetchAdminUsers, unlockUser } from "../../services/admin";
import { useAuth } from "../../contexts/AuthContext";
import { formatNumber, formatRelative } from "../../utils/format";
import CreditGrantModal from "../../components/admin/CreditGrantModal";
import LockUserModal from "../../components/admin/LockUserModal";

/**
 * Trang quản lý người dùng cho admin. Hỗ trợ:
 *   - Tìm kiếm theo username (debounce 300ms)
 *   - Phân trang
 *   - Cộng credit (mở modal nhập amount + note)
 *   - Khóa / mở khóa tài khoản (mở modal hoặc inline confirm)
 *
 * Backend clamp page size 1..100 và search string 100 ký tự.
 */
export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionInFlight, setActionInFlight] = useState(null); // userId đang xử lý
  const [creditTarget, setCreditTarget] = useState(null);
  const [lockTarget, setLockTarget] = useState(null);
  const [unlockConfirm, setUnlockConfirm] = useState(null);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }
  const debounceRef = useRef(null);

  // Debounce search input → committed search string.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (type, message) => setToast({ type, message });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminUsers({ page, size: pageSize, q: search });
      setUsers(data.content || []);
      setTotalElements(data.totalElements || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      setError(err?.message || "Không tải được danh sách người dùng.");
      setUsers([]);
      setTotalElements(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { load(); }, [load]);

  // ----- Action handlers -----

  const handleCreditSuccess = async (msg) => {
    setCreditTarget(null);
    showToast("success", msg);
    await load();
  };
  const handleLockSuccess = async (msg) => {
    setLockTarget(null);
    showToast("success", msg);
    await load();
  };
  const handleUnlock = async (user) => {
    setActionInFlight(user.id);
    try {
      await unlockUser(user.id);
      showToast("success", `Đã mở khóa ${user.username || user.email}.`);
      await load();
    } catch (err) {
      showToast("error", err?.response?.data?.message || err?.message || "Không thể mở khóa.");
    } finally {
      setActionInFlight(null);
      setUnlockConfirm(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Quản lý người dùng</h1>
          <p className="text-sm text-slate-400 mt-1">
            {loading ? "Đang tải…" : `${formatNumber(totalElements)} tài khoản`}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/80 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Làm mới</span>
        </button>
      </header>

      <section className="rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4 sm:p-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo username..."
            className="w-full rounded-lg border border-white/[0.06] bg-slate-900/70 pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
            maxLength={100}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-rose-700/40 bg-rose-900/30 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Trạng thái</th>
                <th className="py-2 pr-4 text-right">Credit</th>
                <th className="py-2 pr-4">Ngày tạo</th>
                <th className="py-2 pr-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang tải…
                    </span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Không có kết quả.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  const isLocked = !!u.isLocked;
                  const actionBusy = actionInFlight === u.id;
                  return (
                    <tr
                      key={u.id}
                      className={`border-b border-slate-800/60 ${
                        isLocked ? "bg-rose-950/20" : "hover:bg-slate-900/30"
                      }`}
                    >
                      <td className="py-2.5 pr-4 text-slate-100 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{u.username || "—"}</span>
                          {isSelf && (
                            <span className="text-[10px] uppercase tracking-wider rounded bg-violet-500/10 border border-violet-500/30 px-1.5 py-0.5 text-violet-300">
                              Bạn
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-300">{u.email || "—"}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                            u.role === "ADMIN"
                              ? "bg-violet-500/10 text-violet-300 border border-violet-500/30"
                              : "bg-slate-700/40 text-slate-300 border border-slate-600/40"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {isLocked ? (
                          <span
                            title={u.lockedReason || "Đã bị khóa"}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30"
                          >
                            <Lock className="w-3 h-3" />
                            Đã khóa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            Hoạt động
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-yellow-300">
                        {formatNumber(u.creditBalance)}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-400">{formatRelative(u.createdAt)}</td>
                      <td className="py-2.5 pr-4">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setCreditTarget(u)}
                            disabled={actionBusy}
                            className="inline-flex items-center gap-1 rounded-md border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 text-xs text-yellow-200 hover:bg-yellow-400/20 transition disabled:opacity-40"
                            title="Cộng credit"
                          >
                            <Coins className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Cộng credit</span>
                          </button>
                          {isLocked ? (
                            <button
                              type="button"
                              onClick={() => setUnlockConfirm(u)}
                              disabled={actionBusy}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 transition disabled:opacity-40"
                              title="Mở khóa"
                            >
                              {actionBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5" />
                              )}
                              <span className="hidden sm:inline">Mở khóa</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setLockTarget(u)}
                              disabled={actionBusy || isSelf}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                              title={isSelf ? "Không thể tự khóa mình" : "Khóa tài khoản"}
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Khóa</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-400">
              Trang {page + 1} / {totalPages}
            </div>
            <div className="inline-flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-slate-900/60 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800/80 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                Trước
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-slate-900/60 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800/80 transition"
              >
                Sau
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm shadow-lg flex items-center gap-2 ${
            toast.type === "success"
              ? "border-emerald-700/50 bg-emerald-900/60 text-emerald-100"
              : "border-rose-700/50 bg-rose-900/60 text-rose-100"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Modals */}
      {creditTarget && (
        <CreditGrantModal
          user={creditTarget}
          onClose={() => setCreditTarget(null)}
          onSuccess={() =>
            handleCreditSuccess(`Đã cộng credit cho ${creditTarget.username || creditTarget.email}.`)
          }
        />
      )}
      {lockTarget && (
        <LockUserModal
          user={lockTarget}
          onClose={() => setLockTarget(null)}
          onSuccess={() =>
            handleLockSuccess(`Đã khóa ${lockTarget.username || lockTarget.email}.`)
          }
        />
      )}

      {/* Inline unlock confirm */}
      {unlockConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setUnlockConfirm(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-slate-900 shadow-2xl">
            <div className="px-5 py-4 space-y-3">
              <h2 className="text-base font-semibold text-slate-100">Mở khóa tài khoản?</h2>
              <p className="text-sm text-slate-300">
                <span className="font-medium">{unlockConfirm.username || unlockConfirm.email}</span>{" "}
                sẽ có thể đăng nhập lại ngay lập tức.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUnlockConfirm(null)}
                  disabled={actionInFlight !== null}
                  className="rounded-lg border border-white/[0.06] bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition disabled:opacity-40"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => handleUnlock(unlockConfirm)}
                  disabled={actionInFlight !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition disabled:opacity-40"
                >
                  {actionInFlight !== null && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Mở khóa</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}