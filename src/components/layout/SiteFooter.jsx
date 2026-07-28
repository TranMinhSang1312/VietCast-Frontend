import { Link } from "react-router-dom";
import { Mail, Phone, Send, Music2 } from "lucide-react";

const PAGE_LINKS = [
  { label: "Trang chủ", to: "/" },
  { label: "Lồng tiếng", to: "/dashboard" },
  { label: "Xóa logo / Phụ đề", to: "/watermark-remover" },
  { label: "Lịch sử video", to: "/video-history" },
  { label: "Lịch sử nạp", to: "/topup-history" },
  { label: "Lịch sử tiêu", to: "/credit-usage" },
  { label: "Bảng phí", to: "/pricing" },
  { label: "Đăng nhập", to: "/login" },
];

const CONTACT_LINKS = [
  { label: "sang13122005@gmail.com", href: "mailto:sang13122005@gmail.com", icon: Mail },
  { label: "0813 172 825", href: "tel:+84813172825", icon: Phone },
  { label: "Zalo 0813 172 825", href: "https://zalo.me/0813172825", icon: Send, external: true },
  { label: "@sang.trn176", href: "https://www.tiktok.com/@sang.trn176", icon: Music2, external: true },
];

export default function SiteFooter() {
  return (
    <footer className="relative z-10 w-full border-t border-white/[0.07] bg-slate-950 text-slate-400">
      <div className="mx-auto grid w-full max-w-7xl gap-9 px-5 py-10 sm:px-8 lg:grid-cols-[1.15fr_1.5fr_1fr] lg:gap-12 lg:px-10 lg:py-12">
        <div className="max-w-sm">
          <Link to="/" className="inline-flex items-center gap-3" aria-label="VietCast - Trang chủ">
            <img src="/logo.png" alt="" className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-white">VietCast</span>
          </Link>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Dịch và lồng tiếng video trực tiếp trên trình duyệt.
          </p>
        </div>

        <nav aria-label="Liên kết chân trang">
          <h2 className="text-sm font-semibold text-slate-200">Khám phá</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {PAGE_LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="inline-flex min-h-9 items-center text-sm transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <div>
          <h2 className="text-sm font-semibold text-slate-200">Liên hệ</h2>
          <div className="mt-3 space-y-1">
            {CONTACT_LINKS.map(({ label, href, icon: Icon, external }) => (
              <a
                key={href}
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                className="flex min-h-9 items-center gap-2.5 text-sm transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="break-all">{label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center px-5 text-xs text-slate-500 sm:px-8 lg:px-10">
          © 2026 VietCast. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
