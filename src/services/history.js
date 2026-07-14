import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

/**
 * Thin axios wrapper around the user-facing history endpoints.
 *
 * Single source of truth for any component that wants to read or write
 * a row in the {@code usage_logs} table. Lives in {@code src/services/}
 * (not next to the React pages) so a future mobile / desktop surface
 * can re-use the same call sites.
 *
 * Auth is handled automatically by the global request interceptor in config.js
 * which attaches the JWT token from localStorage to every axios request.
 */

const TOKEN_KEY = "vietcast_token";

let cachedBaseUrl = null;
async function baseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl;
  const cfg = await API_BASE_URL_PROVIDER.load().catch(() => null);
  cachedBaseUrl = cfg?.apiBaseUrl || API_BASE_URL_PROVIDER.sync;
  return cachedBaseUrl;
}

/**
 * Persist a usage_logs row after the React/Electron side observes the
 * pipeline terminate. Idempotent on {@code taskId} — the backend returns
 * the existing row unchanged when called twice with the same id, so a
 * retried POST after a transient blip never creates duplicates.
 *
 * Returns the persisted row (or null on failure) so callers can update
 * their local state without re-fetching the full history list.
 *
 * On 403 (forbidden/no token), redirects to login screen.
 *
 * @param {object} row
 * @param {string} row.taskId
 * @param {string} [row.url]
 * @param {string} [row.audioMode]
 * @param {string} row.status       "COMPLETED" | "FAILED"
 * @param {number} [row.exitCode]
 * @param {string} [row.note]
 */
export async function recordUsageLog(row) {
  if (!row || !row.taskId) {
    console.warn("[history] recordUsageLog called without taskId; skipping");
    return null;
  }

  // No auth token → bounce to login. We can do this synchronously since
  // the request interceptor in config.js only attaches the token IF one
  // is present — the server will then 401/403 and we would just loop.
  if (!localStorage.getItem(TOKEN_KEY)) {
    console.warn("[history] No auth token found, redirecting to login...");
    window.location.hash = "#/login";
    window.location.reload();
    return null;
  }

  try {
    const base = await baseUrl();
    // Auth header is attached automatically by global interceptor in config.js
    const { data } = await axios.post(
      `${base}/api/v1/usage-logs`,
      {
        taskId: row.taskId,
        url: row.url,
        audioMode: row.audioMode,
        status: row.status,
        exitCode: row.exitCode,
        note: row.note,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );
    return data;
  } catch (err) {
    const status = err?.response?.status || err?.status;
    const code = err?.response?.data?.code || err?.code;
    if (status === 403 || status === 401) {
      console.warn("[history] auth rejected, redirecting to login...");
      window.location.hash = "#/login";
      window.location.reload();
    } else if (status === 402 || code === "INSUFFICIENT_CREDIT") {
      // Backend rejected the audit row because the user is out of credit.
      // Surface a dedicated flag so the caller (e.g. VideoDashboard) can
      // refresh the cached balance and show a top-up CTA. We deliberately
      // do NOT throw — the local video file is still viewable; only the
      // cloud-side ledger needs a follow-up top-up.
      console.warn("[history] recordUsageLog rejected: insufficient credit");
      err.__insufficientCredit = true;
    }
    // Network blip or backend cold-start. Do NOT throw — the user's
    // view of the video is what matters; the history row can be back-
    // filled on the next pipeline run via the backend worker's own
    // recordUsageLog path.
    console.error("[history] recordUsageLog failed:", err?.message || err);
    return null;
  }
}