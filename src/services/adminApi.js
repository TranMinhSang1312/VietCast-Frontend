import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

/**
 * Thin axios wrapper around the admin REST endpoints.
 *
 * <p>The base URL is resolved at first call via
 * {@code API_BASE_URL_PROVIDER.load()} so it picks up the runtime
 * config exposed by Electron (overriding the build-time
 * {@code VITE_API_BASE_URL} constant).
 *
 * <p>Axios defaults already carry the {@code Authorization} header set
 * by {@code AuthContext.login()}, so each request is automatically
 * authenticated. A 401/403 response is bubbled up — the route guard
 * decides whether to redirect to /login or to show "forbidden".
 */

let cachedBaseUrl = null;
async function baseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl;
  const cfg = await API_BASE_URL_PROVIDER.load().catch(() => null);
  // Order of preference: runtime config → vite constant → hardcoded production fallback.
  cachedBaseUrl = cfg?.apiBaseUrl || API_BASE_URL_PROVIDER.sync;
  return cachedBaseUrl;
}

/**
 * GET /api/v1/admin/dashboard/stats
 * @returns {Promise<DashboardStats>}
 *   { totalRevenue, totalUsers, totalVideosCompleted,
 *     newSignupsLast7Days, revenueByType, generatedAt }
 */
export async function fetchDashboardStats() {
  const base = await baseUrl();
  const { data } = await axios.get(`${base}/api/v1/admin/dashboard/stats`);
  return data;
}

/**
 * GET /api/v1/admin/users?page=0&size=20&q=
 * @param {{ page?: number, size?: number, q?: string }} opts
 * @returns {Promise<Page<UserSummary>>}
 */
export async function fetchAdminUsers(opts = {}) {
  const { page = 0, size = 20, q = "" } = opts;
  const base = await baseUrl();
  const { data } = await axios.get(`${base}/api/v1/admin/users`, {
    params: { page, size, q },
  });
  return data;
}