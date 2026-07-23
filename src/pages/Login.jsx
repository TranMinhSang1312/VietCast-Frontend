import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LogIn,
  Loader2,
  AlertCircle,
  Mail,
  Lock,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  RotateCcw,
  X,
  ShieldAlert,
} from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";

const MemoizedGoogleButton = memo(function MemoizedGoogleButton({ onSuccess, onError }) {
  return (
    <GoogleLogin
      onSuccess={onSuccess}
      onError={onError}
      useOneTap={false}
      theme="filled_black"
      shape="pill"
      text="signin_with"
      locale="vi"
      width="350"
    />
  );
});

// Local client-side validation. Cheap regex is good enough for a
// first-pass UI check — the backend must still be the source of
// truth. Returning the message string lets the form render inline
// errors without the catch-all server roundtrip.
function validateRegisterForm({ email, password, confirmPassword }) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Email chưa đúng định dạng.";
  }
  if (email.length > 254) {
    return "Email quá dài (tối đa 254 ký tự).";
  }
  if (!password || password.length < 8) {
    return "Mật khẩu phải có ít nhất 8 ký tự.";
  }
  if (password.length > 72) {
    return "Mật khẩu tối đa 72 ký tự.";
  }
  // The backend requires at least one letter + one digit; mirror the
  // check here so the user sees the rule before the roundtrip.
  if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(password)) {
    return "Mật khẩu phải chứa ít nhất một chữ cái và một chữ số.";
  }
  if (password !== confirmPassword) {
    return "Mật khẩu nhập lại không khớp.";
  }
  return null;
}

function signupBenefitFrom(userOrResponse) {
  if (userOrResponse?.signupBenefitGranted !== true) return null;
  const amount = Number(userOrResponse?.bonusCreditBalance ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    expiresAt: userOrResponse?.bonusExpiresAt ?? null,
  };
}

const LEFT_COPY = {
  login: {
    eyebrow: "Lồng tiếng AI cho video của bạn",
    titleStart: "Dịch thuật và tạo giọng đọc ",
    titleAccent: "chuẩn tiếng Việt.",
    body:
      "VietCast hỗ trợ lồng tiếng đè giọng hoặc giữ nhạc nền gốc; các chế độ dịch và lồng tiếng có kèm phụ đề SRT song ngữ.",
  },
  register: {
    eyebrow: "Bắt đầu miễn phí",
    titleStart: "Tạo tài khoản, ",
    titleAccent: "render ngay video đầu tiên.",
    body:
      "Đăng ký bằng email và mật khẩu. Mỗi tác vụ lồng tiếng tặng kèm file SRT song ngữ, bạn chỉ trả phí theo thời lượng thực tế.",
  },
  verify: {
    eyebrow: "Xác thực email",
    titleStart: "Nhập mã OTP từ ",
    titleAccent: "hộp thư đến.",
    body:
      "Một mã gồm 6 chữ số đã được gửi tới email của bạn. Mã có hiệu lực trong vài phút. Kiểm tra cả thư mục spam nếu không thấy.",
  },
};

