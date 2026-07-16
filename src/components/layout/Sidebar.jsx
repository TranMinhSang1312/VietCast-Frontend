import { NavLink } from "react-router-dom";
import {
  Wand2,
  Film,
  Receipt,
  Wallet,
} from "lucide-react";

// Single source of truth for the user-facing sidebar. Adding a new entry
// here automatically renders a NavLink with active styling — keep
// `path` aligned with the route defined in App.jsx.
const NAV = [
  { id: "dashboard",   label: "Lồng tiếng",       icon: Wand2,   path: "/dashboard"      },
  { id: "video-history", label: "Lịch sử video",  icon: Film,    path: "/video-history"  },
  { id: "topup",       label: "Lịch sử nạp",     icon: Receipt, path: "/topup-history"  },
  { id: "credit",      label: "Lịch sử tiêu",    icon: Wallet,  path: "/credit-usage"   },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 flex-shrink-0 flex-col bg-zinc-900 border-r border-zinc-800">
      {/* Brand — repeats the logo from the header so the user always
          has it visible, but kept compact since the header already
          shows it on small screens. */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <span className="text-sm font-bold tracking-wide text-zinc-200 select-none">
          VietCast
        </span>
        <p className="mt-1 text-[11px] text-zinc-500 uppercase tracking-wider">
          Studio
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon, path }) => (
          <NavLink
            key={id}
            to={path}
            className={({ isActive }) =>
              [
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition",
                isActive
                  ? "bg-brand-500 text-white shadow-md shadow-brand-500/10"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60",
              ].join(" ")
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-3 border-t border-zinc-800">
        <p className="text-[11px] text-zinc-600">
          v1.0 · Bản nội bộ
        </p>
      </div>
    </aside>
  );
}
