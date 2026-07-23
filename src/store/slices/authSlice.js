import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { API_BASE_URL_PROVIDER } from "../../config";
import {
  login as loginApi,
  loginWithGoogle as loginWithGoogleApi,
  register as registerApi,
  verifyEmail as verifyEmailApi,
  logout as logoutApi,
  fetchProfile as fetchProfileApi,
} from "../../services/auth";
import { setAuthToken, clearAuthToken } from "../../utils/axiosInterceptor";

export const TOKEN_KEY = "vietcast_token";
export const USER_KEY = "vietcast_user";

function toUserPayload(data) {
  if (!data) return null;
  return {
    id: data.id ?? data.userId ?? null,
    username: data.username ?? data.email,
    email: data.email ?? null,
    creditBalance: data.creditBalance ?? 0,
    bonusCreditBalance: data.bonusCreditBalance ?? null,
    bonusExpiresAt: data.bonusExpiresAt ?? null,
    role: data.role ?? "USER",
  };
}

// Helper to safely load initial state from localStorage
const storedToken = localStorage.getItem(TOKEN_KEY);
const storedUserStr = localStorage.getItem(USER_KEY);
let initialUser = null;
if (storedUserStr) {
  try {
    initialUser = JSON.parse(storedUserStr);
  } catch {
    localStorage.removeItem(USER_KEY);
  }
}

const initialState = {
  token: storedToken || null,
  user: initialUser,
  isLoggedIn: Boolean(storedToken),
  isLoading: !storedToken, // If stored token exists, don't block boot UI with fullscreen loader
  error: null,
};

// ---------------------------------------------------------------------------
// Async Thunks
// ---------------------------------------------------------------------------

/** Silent Boot Refresh via HttpOnly Cookie (Remember Me) */
export const silentBootRefresh = createAsyncThunk(
  "auth/silentBootRefresh",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await axios.post(
        `${API_BASE_URL_PROVIDER.sync}/api/v1/auth/refresh-token`,
        {},
        { skipAuth: true, withCredentials: true }
      );
      if (data?.token) {
        setAuthToken(data.token);
        const profile = await fetchProfileApi();
        const userPayload = toUserPayload(profile);
        dispatch(setCredentials({ token: data.token, user: userPayload }));
        return { token: data.token, user: userPayload };
      }
      return null;
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err.message);
    }
  }
);

/** Login with Email/Username + Password */
export const loginThunk = createAsyncThunk(
  "auth/login",
  async ({ emailOrUsername, password, rememberMe }, { dispatch, rejectWithValue }) => {
    try {
      const data = await loginApi({ emailOrUsername, password, rememberMe });
      if (!data?.token) {
        throw new Error("Máy chủ không trả về mã xác thực.");
      }
      const userPayload = toUserPayload(data);
      dispatch(setCredentials({ token: data.token, user: userPayload }));
      return {
        ...userPayload,
        token: data.token,
        signupBenefitGranted: data.signupBenefitGranted === true,
      };
    } catch (err) {
      return rejectWithValue(err?.message || "Đăng nhập thất bại.");
    }
  }
);

/** Google Login */
export const googleLoginThunk = createAsyncThunk(
  "auth/googleLogin",
  async (idTokenArg, { dispatch, rejectWithValue }) => {
    try {
      const idToken = typeof idTokenArg === "object" && idTokenArg?.idToken ? idTokenArg.idToken : idTokenArg;
      const data = await loginWithGoogleApi({ idToken });
      if (!data?.token) {
        throw new Error("Máy chủ không trả về mã xác thực.");
      }
      const userPayload = toUserPayload(data);
      dispatch(setCredentials({ token: data.token, user: userPayload }));
      return {
        ...userPayload,
        token: data.token,
        signupBenefitGranted: data.signupBenefitGranted === true,
      };
    } catch (err) {
      return rejectWithValue(err?.message || "Đăng nhập Google thất bại.");
    }
  }
);

/** Verify OTP Email */
export const verifyEmailThunk = createAsyncThunk(
  "auth/verifyEmail",
  async ({ email, otp }, { dispatch, rejectWithValue }) => {
    try {
      const data = await verifyEmailApi({ email, otp });
      if (!data?.token) {
        throw new Error("Máy chủ không trả về mã xác thực.");
      }
      const userPayload = toUserPayload(data);
      dispatch(setCredentials({ token: data.token, user: userPayload }));
      return {
        ...userPayload,
        token: data.token,
        signupBenefitGranted: data.signupBenefitGranted === true,
      };
    } catch (err) {
      return rejectWithValue(err?.message || "Mã OTP không hợp lệ.");
    }
  }
);

/** Fetch Profile */
export const fetchProfileThunk = createAsyncThunk(
  "auth/fetchProfile",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const profile = await fetchProfileApi();
      const userPayload = toUserPayload(profile);
      dispatch(setUserPayload(userPayload));
      return userPayload;
    } catch (err) {
      return rejectWithValue(err?.message || "Không thể tải thông tin tài khoản.");
    }
  }
);

/** Logout */
export const logoutThunk = createAsyncThunk(
  "auth/logout",
  async (_, { dispatch }) => {
    try {
      await logoutApi();
    } catch {
      // Best-effort backend cookie wipe
    } finally {
      dispatch(logoutState());
    }
  }
);

// ---------------------------------------------------------------------------
// Slice Definition
// ---------------------------------------------------------------------------
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { token, user } = action.payload;
      state.token = token;
      state.user = user;
      state.isLoggedIn = true;
      state.isLoading = false;
      state.error = null;
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      }
      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      }
    },

    setUserPayload: (state, action) => {
      state.user = action.payload;
      if (action.payload) {
        localStorage.setItem(USER_KEY, JSON.stringify(action.payload));
      }
    },

    updateCreditBalance: (state, action) => {
      if (state.user) {
        state.user.creditBalance = action.payload;
        localStorage.setItem(USER_KEY, JSON.stringify(state.user));
      }
    },

    setAuthLoading: (state, action) => {
      state.isLoading = action.payload;
    },

    logoutState: (state) => {
      state.token = null;
      state.user = null;
      state.isLoggedIn = false;
      state.error = null;
      clearAuthToken();
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
  },
  extraReducers: (builder) => {
    builder
      // silentBootRefresh
      .addCase(silentBootRefresh.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(silentBootRefresh.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(silentBootRefresh.rejected, (state) => {
        state.isLoading = false;
      })

      // loginThunk
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // googleLoginThunk
      .addCase(googleLoginThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(googleLoginThunk.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(googleLoginThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // fetchProfileThunk
      .addCase(fetchProfileThunk.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(fetchProfileThunk.rejected, (state) => {
        state.isLoading = false;
      });
  },
});

export const {
  setCredentials,
  setUserPayload,
  updateCreditBalance,
  setAuthLoading,
  logoutState,
} = authSlice.actions;

export default authSlice.reducer;