export default function Login() {
  // "login"   — email/username + password form
  // "register" — email + password + confirm password form
  // "verify"  — 6-digit OTP form (the email field is reused, the user
  //             can't edit it without going back to register).
  const [mode, setMode] = useState("login");

  // Form state. Kept shared across modes so toggling is instant, but
  // `switchMode` wipes everything to avoid the "old email still in the
  // register form" footgun.
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState(null);

  const { user, isAuthenticated, login, register, verifyEmail, googleLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const lockedMsg = sessionStorage.getItem("vc_account_locked_message");
    if (lockedMsg) {
      setError(lockedMsg);
      sessionStorage.removeItem("vc_account_locked_message");
    } else {
      const existingToken = localStorage.getItem("vc_token");
      if (isAuthenticated || existingToken) {
        navigate(postLoginTarget, { replace: true });
      }
    }
  }, [isAuthenticated, navigate]);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleConfigured = Boolean(googleClientId);
  const postLoginTarget = "/dashboard";

  // Six separate inputs so the browser can route keystrokes the way
  // users expect (left-to-right, auto-advance, backspace jumps back).
  // We keep a ref array on the inputs so we can focus them on
  // programmatic fill (paste handler below).
  const otpInputRefs = useRef([]);

  // Mode is the single source of truth for which form is visible.
  const isRegister = mode === "register";
  const isVerify = mode === "verify";
  const copy = LEFT_COPY[isVerify ? "verify" : mode];

  const switchMode = useCallback((next) => {
    setMode(next);
    setError(null);
    setIsLoading(false);
    setIsGoogleLoading(false);
    setEmailOrUsername("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setOtp(["", "", "", "", "", ""]);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login({ emailOrUsername: emailOrUsername.trim(), password, rememberMe });
      navigate(postLoginTarget, { replace: true });
    } catch (err) {
      setError(err?.message || "Đăng nhập thất bại. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: register → server creates user + emails OTP.
  // We keep the entered email/password so the user doesn't have to
  // retype them after a typo in the OTP.
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const validationError = validateRegisterForm({
      email,
      password,
      confirmPassword,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      await register({ email: email.trim(), password });
      setMode("verify");
      setOtp(["", "", "", "", "", ""]);
      // Focus the first OTP slot after the form re-renders.
      setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError(err?.message || "Đăng ký thất bại. Vui lòng thử lại sau.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: verify OTP → server returns JWT.
  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Vui lòng nhập đủ 6 chữ số của mã OTP.");
      return;
    }
    setIsLoading(true);
    try {
      await verifyEmail({ email: email.trim(), otp: code });
      navigate(postLoginTarget, { replace: true });
    } catch (err) {
      setError(err?.message || "Mã OTP không đúng hoặc đã hết hạn.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await register({ email: email.trim(), password });
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError(err?.message || "Không thể gửi lại mã OTP. Vui lòng thử lại sau.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    console.log("🔑 Google Credential Token received:", credentialResponse?.credential);
    if (!credentialResponse?.credential) {
      console.warn("⚠️ Google response missing credential property:", credentialResponse);
      setError("Đăng nhập với Google thất bại. Không nhận được token từ Google.");
      return;
    }
    setError(null);
    setIsGoogleLoading(true);
    try {
      await googleLogin({ idToken: credentialResponse.credential });
      navigate(postLoginTarget, { replace: true });
    } catch (err) {
      setError(err?.message || "Đăng nhập với Google thất bại. Vui lòng thử lại.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError("Đăng nhập với Google thất bại. Vui lòng thử lại.");
  };

  // OTP input wiring — type/digit/backspace/auto-advance/paste.
  const handleOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Paste handler: "123456" or "12 34 56" both fill all 6 slots.
  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pasted.length === 0) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < Math.min(6, pasted.length); i++) {
      next[i] = pasted[i];
    }
    setOtp(next);
    const lastFilled = Math.min(5, pasted.length - 1);
    otpInputRefs.current[lastFilled]?.focus();
  };

  const anyLoading = isLoading || isGoogleLoading;

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-slate-950 font-sans text-zinc-50 overflow-hidden relative">
      {/* Ambient mesh */}
      <div className="absolute top-[-20%] right-[-15%] w-[720px] h-[720px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-25%] left-[-15%] w-[520px] h-[520px] bg-violet-600/8 rounded-full blur-[140px] pointer-events-none" />

      {/* Left side - Editorial brand intro */}
      <div className="hidden md:flex md:w-[55%] lg:w-[60%] flex-col justify-between p-12 lg:p-16 border-r border-white/[0.06] bg-slate-950 relative">
        <header className="flex items-center gap-4 select-none z-10">
          <img
            src="/logo.png"
            alt="VietCast Logo"
            className="w-28 h-28 lg:w-36 lg:h-36 object-contain shrink-0 transition-transform hover:scale-105"
          />
          <div>
            <span className="text-4xl lg:text-5xl font-black tracking-tight text-white block">
              VietCast
            </span>
            <span className="text-xs text-indigo-400 font-mono tracking-[0.2em] uppercase mt-1 block">
              AI Video Translation Platform
            </span>
          </div>
        </header>

        <main className="my-auto max-w-lg z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-yellow-300">
            <Sparkles className="w-3.5 h-3.5" />
            {copy.eyebrow}
          </div>
          <h2 className="mt-6 text-5xl lg:text-6xl font-extrabold tracking-[-0.03em] leading-[1.05] text-zinc-100">
            {copy.titleStart}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300">
              {copy.titleAccent}
            </span>
          </h2>
          <p className="mt-6 text-lg text-zinc-400 leading-relaxed font-light">
            {copy.body}
          </p>

          {!isVerify && !isRegister && (
            <div className="mt-10 inline-flex items-center gap-2 rounded-full bg-yellow-400/10 border border-yellow-400/30 px-3 py-1.5 text-xs font-semibold text-yellow-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Tác vụ dịch và lồng tiếng có kèm file SRT song ngữ.
            </div>
          )}

          {/* OTP-specific helper: where to look for the code. */}
          {isVerify && (
            <div className="mt-10 inline-flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
              <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-indigo-300" />
              <div className="text-xs text-slate-300 leading-relaxed">
                Mã có dạng{" "}
                <span className="font-mono text-slate-100">123456</span>, gửi
                từ địa chỉ <span className="font-mono text-slate-100">no-reply@vietcast</span>.
              </div>
            </div>
          )}
        </main>

        <footer>
          <p className="text-xs text-slate-600 font-mono">
            © 2026 VietCast. All rights reserved.
          </p>
        </footer>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 md:p-12 lg:p-16 bg-slate-950/40 backdrop-blur-md relative">
        <div className="w-full max-w-sm mx-auto z-10">
          {/* Mobile brand header */}
          <div className="md:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl overflow-hidden mb-4 mx-auto">
              <img src="/logo.png" alt="VietCast Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">VietCast</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {isVerify
                ? "Kiểm tra email để lấy mã OTP"
                : isRegister
                ? "Tạo tài khoản mới"
                : "Đăng nhập để sử dụng dịch vụ"}
            </p>
          </div>

          {/* Mode toggle. Hidden during the OTP step because there's
              no parallel action there — switching mode would discard
              the in-flight registration. */}
          {!isVerify && (
            <div className="mb-7 grid grid-cols-2 p-1 rounded-full border border-white/[0.06] bg-white/[0.025] backdrop-blur-xl select-none">
              <button
                type="button"
                onClick={() => mode !== "login" && switchMode("login")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${
                  !isRegister
                    ? "bg-indigo-500 text-white shadow-[0_8px_30px_-12px_rgba(99,102,241,0.45)]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => !isRegister && switchMode("register")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${
                  isRegister
                    ? "bg-indigo-500 text-white shadow-[0_8px_30px_-12px_rgba(99,102,241,0.45)]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Đăng ký
              </button>
            </div>
          )}

          <div className="hidden md:block mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-white select-none">
              {isVerify
                ? "Nhập mã xác thực"
                : isRegister
                ? "Tạo tài khoản VietCast"
                : "Đăng nhập"}
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              {isVerify
                ? `Mã đã được gửi tới ${email || "email của bạn"}.`
                : isRegister
                ? "Điền thông tin bên dưới để bắt đầu render."
                : "Sử dụng tài khoản hoặc đăng nhập Google."}
            </p>
          </div>

          {isVerify ? (
            // ============================================================
            // OTP step — six single-digit inputs, paste-friendly, with a
            // resend fallback and a back-to-edit escape hatch.
            // ============================================================
            <form onSubmit={handleVerifySubmit} className="space-y-5">
              <div
                className="flex items-center justify-between gap-2"
                onPaste={handleOtpPaste}
              >
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={idx === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    disabled={anyLoading}
                    aria-label={`Chữ số OTP thứ ${idx + 1}`}
                    className="w-11 h-13 sm:w-12 sm:h-14 rounded-xl bg-slate-950 border border-white/[0.06] text-center text-xl sm:text-2xl font-bold text-white placeholder:text-slate-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 focus:outline-none transition disabled:opacity-50 font-mono"
                  />
                ))}
              </div>

              {error && (
                <div
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${
                    // Cooldown resend success flips this to an info
                    // pill (emerald) instead of rose.
                    error.startsWith("Đã gửi lại")
                      ? "bg-emerald-950/30 border-emerald-900/40 text-emerald-200"
                      : "bg-rose-950/30 border-rose-900/40 text-rose-200"
                  }`}
                >
                  {error.startsWith("Đã gửi lại") ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                  )}
                  <div>{error}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={anyLoading || otp.join("").length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed select-none"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang xác thực...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Xác thực và đăng nhập</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                    setOtp(["", "", "", "", "", ""]);
                  }}
                  disabled={anyLoading}
                  className="hover:text-white underline underline-offset-4 decoration-slate-700 hover:decoration-slate-500 transition disabled:opacity-40"
                >
                  ← Đổi email
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={anyLoading}
                  className="inline-flex items-center gap-1 hover:text-white transition disabled:opacity-40"
                >
                  <RotateCcw className="w-3 h-3" />
                  Gửi lại mã
                </button>
              </div>
            </form>
          ) : isRegister ? (
            // ============================================================
            // Register form — email + password + confirm.
            // ============================================================
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <FormField
                id="reg-email"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={anyLoading}
                autoComplete="email"
                placeholder="name@example.com"
                icon={Mail}
                required
              />
              <FormField
                id="reg-password"
                label="Mật khẩu"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={anyLoading}
                autoComplete="new-password"
                placeholder="Ít nhất 8 ký tự, có chữ + số"
                icon={Lock}
                required
              />
              <FormField
                id="reg-confirm"
                label="Nhập lại mật khẩu"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={anyLoading}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                icon={Lock}
                required
              />

              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-950/30 border border-rose-900/40 text-rose-200">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                  <div className="text-xs">{error}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={anyLoading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed select-none"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang tạo tài khoản...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Tạo tài khoản</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            // ============================================================
            // Login form.
            // ============================================================
            <form onSubmit={handleLogin} className="space-y-4">
              <FormField
                id="emailOrUsername"
                label="Email hoặc tên đăng nhập"
                type="text"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                disabled={anyLoading}
                autoComplete="username"
                placeholder="name@example.com"
                icon={Mail}
                required
              />
              <FormField
                id="password"
                label="Mật khẩu"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={anyLoading}
                autoComplete="current-password"
                placeholder="••••••••"
                icon={Lock}
                required
              />

              <div className="flex items-center justify-between pt-1 pb-1">
                <label className="flex items-center gap-2.5 text-xs font-medium text-slate-300 cursor-pointer hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={anyLoading}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0 transition cursor-pointer accent-indigo-500"
                  />
                  <span>Ghi nhớ đăng nhập</span>
                </label>
              </div>

              {error && !(error.includes("khóa") || error.includes("locked") || error.includes("bị khóa")) && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-950/30 border border-rose-900/40 text-rose-200">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                  <div className="text-xs">{error}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={anyLoading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-[0_18px_60px_-18px_rgba(16,185,129,0.55)] active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed select-none"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang đăng nhập...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Đăng nhập</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Google Sign-In only on login mode. */}
          {!isRegister && !isVerify && (
            <>
              <div className="my-6 flex items-center gap-3 select-none">
                <div className="h-[1px] flex-1 bg-white/[0.06]" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  hoặc
                </span>
                <div className="h-[1px] flex-1 bg-white/[0.06]" />
              </div>

              {googleConfigured ? (
                <div className="relative w-full">
                  <div className={isGoogleLoading ? "pointer-events-none opacity-60" : undefined}>
                    <MemoizedGoogleButton
                      onSuccess={handleGoogleSuccess}
                      onError={handleGoogleError}
                    />
                  </div>
                  {isGoogleLoading && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Google Sign-In chưa được cấu hình (VITE_GOOGLE_CLIENT_ID)."
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-slate-950 border border-white/[0.06] text-slate-500 text-sm cursor-not-allowed select-none"
                >
                  <span>Đăng nhập với Google (chưa cấu hình)</span>
                </button>
              )}
            </>
          )}

          {/* Bottom helper: switch between login / register. Hidden
              during the OTP step — switching would discard the
              in-flight registration. */}
          {!isVerify && (
            <p className="mt-7 text-center text-xs text-zinc-500">
              {isRegister ? (
                <>
                  Đã có tài khoản?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="text-indigo-300 hover:text-indigo-200 underline underline-offset-4 decoration-indigo-500/30 hover:decoration-indigo-400 transition"
                  >
                    Đăng nhập ngay
                  </button>
                </>
              ) : (
                <>
                  Chưa có tài khoản?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className="text-indigo-300 hover:text-indigo-200 underline underline-offset-4 decoration-indigo-500/30 hover:decoration-indigo-400 transition"
                  >
                    Tạo tài khoản VietCast
                  </button>
                </>
              )}
            </p>
          )}

          <p className="mt-3 text-center text-xs text-slate-600">
            <Link
              to="/"
              className="hover:text-slate-400 transition underline underline-offset-4 decoration-slate-800 hover:decoration-slate-600"
            >
              ← Về trang chủ
            </Link>
          </p>
      {/* Account Locked Popup Modal */}
      {error && (error.includes("khóa") || error.includes("locked") || error.includes("bị khóa")) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setError(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-amber-500/30 shadow-2xl p-6 relative">
            {/* Header */}
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="flex-1 pr-6">
                <h3 id="lock-modal-title" className="text-base font-bold text-amber-100">
                  Tài khoản đã bị khóa
                </h3>
                <p className="text-xs text-amber-400/80 mt-0.5 font-medium">
                  Thông báo từ hệ thống quản trị VietCast
                </p>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition absolute top-5 right-5"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Message Body */}
            <div className="rounded-xl bg-slate-950/70 border border-white/[0.06] p-4 mb-5 text-xs leading-relaxed text-zinc-300 whitespace-pre-line font-medium">
              {error}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setError(null)}
                className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold active:scale-[0.98] transition"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

// ---------- small helpers --------------------------------------------------

function FormField({ id, label, icon: Icon, type = "text", ...rest }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-mono uppercase tracking-[0.18em] text-zinc-400 mb-1.5"
      >
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Icon className="w-4 h-4 text-slate-500" />
        </div>
        <input
          id={id}
          name={id}
          type={type}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950 border border-white/[0.06] text-zinc-100 placeholder:text-slate-600 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 focus:outline-none transition disabled:opacity-50 text-sm"
          {...rest}
        />
      </div>
    </div>
  );
}


