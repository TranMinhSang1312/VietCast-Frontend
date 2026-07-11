import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../config";

const AuthContext = createContext(null);

const TOKEN_KEY = "vietcast_token";
const USER_KEY = "vietcast_user";

const API_BASE_URL = API_BASE_URL_PROVIDER.sync;

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load token + user from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken) {
      setToken(storedToken);
      axios.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
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
   * Re-validate the cached user against the server. Useful on app boot
   * so that a stale localStorage copy (e.g. role was demoted while the
   * user was offline) gets refreshed before any UI gate trusts it.
   *
   * <p>Fails silently when the JWT has expired — the auth-gate logic
   * will see no token and route to /login.
   */
  const refreshProfile = useCallback(async () => {
    if (!token) return null;
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/auth/me`);
      const updated = {
        username: data.username,
        creditBalance: data.creditBalance,
        role: data.role || "USER",
      };
      setUser(updated);
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    } catch (err) {
      // Interceptor turns the error into an ApiError; the original
      // HTTP status is now at `err.status` rather than `err.response`.
      if (err?.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
        delete axios.defaults.headers.common["Authorization"];
      }
      return null;
    }
  }, [token]);

  const login = useCallback(async (username, password) => {
    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        { username, password },
        { headers: { "Content-Type": "application/json" } }
      );

      if (!data.token) {
        throw new Error("Đăng nhập thất bại, máy chủ không trả về mã xác thực.");
      }

      const userPayload = {
        username: data.username,
        creditBalance: data.creditBalance,
        role: data.role || "USER",
      };

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(userPayload));

      setToken(data.token);
      setUser(userPayload);

      axios.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
    } catch (err) {
      // Interceptor in src/config.js already converted this into an
      // ApiError with a Vietnamese `.message`. Re-throw so Login.jsx
      // can show it directly.
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common["Authorization"];
  }, []);

  const updateCreditBalance = useCallback((newBalance) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, creditBalance: newBalance };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const value = {
    token,
    user,
    role: user?.role || "USER",
    isAuthenticated: !!token,
    isAdmin: (user?.role || "USER") === "ADMIN",
    isLoading,
    login,
    logout,
    updateCreditBalance,
    refreshProfile,
  };

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