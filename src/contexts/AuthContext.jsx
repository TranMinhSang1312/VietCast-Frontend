import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
// Side-effect import: attaches the request/response interceptors to the
// shared axios instance (Bearer-token injection + error normalisation).
// Keep this import here — AuthContext is the first axios-touching code
// that runs at boot, so we want the interceptors up before any call.
import "../utils/axiosInterceptor";
import {
  login as loginApi,
  loginWithGoogle as loginWithGoogleApi,
  register as registerApi,
  verifyEmail as verifyEmailApi,
  fetchProfile,
} from "../services/auth";

const AuthContext = createContext(null);

const TOKEN_KEY = "vietcast_token";
const USER_KEY = "vietcast_user";

/**
 * Strip the auth response shape down to the fields the desktop UI
 * actually consumes. The backend sends more (email, role, etc.) but
 * the renderer does not display them, so persisting the whole object
 * would only bloat localStorage and confuse future greppers.
 */
function toUserPayload(data) {
  return {
    // ``id`` is required by AdminUsers' self-lock guard so the admin
    // cannot lock their own account. Backend already returns it via
    // /api/v1/auth/me; we just persist it now.
    id: data.id ?? data.userId ?? null,
    username: data.username ?? data.email,
    email: data.email ?? null,
    // Permanent balance — topups, admin grants, and SIGNUP_BONUS rows
    // that have already been promoted (i.e. moved out of the bonus
    // pool by the first successful topup). Sum this with
    // bonusCreditBalance for the "total available" view.
    creditBalance: data.creditBalance ?? 0,
    // Time-limited SIGNUP_BONUS pool. The header pill renders this
    // together with the countdown (bonusExpiresAt). When the user
    // tops up, the backend promotes this value into creditBalance in
    // a single UPDATE so the field becomes null on the next /me.
    bonusCreditBalance: data.bonusCreditBalance ?? null,
    bonusExpiresAt: data.bonusExpiresAt ?? null,
    role: data.role ?? "USER",
  };
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Boot — hydrate token + user from localStorage BEFORE any axios call.
  //
  // Critically: we set the axios default Authorization header here too,
  // so the very first request the renderer makes (e.g. /api/v1/system/
  // version from VersionCheckModal) carries the right credential even
  // if the request interceptor hasn't fired yet.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken) {
      setToken(storedToken);
      axios.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
    }
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  /**
   * Drop the local credential on either an explicit logout or an
   * observed 401 (signal that the JWT is no longer valid). Centralised
   * here so we never end up in a half-state where localStorage holds
   * a token but `axios.defaults.headers` does not.
   */
  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common.Authorization;
  }, []);

  // ---------------------------------------------------------------------------
  // Shared "I just got a JWT, write it through" helper used by every
  // auth path (LOCAL login, Google login, OTP-verify). Defined here —
  // before login/googleLogin/register — so the useCallback deps below
  // can reference it without triggering a TDZ ReferenceError at render.
  // ---------------------------------------------------------------------------
  const persistAuth = useCallback((data) => {
    if (!data?.token) {
      throw new Error("Máy chủ không trả về mã xác thực.");
    }
    const userPayload = toUserPayload(data);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(userPayload));
    setToken(data.token);
    setUser(userPayload);
    axios.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    return userPayload;
  }, []);

  /**
   * Re-validate the cached user against the server. Useful on app boot
   * so a stale localStorage snapshot (e.g. creditBalance was spent
   * while the user was offline) gets refreshed before any UI gate
   * trusts it. The endpoint intentionally returns the same shape that
   * {@link #login} persists so we can write it through unchanged.
   *
   * <p>Fails silently when the JWT has expired — the auth-gate logic
   * will see no token and route to /login.
   */
  const refreshProfile = useCallback(async () => {
    if (!token) return null;
    try {
      const data = await fetchProfile();
      const updated = toUserPayload(data);
      setUser(updated);
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    } catch (err) {
      // Interceptor turns the error into an ApiError; the original
      // HTTP status is now at `err.status` rather than `err.response`.
      if (err?.status === 401) {
        clearAuth();
      }
      return null;
    }
  }, [token, clearAuth]);

  // ---------------------------------------------------------------------------
  // LOCAL login — email (or legacy username) + password.
  //
  // The backend accepts EITHER identifier (see AuthService.login's
  // resolvePrincipal); the caller passes the field under the
  // `emailOrUsername` key. We keep the public method signature as
  // `{ emailOrUsername, password }` so future UI swaps (e.g. two
  // separate inputs that resolve to different keys) don't require a
  // breaking change here.
  // ---------------------------------------------------------------------------
  const login = useCallback(async ({ emailOrUsername, password }) => {
    const data = await loginApi({ emailOrUsername, password });
    return persistAuth(data);
  }, [persistAuth]);

  // ---------------------------------------------------------------------------
  // Google Sign-In — the idToken comes straight from
  // `@react-oauth/google`'s `useGoogleLogin({ flow: 'implicit' })`
  // callback. We forward it verbatim to POST /api/v1/auth/google.
  //
  // We deliberately do NOT inspect the decoded payload client-side:
  // the server must do that so a forged idToken from a different
  // audience can't impersonate any email.
  // ---------------------------------------------------------------------------
  const googleLogin = useCallback(async (idToken) => {
    if (!idToken || typeof idToken !== "string") {
      throw new Error("Thiếu Google credential. Vui lòng thử lại.");
    }

    const data = await loginWithGoogleApi({ idToken });
    return persistAuth(data);
  }, [persistAuth]);

  // ---------------------------------------------------------------------------
  // LOCAL sign-up is a TWO-STEP handshake with the backend:
  //   step 1 — register({ email, password }) → server creates the user,
  //            mints an OTP, emails it. Returns `token=null` and a
  //            Vietnamese "check your email" message.
  //   step 2 — verifyEmail({ email, otp }) → server flips `isVerified=true`,
  //            burns the OTP, returns the JWT.
  //
  // The caller (Login.jsx) drives the steps; we expose two separate
  // functions so the UI can stay clean. `persistAuth()` is shared by
  // every path that ends in a JWT so we don't drift on which keys get
  // written to localStorage.
  // ---------------------------------------------------------------------------

  /**
   * Step 1 — register the user. Throws if the email is already used
   * or if the cooldown is active (server-side enforcement, surfaced
   * verbatim to the UI).
   *
   * @param {{ email: string, password: string }} body
   * @returns {Promise<AuthResponseBody>} the response body (token is null)
   */
  const register = useCallback(async ({ email, password }) => {
    return await registerApi({ email, password });
  }, []);

  /**
   * Step 2 — submit the OTP from the verification email. On success
   * the user is fully authenticated and the JWT lands in localStorage.
   *
   * @param {{ email: string, otp: string }} body
   * @returns {Promise<UserPayload>}
   */
  const verifyEmail = useCallback(async ({ email, otp }) => {
    const data = await verifyEmailApi({ email, otp });
    return persistAuth(data);
  }, [persistAuth]);

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const updateCreditBalance = useCallback((newBalance) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, creditBalance: newBalance };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  /**
   * Merge a fresh {@link fetchProfile} result into the cached user so
   * the header pill reflects bonus / expiry changes without a full
   * logout. Called after a topup (the bonus gets promoted to the
   * permanent column by the backend) and after the renderer is told
   * the bonus expired.
   */
  const syncProfile = useCallback(async () => {
    if (!token) return null;
    try {
      const data = await fetchProfile();
      const updated = toUserPayload(data);
      setUser(updated);
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    } catch (err) {
      if (err?.status === 401) {
        clearAuth();
      }
      return null;
    }
  }, [token, clearAuth]);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: !!token,
      isLoading,
      login,
      register,
      verifyEmail,
      googleLogin,
      logout,
      updateCreditBalance,
      refreshProfile,
      syncProfile,
    }),
    [token, user, isLoading, login, register, verifyEmail, googleLogin, logout, updateCreditBalance, refreshProfile, syncProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
