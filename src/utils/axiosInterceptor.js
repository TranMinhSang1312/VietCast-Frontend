// ---------------------------------------------------------------------------
// axiosInterceptor.js
//
// Centralised axios setup for the renderer. Importing this file has the
// side-effect of attaching two interceptors to the SHARED axios instance
// (the default one):
//
//   1. REQUEST interceptor
//      Reads the JWT from localStorage (key: 'vietcast_token') and sets
//      `Authorization: Bearer <token>` on every outgoing request. Plain
//      string match, no expiry checking — the backend authoritatively
//      rejects expired tokens with 401 and the auth-gate then routes
//      the user to /login.
//
//   2. RESPONSE interceptor
//      Wraps every rejection in a normalised ApiError (Vietnamese
//      message + status + machine-readable code). Components can
//      continue to `setError(err.message)`; the error message is now
//      always user-safe.
//
// Why a separate file?
//   - It makes the side-effect explicit: import it once from main.jsx
//     and you're done. The previous in-config.js setup duplicated logic
//     and made it unclear which file owned auth-header behaviour.
//   - It keeps axios concerns out of the React tree, so non-React code
//     (services that build URLs from raw config, etc.) gets the same
//     treatment without depending on a Provider.
//
// Adding NEW interceptors:
//   - Request  → append a new `axios.interceptors.request.use(...)`
//                 block; ordering matters (Bearer-token interceptor
//                 runs first so the header exists by the time a retry
//                 interceptor would observe it).
//   - Response → NEVER swallow an error silently. Always rewrap with
//                 `ApiError` so legacy `err.message` and new
//                 `err.code` accessors both work.
// ---------------------------------------------------------------------------

import axios from "axios";
import { handleApiError, ApiError } from "./apiError";

// The key used in localStorage MUST match the one used by AuthContext
// and VideoDashboard. Changing it here without changing them both will
// silently break every authenticated request.
const TOKEN_KEY = "vietcast_token";

// Allow callers (especially OAuth callbacks) to temporarily suppress
// the Authorization header for a single request. e.g.:
//   axios.post('/login', body, { skipAuth: true })
//
// We do this by reading a marker from the config object — axios does
// not have a native "auth-disable" flag and adding real network code
// per request would defeat the point of this module.
function isAuthSkipped(config) {
  return Boolean(config && config.skipAuth);
}

// ---------------------------------------------------------------------------
// Request interceptor — Bearer-token injection
// ---------------------------------------------------------------------------
//
// Attached FIRST so any subsequent interceptor (e.g. a future retry
// layer) sees the header already populated.
axios.interceptors.request.use(
  (config) => {
    if (isAuthSkipped(config)) {
      // Make sure stale tokens from a previous call do NOT leak into
      // a request that explicitly opted out (e.g. /auth/login).
      if (config.headers) {
        delete config.headers.Authorization;
      }
      return config;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      // `config.headers` is always defined for an axios request but
      // it can be an AxiosHeaders instance (axios ≥ 1.x) — the
      // `set()` API is the safe way to mutate it.
      if (config.headers && typeof config.headers.set === "function") {
        config.headers.set("Authorization", `Bearer ${token}`);
      } else if (config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor — error normalisation
// ---------------------------------------------------------------------------
//
// The existing apiError.js utility already does all the heavy lifting
// (server-message extraction, status→Vietnamese fallback, stack-trace
// guard). Here we just wrap the rejection so components can use
// `err.message` AND `err.status` / `err.code` uniformly.
//
// We intentionally do NOT delete the global Authorization header on 401.
// The decision to log the user out lives in AuthContext.refreshProfile,
// which has the full picture (multiple tabs, in-flight requests, etc.).
// Auto-clearing here was the source of bug C-3 in the security review:
// a single 401 from a misconfigured endpoint would lock the user out
// even though their session was valid for every other route.
axios.interceptors.response.use(
  (response) => response,
  (err) => {
    const processed = handleApiError(err);
    return Promise.reject(new ApiError(processed));
  }
);

// ---------------------------------------------------------------------------
// Convenience helpers — modules can import these instead of always
// reaching for the global axios. They forward the exact same instance
// so the interceptors still run.
// ---------------------------------------------------------------------------

/** Pre-configured axios instance with both interceptors attached. */
export const api = axios;

/**
 * Currently-cached JWT, or null if the user is anonymous. Cheap to
 * call — just reads from localStorage. Use this when the component
 * needs the raw token string (e.g. to build a WebSocket connection).
 */
export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Imperatively clear the cached JWT and the axios default header.
 * Useful for code paths that don't go through AuthContext (e.g. a
 * 401-triggered auto-logout in a non-React module).
 */
export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  if (axios.defaults.headers.common) {
    delete axios.defaults.headers.common.Authorization;
  }
}

/**
 * Imperatively set the JWT and sync the axios default header. Used
 * by AuthContext.login and AuthContext.googleLogin so a freshly-issued
 * token is visible to bare-axios call sites immediately, without
 * waiting for the request interceptor to fire on the next call.
 */
export function setAuthToken(token) {
  if (!token) {
    clearAuthToken();
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  if (axios.defaults.headers.common) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  }
}

export const AUTH_TOKEN_KEY = TOKEN_KEY;
