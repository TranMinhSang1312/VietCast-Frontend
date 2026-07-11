import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

/**
 * Thin axios wrapper around the user-facing history endpoints.
 *
 * Single source of truth for any component that wants to read or write
 * a row in the {@code usage_logs} table. Lives in {@code src/services/}
 * (not next to the React pages) so a future mobile / desktop surface
 * can re-use the same call sites.
 */

let cachedBaseUrl = null;
async function baseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl;
  const cfg = await API_BASE_URL_PROVIDER.load().catch(() => null);
  cachedBaseUrl = cfg?.apiBaseUrl || API_BASE_URL_PROVIDER.sync;
  return cachedBaseUrl;
}

/**
 * Fetch the authenticated user's history (newest-first), restricted to
 * rows in {@code usage_logs} owned by the JWT subject. Returns an empty
 * array on network failure so the caller can keep the previous list
 * visible — the error itself is logged here for diagnostics.
 */
export async function fetchHistory() {
  try {
    const base = await baseUrl();
    const { data } = await axios.get(`${base}/api/v1/history`, { timeout: 10000 });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[history] fetch failed:", err?.message || err);
    return [];
  }
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
  try {
    const base = await baseUrl();
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
      { headers: { "Content-Type": "application/json" }, timeout: 10000 },
    );
    return data;
  } catch (err) {
    // Network blip or backend cold-start. Do NOT throw — the user's
    // view of the video is what matters; the history row can be back-
    // filled on the next pipeline run via the backend worker's own
    // recordUsageLog path.
    console.error("[history] recordUsageLog failed:", err?.message || err);
    return null;
  }
}
