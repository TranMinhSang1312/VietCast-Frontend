// ---------------------------------------------------------------------------
// services/auth.js
//
// Thin auth API. Every function returns the parsed JSON body of the
// successful response (NOT the axios wrapper) so callers can do:
//
//   const me = await authApi.me();
//   console.log(me.username);
//
// Failures throw — the response interceptor in `utils/axiosInterceptor.js`
// has already wrapped them as `ApiError` instances carrying a Vietnamese
// `.message`, `.status`, and `.code`. The auth-specific catch blocks in
// Login.jsx therefore just read `err.message`.
//
// Why a service module instead of inline axios calls?
//   - Single source of truth for endpoint URLs. If we add a staging
//     prefix or a feature flag later, it changes here and the UI keeps
//     shipping the old URLs untouched.
//   - Easier unit testing: import this module from a test, mock `api`,
//     assert the right URL was hit.
//   - Login + register calls go through the axios request interceptor
//     too, which is why we mark them `skipAuth: true` — otherwise the
//     request interceptor would happily stamp a stale bearer header on
//     a request that does not want one (and the backend would 401 with
//     a confusing "Authentication required" message).
// ---------------------------------------------------------------------------

import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;

// ---------------------------------------------------------------------------
// Endpoints — the v1 path names mirror the Spring controllers exactly
// so a typo in one place is easy to grep for in the backend too.
// ---------------------------------------------------------------------------
const ENDPOINTS = Object.freeze({
  login:       `${API_BASE_URL}/api/v1/auth/login`,
  google:      `${API_BASE_URL}/api/v1/auth/google`,
  me:          `${API_BASE_URL}/api/v1/auth/me`,
  // Legacy endpoints we keep calling until the desktop client ships
  // the v1 release — the user-gate logic in App.jsx still references
  // them.
  legacyLogin: `${API_BASE_URL}/api/auth/login`,
  legacyMe:    `${API_BASE_URL}/api/auth/me`,
});

/**
 * Email / username + password login.
 *
 * @param {{ emailOrUsername: string, password: string }} body
 * @returns {Promise<AuthResponseBody>}
 */
export async function login({ emailOrUsername, password }) {
  const { data } = await axios.post(
    ENDPOINTS.login,
    { emailOrUsername, password },
    { skipAuth: true }   // the public /login route — no bearer header
  );
  return data;
}

/**
 * Google Sign-In. Caller passes the raw idToken straight from
 * `useGoogleLogin`'s `credentialResponse.credential`.
 *
 * @param {{ idToken: string }} body
 * @returns {Promise<AuthResponseBody>}
 */
export async function loginWithGoogle({ idToken }) {
  const { data } = await axios.post(
    ENDPOINTS.google,
    { idToken },
    { skipAuth: true }   // the public /google route
  );
  return data;
}

/**
 * Authoritative server-side profile refresh.
 *
 * @returns {Promise<UserSummary>}
 */
export async function fetchProfile() {
  const { data } = await axios.get(ENDPOINTS.me);
  return data;
}
