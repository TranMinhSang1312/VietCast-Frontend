import { ChevronLeft, ChevronRight } from "lucide-react";

function pageWindow(current, total) {
  const start = Math.max(0, Math.min(current - 2, total - 5));
  return Array.from({ length: Math.min(5, total) }, (_, index) => start + index);
}

export default function PaginationControls({ page, totalPages, totalItems, onChange, disabled }) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(page, totalPages);
  return (
    <nav
      aria-label="Phân trang lịch sử"
      className="mt-6 flex w-full items-center justify-between gap-2 border-t border-white/[0.06] pt-4 select-none"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={disabled || page === 0}
        aria-label="Trang trước"
        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden min-[380px]:inline">Trước</span>
      </button>

      <div className="hidden items-center gap-1 sm:flex">
        {pages.map((number) => (
          <button
            type="button"
            key={number}
            onClick={() => onChange(number)}
            disabled={disabled}
            aria-current={number === page ? "page" : undefined}
            aria-label={`Trang ${number + 1}`}
            className={`h-10 min-w-10 rounded-lg border px-2 text-sm font-medium transition ${
              number === page
                ? "border-indigo-400/40 bg-indigo-500/20 text-white"
                : "border-transparent text-slate-400 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            {number + 1}
          </button>
        ))}
      </div>

      <div className="text-center text-xs text-slate-400 sm:hidden">
        <span className="font-semibold text-slate-200">{page + 1}</span> / {totalPages}
        {Number.isFinite(totalItems) && <span className="block text-[10px] text-slate-500">{totalItems} mục</span>}
      </div>

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages - 1}
        aria-label="Trang sau"
        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <span className="hidden min-[380px]:inline">Sau</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
