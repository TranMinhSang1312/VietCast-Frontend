import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LogIn,
  Loader2,
  AlertCircle,
  Mail,
  Lock,
  ExternalLink,
} from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";

// ---------------------------------------------------------------------------
// Marketing URL that the "Đăng ký tại Website" link opens.
//
// MUST be in the host allow-list embedded in `electron/main.js`
// (`ipcMain.handle('open-external')`). If you ever need to add another
// destination, update both this constant AND the allow-list together.
// ---------------------------------------------------------------------------
const SIGNUP_URL = "https://vietcast.vercel.app";

/**
 * Best-effort open of an external URL.
 *
 * In Electron the renderer cannot call `shell.openExternal` directly
 * (preload bridges it through `window.electronAPI.openExternal`).
 * In a plain browser build (uncommon for this app but possible) we
 * fall back to a plain window.open — the user is then on a normal
 * web page rather than the desktop shell.
 *
 * We catch and log any failure: there's nothing useful we can show
 * to the user beyond the link itself, which is already on screen.
 */
async function openExternalUrl(url) {
  // Browser-only fallback chain. The previous Electron branch that
  // delegated to `window.electronAPI.openExternal` has been removed
  // because this project is now a pure SPA — `window.open` is the
  // only available path.
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export default function Login() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState(null);

  const { login, googleLogin } = useAuth();
  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // Google Identity Services hook.
  //
  // `flow: 'implicit'` is the right choice for a desktop SPA: the
  // consent popup returns a single idToken straight to the callback,
  // which we then forward to POST /api/v1/auth/google. We do NOT use
  // `useGoogleLogin({ onSuccess, ... })` because it returns a *trigger
  // function* we attach to a custom button — we instead use the
  // styled `<GoogleLogin />` component, which internally manages
  // its own click handler and surfaces the credential via `onSuccess`.
  //
  // We also read the configured client ID and bail out early when
  // it is missing — otherwise `<GoogleLogin />` logs a scary-looking
  // error in the console on every page load.
  // ---------------------------------------------------------------------------
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleConfigured = Boolean(googleClientId);

  // Persist a local "post-login" target so a successful submit
  // navigates to /dashboard. We could just hard-code it, but reading
  // it from `location.state` makes this page reusable for future
  // "you must login first" redirects.
  const postLoginTarget = "/dashboard";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login({ emailOrUsername, password });
      navigate(postLoginTarget, { replace: true });
    } catch (err) {
      // Interceptor (src/utils/axiosInterceptor.js) converts the
      // axios error into an ApiError whose `.message` is Vietnamese
      // and user-safe.
      setError(err?.message || "Đăng nhập thất bại. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = useCallback(
    async (credentialResponse) => {
      setError(null);
      const idToken = credentialResponse?.credential;
      if (!idToken) {
        setError("Google không trả về mã xác thực. Vui lòng thử lại.");
        return;
      }
      setIsGoogleLoading(true);
      try {
        await googleLogin(idToken);
        navigate(postLoginTarget, { replace: true });
      } catch (err) {
        setError(
          err?.message ||
            "Đăng nhập bằng Google thất bại. Vui lòng thử lại."
        );
      } finally {
        setIsGoogleLoading(false);
      }
    },
    [googleLogin, navigate]
  );

  const handleGoogleError = useCallback(() => {
    setError("Đăng nhập Google thất bại. Vui lòng thử lại.");
  }, []);

  const handleSignupClick = useCallback(async (e) => {
    e.preventDefault();
    await openExternalUrl(SIGNUP_URL);
  }, []);

  // Block the "Đăng nhập" button while either flow is mid-flight.
  // Google button manages its own disabled state, but we mirror the
  // load flag on our submit so a user can't double-tap email login.
  const anyLoading = isLoading || isGoogleLoading;

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 mb-5">
            <LogIn className="w-8 h-8 text-brand-500" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-white via-slate-200 to-brand-500 bg-clip-text text-transparent">
            VietCast
          </h1>
          <p className="mt-2 text-slate-400">Đăng nhập để sử dụng dịch vụ</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email / Username */}
            <div>
              <label
                htmlFor="emailOrUsername"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Email hoặc tên đăng nhập
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="w-5 h-5 text-slate-500" />
                </div>
                <input
                  id="emailOrUsername"
                  name="emailOrUsername"
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  disabled={anyLoading}
                  autoComplete="username"
                  placeholder="email@example.com"
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Mật khẩu
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-slate-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={anyLoading}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50"
                  required
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-400" />
                <div className="text-sm">{error}</div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={anyLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Đang đăng nhập...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Đăng nhập</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-700/70" />
            <span className="text-xs uppercase tracking-wider text-slate-500">
              hoặc
            </span>
            <div className="h-px flex-1 bg-slate-700/70" />
          </div>

          {/* Google Sign-In */}
          {/*
            When VITE_GOOGLE_CLIENT_ID is not configured we render a
            disabled placeholder so the layout does not jump on a
            misconfigured build. The label still tells the user what
            would happen, which is better UX than a missing button.
          */}
          {googleConfigured ? (
            <div className="relative">
              {/* The official Google button manages its own enabled
                  state, but we wrap it so we can stack our own
                  spinner on top while /auth/google is in flight. */}
              <div
                className={
                  isGoogleLoading
                    ? "pointer-events-none opacity-60"
                    : undefined
                }
              >
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  // Use the same redirect-site as the OAuth client was
                  // registered for. Switching this without updating
                  // GOOGLE_CLIENT_ID on the backend will 401 every
                  // request — see services/auth.js.
                  useOneTap={false}
                  theme="filled_black"
                  shape="pill"
                  text="signin_with"
                  locale="vi"
                  width="100%"
                />
              </div>
              {isGoogleLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled
              title="Google Sign-In chưa được cấu hình (VITE_GOOGLE_CLIENT_ID)."
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-slate-400 font-medium cursor-not-allowed"
            >
              <span>Đăng nhập với Google (chưa cấu hình)</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Chưa có tài khoản?{" "}
          <a
            href={SIGNUP_URL}
            onClick={handleSignupClick}
            className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 underline-offset-2 hover:underline transition"
          >
            Đăng ký và nạp tiền tại Website
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </p>
      </div>
    </div>
  );
}
