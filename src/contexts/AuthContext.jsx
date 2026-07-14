import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
// Side-effect import: attaches the request/response interceptors to the
// shared axios instance (Bearer-token injection + error normalisation).
// Keep this import here — AuthContext is the first axios-touching code
// that runs at boot, so we want the interceptors up before any call.
import "../utils/axiosInterceptor";
import { login as loginApi, loginWithGoogle as loginWithGoogleApi, fetchProfile } from "../services/auth";

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
    username: data.username ?? data.email,
    email: data.email ?? null,
    creditBalance: data.creditBalance ?? 0,
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

    if (!data.token) {
      // The server responded 200 but the body has no token. Should
      // not happen in practice (every successful login path issues a
      // JWT) but a defensive throw keeps us from shipping the user
      // into a half-authenticated state.
      throw new Error("Đăng nhập thất bại, máy chủ không trả về mã xác thực.");
    }

    const userPayload = toUserPayload(data);

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(userPayload));

    setToken(data.token);
    setUser(userPayload);

    axios.defaults.headers.common.Authorization = `Bearer ${data.token}`;

    return userPayload;
  }, []);

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

    if (!data.token) {
      throw new Error("Đăng nhập Google thất bại, máy chủ không trả về mã xác thực.");
    }

    const userPayload = toUserPayload(data);

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(userPayload));

    setToken(data.token);
    setUser(userPayload);

    axios.defaults.headers.common.Authorization = `Bearer ${data.token}`;

    return userPayload;
  }, []);

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

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: !!token,
      isLoading,
      login,
      googleLogin,
      logout,
      updateCreditBalance,
      refreshProfile,
    }),
    [token, user, isLoading, login, googleLogin, logout, updateCreditBalance, refreshProfile]
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
