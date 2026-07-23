import { useState } from "react";
import { Cookie, KeyRound, Save, RefreshCw, CheckCircle2, AlertCircle, Sparkles, FileText, Info } from "lucide-react";
import { updateAdminCookie } from "../../services/admin";

const PLATFORMS = [
  { id: "bilibili", label: "Bilibili", icon: "📺", desc: "Tải video VIP / 1080p từ Bilibili.com" },
  { id: "tiktok", label: "TikTok", icon: "🎵", desc: "Tránh rate-limit / captcha từ TikTok.com" },
  { id: "youtube", label: "YouTube", icon: "▶️", desc: "Vượt qua xác minh độ tuổi / Bot Check YouTube" },
  { id: "douyin", label: "Douyin (抖音)", icon: "🎥", desc: "Tải video Douyin không watermark" },
  { id: "facebook", label: "Facebook", icon: "📘", desc: "Hỗ trợ quét video riêng tư Facebook" },
  { id: "instagram", label: "Instagram", icon: "📷", desc: "Hỗ trợ quét Reels / Post Instagram" },
];

const NETSCAPE_SAMPLE = `# Netscape HTTP Cookie File
# http://curl.haxx.se/rfc/cookie_spec.html
# This is a generated file!  Do not edit.

.bilibili.com	TRUE	/	FALSE	1780000000	SESSDATA	sample_session_data_here
.bilibili.com	TRUE	/	FALSE	1780000000	bili_jct	sample_csrf_token_here
`;

export default function CookieManager() {
  const [platform, setPlatform] = useState("bilibili");
  const [cookieData, setCookieData] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', title: string, message: string }

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => {
      setToast(null);
    }, 6000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cookieData.trim()) {
      showToast("error", "Thiếu thông tin", "Vui lòng dán nội dung Cookie dạng Netscape trước khi lưu!");
      return;
    }

    setLoading(true);
    try {
      const resData = await updateAdminCookie(platform, cookieData.trim());

      showToast(
        "success",
        "Cập nhật thành công!",
        resData?.message || `Cookie nền tảng '${platform}' đã được ghi vào Shared Volume!`
      );

      // Tự động xóa trắng textarea sau khi thành công để tránh dán nhầm
      setCookieData("");
    } catch (err) {
      console.error("Lỗi cập nhật cookie:", err);
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || "Không thể kết nối đến hệ thống Server!";
      showToast("error", "Thất bại", errMsg);
    } finally {
      setLoading(false);
    }
  };

  const selectedPlatformInfo = PLATFORMS.find((p) => p.id === platform) || PLATFORMS[0];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6">
      {/* Toast Notification Header */}
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 max-w-md w-full p-4 rounded-2xl shadow-2xl border backdrop-blur-xl transition-all duration-300 transform translate-y-0 ${
            toast.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-100 shadow-emerald-900/30"
              : "bg-rose-950/90 border-rose-500/40 text-rose-100 shadow-rose-900/30"
          }`}
        >
          <div className="flex items-start gap-3">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h4 className="font-semibold text-sm">{toast.title}</h4>
              <p className="text-xs mt-1 leading-relaxed opacity-90">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-xs opacity-60 hover:opacity-100 px-1 py-0.5 rounded"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Title section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-slate-800/80 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <KeyRound className="w-3.5 h-3.5" />
            Engine Authentication
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Cookie className="w-8 h-8 text-yellow-400" />
            Quản lý Cookie Đa Nền Tảng
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Cập nhật Cookie (định dạng Netscape) để Python Engine vượt rào cản Anti-bot / VIP trên Docker Shared Volume (<code className="text-indigo-300 font-mono">/app/cookies/</code>).
          </p>
        </div>
      </div>

      {/* Main Glass Card Form */}
      <div className="bg-slate-900/70 border border-white/[0.08] rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        {/* Glow accent decoration */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          {/* Select Platform */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
              <span>1. Chọn nền tảng mục tiêu (Platform)</span>
              <span className="text-xs text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {PLATFORMS.map((p) => {
                const isSelected = platform === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className={`flex flex-col text-left p-3.5 rounded-2xl border transition-all duration-200 ${
                      isSelected
                        ? "bg-indigo-600/20 border-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                        : "bg-slate-950/40 border-white/[0.06] text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <span className="text-lg">{p.icon}</span>
                      <span className={isSelected ? "text-indigo-300" : ""}>{p.label}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 line-clamp-1">{p.desc}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              File lưu tương ứng: <code className="text-indigo-300 font-mono bg-slate-950 px-2 py-0.5 rounded border border-white/[0.06]">{`/app/cookies/${platform}.txt`}</code>
            </p>
          </div>

          {/* Cookie Textarea */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-yellow-400" />
                2. Dán nội dung Cookie (Định dạng Netscape)
                <span className="text-xs text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setCookieData(NETSCAPE_SAMPLE)}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Chèn cấu trúc mẫu
              </button>
            </div>

            <textarea
              rows={12}
              value={cookieData}
              onChange={(e) => setCookieData(e.target.value)}
              placeholder={`# Netscape HTTP Cookie File\n# Dán nội dung cookie xuất từ Extension 'Get cookies.txt LOCALLY' vào đây...\n.bilibili.com TRUE / FALSE 1780000000 SESSDATA xxx`}
              className="w-full font-mono text-xs bg-slate-950/90 border border-slate-800 rounded-2xl p-4 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition placeholder:text-slate-600 leading-relaxed shadow-inner"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              💡 Mẹo: Sử dụng tiện ích mở rộng <span className="text-slate-300 font-medium">"Get cookies.txt LOCALLY"</span> trên Chrome/Edge để export file cookie 1-click.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
            {cookieData && (
              <button
                type="button"
                onClick={() => setCookieData("")}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent transition"
              >
                Xóa trắng
              </button>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 shadow-[0_8px_30px_-10px_rgba(99,102,241,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Đang lưu Cookie...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Cập nhật Cookie {selectedPlatformInfo.label}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
