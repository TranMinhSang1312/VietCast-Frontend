// ---------------------------------------------------------------------------
// utils/format.js
//
// Lightweight formatting helpers used across the admin dashboard. Kept in
// a single module so the whole admin surface stays consistent.
// ---------------------------------------------------------------------------

/**
 * Format a numeric value as Vietnamese đồng (VND).
 * Falls back to "0 ₫" for nullish / non-finite values.
 */
export function formatVND(value) {
  if (value == null || !Number.isFinite(Number(value))) return "0 ₫";
  const num = Number(value);
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format a number with thousands separators (no currency symbol).
 */
export function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return "0";
  return new Intl.NumberFormat("vi-VN").format(Number(value));
}

/**
 * Format an ISO-ish timestamp string into a short vi-VN relative label
 * ("vài giây trước", "5 phút trước", "2 giờ trước", "10/07/2026 09:15").
 * Accepts anything `new Date(...)` understands, plus epoch-ms numbers.
 */
export function formatRelative(input) {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "vài giây trước";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return d.toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Format a credit amount with thousands separators and a fixed 0-fraction
 * digit. Falls back to "0" for nullish / non-finite values.
 */
export function formatCredit(value) {
  if (value == null || !Number.isFinite(Number(value))) return "0";
  const num = Number(value);
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Human-readable countdown between two instants. Used by the SIGNUP_BONUS
 * banner in the workspace header so the user can see exactly how much
 * time is left on their time-limited welcome reward.
 *
 * <p>Returns null when the deadline has already passed (caller should
 * treat null as "no live bonus").
 *
 * @param {string|Date|null|undefined} deadline
 * @returns {string|null}
 */
export function formatCountdown(deadline) {
  if (!deadline) return null;
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return null;

  const totalMin = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;

  if (days >= 1) {
    return `${days} ngày ${hours} giờ`;
  }
  if (hours >= 1) {
    return `${hours} giờ ${minutes} phút`;
  }
  return `${Math.max(1, minutes)} phút`;
}

/**
 * Stable colour palette for up to N series in chart legends. Used by the
 * recharts wrappers below so a 5-type revenue chart always renders with
 * the same colours per type across reloads.
 */
export const CHART_COLORS = Object.freeze([
  "#22d3ee", // cyan-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#f472b6", // pink-400
  "#a78bfa", // violet-400
  "#fb7185", // rose-400
]);
