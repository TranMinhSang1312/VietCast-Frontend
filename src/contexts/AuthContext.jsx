import { createContext, useContext, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import "../utils/axiosInterceptor";
import {
  silentBootRefresh,
  loginThunk,
  googleLoginThunk,
  verifyEmailThunk,
  fetchProfileThunk,
  logoutThunk,
  updateCreditBalance as updateCreditBalanceAction,
} from "../store/slices/authSlice";
import { register as registerApi } from "../services/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const dispatch = useDispatch();

  const token = useSelector((state) => state.auth.token);
  const user = useSelector((state) => state.auth.user);
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);
  const isLoading = useSelector((state) => state.auth.isLoading);
  const error = useSelector((state) => state.auth.error);

  // Silent boot auto-login check via HttpOnly cookie or cached localStorage
  useEffect(() => {
    if (!token) {
      dispatch(silentBootRefresh());
    } else {
      // If token exists, trigger a background profile sync
      dispatch(fetchProfileThunk());
    }
  }, [dispatch, token]);

  const login = useCallback(
    async ({ emailOrUsername, password, rememberMe }) => {
      const result = await dispatch(loginThunk({ emailOrUsername, password, rememberMe }));
      if (loginThunk.rejected.match(result)) {
        throw new Error(result.payload || "Đăng nhập thất bại.");
      }
      return result.payload;
    },
    [dispatch]
  );

  const googleLogin = useCallback(
    async (idTokenArg) => {
      const result = await dispatch(googleLoginThunk(idTokenArg));
      if (googleLoginThunk.rejected.match(result)) {
        throw new Error(result.payload || "Đăng nhập Google thất bại.");
      }
      return result.payload;
    },
    [dispatch]
  );

  const register = useCallback(async ({ email, password, referralCode }) => {
    return await registerApi({ email, password, referralCode });
  }, []);

  const verifyEmail = useCallback(
    async ({ email, otp }) => {
      const result = await dispatch(verifyEmailThunk({ email, otp }));
      if (verifyEmailThunk.rejected.match(result)) {
        throw new Error(result.payload || "Xác thực email thất bại.");
      }
      return result.payload;
    },
    [dispatch]
  );

  const logout = useCallback(async () => {
    await dispatch(logoutThunk());
  }, [dispatch]);

  const updateCreditBalance = useCallback(
    (newBalance) => {
      dispatch(updateCreditBalanceAction(newBalance));
    },
    [dispatch]
  );

  const syncProfile = useCallback(async () => {
    if (!token) return null;
    const result = await dispatch(fetchProfileThunk());
    if (fetchProfileThunk.fulfilled.match(result)) {
      return result.payload;
    }
    return null;
  }, [dispatch, token]);

  const value = useMemo(
    () => ({
      token,
      user,
      isLoggedIn,
      isAuthenticated: isLoggedIn,
      isLoading,
      error,
      login,
      googleLogin,
      register,
      verifyEmail,
      logout,
      updateCreditBalance,
      syncProfile,
    }),
    [
      token,
      user,
      isLoggedIn,
      isLoading,
      error,
      login,
      googleLogin,
      register,
      verifyEmail,
      logout,
      updateCreditBalance,
      syncProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The provider and its companion hook intentionally share this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
