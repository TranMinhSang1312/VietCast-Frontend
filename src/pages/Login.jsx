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
  Sparkles,
} from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";

const SIGNUP_URL = "https://vietcast.vercel.app";

async function openExternalUrl(url) {
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

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleConfigured = Boolean(googleClientId);
  const postLoginTarget = "/dashboard";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login({ emailOrUsername, password });
      navigate(postLoginTarget, { replace: true });
    } catch (err) {
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

  const anyLoading = isLoading || isGoogleLoading;

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-zinc-950 font-sans text-zinc-50 overflow-hidden">
      {/* Left side - Editorial brand intro (hidden on mobile) */}
      <div className="hidden md:flex md:w-[55%] lg:w-[60%] flex-col justify-between p-12 lg:p-16 border-r border-zinc-900 bg-zinc-950 relative">
        {/* Ambient top light */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        {/* Brand Header */}
        <header className="flex items-center gap-3 select-none">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white font-sans">VietCast</span>
        </header>

        {/* Hero Section */}
        <main className="my-auto max-w-lg z-10">
          <h2 className="text-5xl lg:text-6xl font-bold tracking-tighter leading-[1.05] text-zinc-100">
            Lồng tiếng AI chất lượng cao.
          </h2>
          <p className="mt-6 text-lg text-zinc-400 leading-relaxed font-light">
            Dịch thuật và tạo giọng đọc lồng tiếng chuẩn xác cho video của bạn. 
            VietCast giữ nguyên âm điệu tự nhiên giúp video tiếp cận người xem toàn cầu.
          </p>
          <div className="mt-10 flex gap-4 text-xs font-mono text-zinc-500">
            <div className="flex items-center gap-1.5 border border-zinc-900 bg-zinc-900/30 px-3 py-1.5 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Whisper ASR</span>
            </div>
            <div className="flex items-center gap-1.5 border border-zinc-900 bg-zinc-900/30 px-3 py-1.5 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span>Gemini Pro</span>
            </div>
            <div className="flex items-center gap-1.5 border border-zinc-900 bg-zinc-900/30 px-3 py-1.5 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span>Edge TTS</span>
            </div>
          </div>
        </main>

        {/* Footer info */}
        <footer>
          <p className="text-xs text-zinc-600 font-mono">© 2026 VietCast. All rights reserved.</p>
        </footer>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 md:p-12 lg:p-16 bg-zinc-900/20 backdrop-blur-md relative">
        {/* Ambient mobile light */}
        <div className="md:hidden absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-brand-500/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="w-full max-w-sm mx-auto z-10">
          {/* Mobile brand header */}
          <div className="md:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 mb-4">
              <Sparkles className="w-6 h-6 text-brand-500" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">VietCast</h1>
            <p className="text-sm text-zinc-400 mt-1">Đăng nhập để sử dụng dịch vụ</p>
          </div>

          <div className="hidden md:block mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white select-none">Đăng nhập</h1>
            <p className="text-sm text-zinc-400 mt-1">Sử dụng tài khoản hoặc đăng nhập Google</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="emailOrUsername"
                className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5"
              >
                Email hoặc tên đăng nhập
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="w-4.5 h-4.5 text-zinc-500" />
                </div>
                <input
                  id="emailOrUsername"
                  name="emailOrUsername"
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  disabled={anyLoading}
                  autoComplete="username"
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50 text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5"
              >
                Mật khẩu
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="w-4.5 h-4.5 text-zinc-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={anyLoading}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 focus:outline-none transition disabled:opacity-50 text-sm"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/20 border border-red-900/40 text-red-200">
                <AlertCircle className="w-4.5 h-4.5 mt-0.5 shrink-0 text-red-400" />
                <div className="text-xs">{error}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={anyLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm shadow-lg shadow-brand-500/10 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed select-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang đăng nhập...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4.5 h-4.5" />
                  <span>Đăng nhập</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3 select-none">
            <div className="h-[1px] flex-1 bg-zinc-800" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              hoặc
            </span>
            <div className="h-[1px] flex-1 bg-zinc-800" />
          </div>

          {/* Google Sign-In */}
          {googleConfigured ? (
            <div className="relative w-full">
              <div className={isGoogleLoading ? "pointer-events-none opacity-60" : undefined}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap={false}
                  theme="filled_black"
                  shape="pill"
                  text="signin_with"
                  locale="vi"
                  width="100%"
                />
              </div>
              {isGoogleLoading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled
              title="Google Sign-In chưa được cấu hình (VITE_GOOGLE_CLIENT_ID)."
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-zinc-950 border border-zinc-850 text-zinc-500 text-sm cursor-not-allowed select-none"
            >
              <span>Đăng nhập với Google (chưa cấu hình)</span>
            </button>
          )}

          {/* Footer Sign-Up Link */}
          <p className="mt-8 text-center text-xs text-zinc-500">
            Chưa có tài khoản?{" "}
            <a
              href={SIGNUP_URL}
              onClick={handleSignupClick}
              className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-400 underline underline-offset-4 decoration-brand-500/20 hover:decoration-brand-400 transition"
            >
              Đăng ký và nạp tiền tại Website
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
