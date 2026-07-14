// ---------------------------------------------------------------------------
// services/admin.js
//
// Thin wrapper over the new admin endpoints. Mirrors the convention used by
// services/auth.js — every function returns the parsed JSON body so call
// sites can `const data = await fetchXxx()` instead of unpacking axios
// envelopes.
//
// All endpoints are gated by `hasRole("ADMIN")` server-side
// (SecurityConfig.requestMatchers("/api/v1/admin/**").hasRole("ADMIN")).
// The frontend ALSO gates by `user.role === "ADMIN"` in App.jsx so a non-
// admin never even fires these requests.
// ---------------------------------------------------------------------------

import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;

const ENDPOINTS = Object.freeze({
  stats:           `${API_BASE_URL}/api/v1/admin/dashboard/stats`,
  revenueSeries:   `${API_BASE_URL}/api/v1/admin/revenue-series`,
  userGrowth:      `${API_BASE_URL}/api/v1/admin/user-growth`,
  users:           `${API_BASE_URL}/api/v1/admin/users`,
  grantCredit:     (id) => `${API_BASE_URL}/api/v1/admin/users/${id}/credit`,
  lockUser:        (id) => `${API_BASE_URL}/api/v1/admin/users/${id}/lock`,
  unlockUser:      (id) => `${API_BASE_URL}/api/v1/admin/users/${id}/unlock`,
});

/**
 * Existing scalar KPI snapshot. Returns:
 *   { totalRevenue, totalUsers, totalVideosCompleted,
 *     newSignupsLast7Days, revenueByType, generatedAt }
 */
export async function fetchDashboardStats() {
  const { data } = await axios.get(ENDPOINTS.stats);
  return data;
}

/**
 * Time-series revenue payload for the "doanh thu" chart.
 * @param {{ granularity?: "DAY"|"MONTH"|"YEAR", periods?: number }} opts
 */
export async function fetchRevenueSeries({ granularity = "MONTH", periods = 12 } = {}) {
  const { data } = await axios.get(ENDPOINTS.revenueSeries, {
    params: { granularity, periods },
  });
  return data;
}

/**
 * Time-series user-growth payload for the "người dùng" chart.
 * @param {{ granularity?: "DAY"|"MONTH"|"YEAR", periods?: number }} opts
 */
export async function fetchUserGrowth({ granularity = "MONTH", periods = 12 } = {}) {
  const { data } = await axios.get(ENDPOINTS.userGrowth, {
    params: { granularity, periods },
  });
  return data;
}

/**
 * Paginated user list.
 * @param {{ page?: number, size?: number, q?: string }} opts
 */
export async function fetchAdminUsers({ page = 0, size = 20, q = "" } = {}) {
  const { data } = await axios.get(ENDPOINTS.users, {
    params: { page, size, q },
  });
  return data;
}

/**
 * Grant a positive credit balance to a user via the ADMIN_GRANT ledger.
 * @param {number} userId target user id
 * @param {{ amount: number|string, note: string }} body
 * @returns {Promise<object>} updated UserSummaryResponse
 */
export async function grantCredit(userId, { amount, note }) {
  const { data } = await axios.post(ENDPOINTS.grantCredit(userId), {
    amount,
    note,
  });
  return data;
}

/**
 * Soft-lock a user account. The JWT filter reloads the user from DB
 * on every request, so the lock takes effect on the target user's
 * next call without any token blacklist.
 * @param {number} userId
 * @param {{ reason: string }} body
 */
export async function lockUser(userId, { reason }) {
  const { data } = await axios.post(ENDPOINTS.lockUser(userId), { reason });
  return data;
}

/**
 * Reverse a {@link lockUser} call. Idempotent on the server.
 * @param {number} userId
 */
export async function unlockUser(userId) {
  const { data } = await axios.post(ENDPOINTS.unlockUser(userId));
  return data;
}
