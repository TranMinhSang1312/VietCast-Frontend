// Design tokens used across workspace pages, modals, and the admin
// surface. Centralised here so the color story stays consistent and a
// future redesign flips one file, not fifteen.
//
// Color story (from Pricing/LandingPage and the color-psychology brief):
//   - Surface base : slate-950 (deep midnight, reduces eye strain)
//   - Brand accent : indigo-500/600 (the "High-Tech AI" tone)
//   - Action (CTA): emerald-400 (high contrast, conversion primary)
//   - Hook / Bonus: yellow-400 (used sparingly, for free-bonus anchors)
//   - Danger      : rose-500 (kept; not part of the redesign palette)

// Background tones
export const PAGE_BG = "min-h-screen w-full bg-slate-950 text-slate-100 font-sans";
export const PAGE_SHELL = "min-h-screen w-full bg-slate-950 text-slate-100 font-sans relative overflow-hidden";

// Ambient glow recipes. Two per page so the studio feel stays consistent.
export const AMBIENT_INDIGO_TOPRIGHT =
  "absolute top-[-20%] right-[-15%] w-[720px] h-[720px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none";
export const AMBIENT_VIOLET_BOTTOMLEFT =
  "absolute bottom-[-25%] left-[-15%] w-[520px] h-[520px] bg-violet-600/8 rounded-full blur-[140px] pointer-events-none";
export const AMBIENT_RADIAL_TOP =
  "absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.06),transparent_55%)] pointer-events-none";

// Surface tokens. Higher tier = more visible + accent border.
export const SURFACE =
  "rounded-3xl border border-white/[0.06] bg-white/[0.025] backdrop-blur-xl";
export const SURFACE_INDIGO =
  "rounded-3xl border border-indigo-400/20 bg-white/[0.04] backdrop-blur-2xl";
export const SURFACE_COMPACT =
  "rounded-2xl border border-white/[0.06] bg-white/[0.025] backdrop-blur-xl";

// CTA styles. Emerald is the primary action color across the app.
export const CTA_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] transition-transform duration-200 ease-out active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none";
export const CTA_PRIMARY_SMALL =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] transition-transform duration-200 ease-out active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none";
export const CTA_INDIGO =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-400 shadow-[0_18px_60px_-18px_rgba(99,102,241,0.55)] transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none";
export const CTA_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] px-6 py-3 text-sm font-semibold text-slate-200 transition active:scale-[0.98]";

// Yellow hook — used only for the "Miễn phí file SRT" / Bonus anchors.
export const HOOK_YELLOW_BADGE =
  "inline-flex items-center gap-1.5 rounded-full bg-yellow-400/10 border border-yellow-400/40 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-yellow-300";
export const HOOK_YELLOW_CARD =
  "rounded-2xl border border-yellow-400/30 bg-yellow-400/[0.06] px-4 py-3";

// Indigo accents for "tech" objects (cards, list items).
export const ACCENT_INDIGO_ICON =
  "w-11 h-11 rounded-2xl bg-indigo-500/15 ring-1 ring-indigo-400/30 flex items-center justify-center";
export const ACCENT_SOFT_ICON =
  "w-10 h-10 rounded-xl bg-slate-950 ring-1 ring-white/[0.08] flex items-center justify-center";

// Magnetic nudge. Pointer-driven translate on the primary CTA.
export function makeMagnetic(maxOffset = 6) {
  return {
    onPointerMove: (e) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * maxOffset;
      const y = ((e.clientY - r.top) / r.height - 0.5) * maxOffset;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    },
    onPointerLeave: (e) => {
      e.currentTarget.style.transform = "translate(0, 0)";
    },
  };
}
