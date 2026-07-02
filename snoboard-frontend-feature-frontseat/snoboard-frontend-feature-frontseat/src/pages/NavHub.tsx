import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ClipboardList, Image, Radio,
  Trophy, Ticket, Newspaper, TrendingUp,
  Users, Scissors, ChevronRight,
} from "lucide-react";

const pages = [
  { to: "/dashboard",       label: "Dashboard",             icon: LayoutDashboard, external: false },
  { to: "/content-tracker", label: "Reel Tracker",          icon: ClipboardList,   external: false },
  { to: "/post-tracker",    label: "Post Tracker",          icon: Image,           external: false },
  { to: "/six-day-tracker", label: "6-Day Tracker",         icon: Radio,           external: false },
  { to: "/team-performance",label: "Teams",                 icon: Trophy,          external: false },
  { to: "/tickets",         label: "Tickets",               icon: Ticket,          external: false },
  { to: "/news",            label: "News Feed",             icon: Newspaper,       external: false },
  { to: "/growth",          label: "Growth",                icon: TrendingUp,      external: false },
  { to: "/pages",           label: "IPs",                   icon: Users,           external: false },
  { to: "http://16.112.125.207:5173/", label: "Pintu",     icon: Scissors,        external: true  },
];

export default function NavHub() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Banner */}
      <div className="w-full h-48 bg-gradient-to-br from-red-900/60 via-zinc-900 to-blue-900/60 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(220,38,38,0.3),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_30%,rgba(59,130,246,0.25),transparent_60%)]" />
        <p className="absolute bottom-6 right-8 text-5xl font-black tracking-widest text-white/10 select-none uppercase">
          FRONTSEAT
        </p>
      </div>

      {/* Page content */}
      <div className="max-w-2xl mx-auto px-8 pb-24">
        {/* Title block */}
        <div className="mt-8 mb-10">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-4 text-xl">
            🏠
          </div>
          <h1 className="text-3xl font-bold tracking-tight">FSBOARD</h1>
          <p className="text-zinc-500 text-sm mt-1">Frontseat Media workspace</p>
        </div>

        {/* Pages list */}
        <div>
          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-3">Pages</p>
          <div className="space-y-0.5">
            {pages.map(({ to, label, icon: Icon, external }) => (
              <button
                key={to}
                onClick={() =>
                  external
                    ? window.open(to, "_blank", "noopener,noreferrer")
                    : navigate(to)
                }
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors group text-left"
              >
                <Icon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
                <span className="flex-1">{label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
