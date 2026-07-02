import { useState, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { getDeadlines, getSixDayConfig, getSixDayDeadlines, getTickets } from "@/services/api";
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate, Navigate } from "react-router-dom";
import { FileText, Film, Users, LayoutDashboard, Menu, TrendingUp, Radio, Lightbulb, LogOut, Swords, Image, Kanban, Scissors, ClipboardList, Trophy, Ticket, Newspaper, Sparkles, ShieldCheck, FlaskConical, Eye } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { isRouteAllowed, canAccessPintu } from "@/lib/permissions";
import { PLAYBOOK_CONFIGS } from "@/lib/playbookExperimentConfig";
import { useNotifications } from "@/hooks/useNotifications";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";
import WrapView from "./pages/WrapView";
import PageDetail from "./pages/PageDetail";
import PagesView from "./pages/PagesView";
import PostsView from "./pages/PostsView";
import ReelsStage1View from "./pages/ReelsStage1View";
import GrowthView from "./pages/GrowthView";
import MainReelsView from "./pages/MainReelsView";
import IdeaEngine from "./pages/IdeaEngine";
import CompetitorIdeas from "./pages/CompetitorIdeas";
import PostIPsView from "./pages/PostIPsView";
import PipelineView from "./pages/PipelineView";
import ContentTracker from "./pages/ContentTracker";
import PostTracker from "./pages/PostTracker";
import SixDayTracker from "./pages/SixDayTracker";
import TeamPerformance from "./pages/TeamPerformance";
import ErrorBoundary from "./components/ErrorBoundary";
import Tickets from "./pages/Tickets";
import NewsFeed from "./pages/NewsFeed";
import RoleSelect from "./pages/RoleSelect";
import TeamRolesPage from "./pages/TeamRolesPage";
import ExperimentX from "./pages/ExperimentX";
import FsiCanvasHub from "./pages/FsiCanvas/FsiCanvasHub";
import FsiCanvasWorkspace from "./pages/FsiCanvas/FsiCanvasWorkspace";
import NotFound from "./pages/NotFound";
import { MonthlyWrapRoot, MonthlyWrapOpenButton } from "./components/MonthlyWrapHost";
import { stashWrapMonthFromUrl } from "@/lib/monthlyWrap";
import { RolePreviewBanner } from "./components/RolePreviewBanner";
import { RolePreviewRouteGuard } from "./components/RolePreviewRouteGuard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const queryClient = new QueryClient();

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const NAME_OVERRIDES: Record<string, string> = {
  "krishna.koushik@owledmedia.com": "Koushik",
};

function getFirstName(user: { user_metadata?: { full_name?: string; name?: string }; email?: string } | null): string {
  const email = user?.email || "";
  if (NAME_OVERRIDES[email]) return NAME_OVERRIDES[email];
  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  if (fullName) return fullName.split(" ")[0];
  return email.split("@")[0] || "";
}

const ANIMALS = [
  "\u{1F436}", "\u{1F431}", "\u{1F43B}", "\u{1F43C}", "\u{1F428}", "\u{1F437}",
  "\u{1F430}", "\u{1F98A}", "\u{1F981}", "\u{1F42F}", "\u{1F427}", "\u{1F438}",
  "\u{1F99C}", "\u{1F98E}", "\u{1F422}", "\u{1F98B}", "\u{1F41D}", "\u{1F433}",
  "\u{1F984}", "\u{1F435}", "\u{1F989}", "\u{1F43F}️", "\u{1F9A5}", "\u{1F9A7}",
];

function useAnimalAvatar(userId: string | undefined) {
  const key = `avatar_${userId}`;
  const [animal, setAnimal] = useState(() => {
    if (!userId) return ANIMALS[0];
    return localStorage.getItem(key) || "";
  });

  useEffect(() => {
    if (userId) {
      const saved = localStorage.getItem(key);
      if (saved) setAnimal(saved);
    }
  }, [userId, key]);

  const pickAnimal = (emoji: string) => {
    setAnimal(emoji);
    if (userId) localStorage.setItem(key, emoji);
  };

  return { animal, pickAnimal, hasChosen: !!animal };
}

function AnimalPicker({ userId }: { userId: string | undefined }) {
  const { animal, pickAnimal, hasChosen } = useAnimalAvatar(userId);
  const { role, user } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  const [panelTab, setPanelTab] = useState<"notifications" | "avatar">("notifications");
  const ref = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const navigate = useNavigate();

  const { data: taskDeadlines = [] } = useQuery<any[]>({
    queryKey: ["deadlines", role],
    queryFn: () => getDeadlines(role || undefined),
    enabled: !!role,
    refetchInterval: 60_000,
  });

  const { data: sixDayConfig } = useQuery<any>({
    queryKey: ["six-day-config"],
    queryFn: getSixDayConfig,
    enabled: !!user?.email,
    refetchInterval: 5 * 60_000,
  });

  const assignedEmail: string = (sixDayConfig?.data?.assigned_email || "").toLowerCase();
  const userEmail: string = (user?.email || "").toLowerCase();
  const isSixDayAssignee = !!userEmail && userEmail === assignedEmail;

  const { data: sixDayDeadlineData } = useQuery<any>({
    queryKey: ["six-day-deadlines-panel"],
    queryFn: getSixDayDeadlines,
    enabled: isSixDayAssignee,
    refetchInterval: 60_000,
  });

  const sixDayOverdue: any[] = isSixDayAssignee
    ? (sixDayDeadlineData?.data?.overdue_cycles || sixDayDeadlineData?.overdue_cycles || [])
    : [];

  const sixDayItems = sixDayOverdue.map((c: any) => ({
    id: `six-day-cycle-${c.cycle}`,
    idea_name: `6-Day Cycle ${c.cycle} — ${c.missing_count} IP${c.missing_count === 1 ? "" : "s"} unfilled`,
    content_type: "6-day",
    ips: (c.missing_pages || []).map((p: any) => p.name || p.handle).slice(0, 3).join(", "),
    idea_status: "overdue",
    deadline: c.deadline,
    _kind: "six-day",
  }));

  const deadlines: any[] = [...sixDayItems, ...taskDeadlines];

  useEffect(() => {
    if (!hasChosen) { setShowPanel(true); setPanelTab("avatar"); }
  }, [hasChosen]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowPanel(false);
    }
    if (showPanel) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPanel]);

  const TYPE_ICON: Record<string, string> = {
    comment: "💬", blocker: "🔴", update: "🟡", review_request: "👁", assignment: "🏷️",
  };

  function timeAgoShort(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setShowPanel(!showPanel); setPanelTab("notifications"); if (showPanel === false) markAllRead(); }}
        className="text-xl hover:scale-110 transition-transform cursor-pointer relative"
        title="Notifications & Avatar"
      >
        {animal || "\u{2753}"}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1 bg-violet-500 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>
      {showPanel && (
        <div className="absolute top-full right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-[100] w-80 overflow-hidden">
          <div className="flex border-b border-zinc-800">
            <button
              onClick={() => { setPanelTab("notifications"); markAllRead(); }}
              className={`flex-1 text-xs font-medium py-2.5 transition-colors ${panelTab === "notifications" ? "text-violet-400 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Notifications {unreadCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[9px] font-bold">{unreadCount}</span>}
            </button>
            <button
              onClick={() => setPanelTab("avatar")}
              className={`flex-1 text-xs font-medium py-2.5 transition-colors ${panelTab === "avatar" ? "text-violet-400 border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Avatar
            </button>
          </div>

          {panelTab === "notifications" && (
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-6">No notifications yet</p>
              ) : (
                <div className="p-2 space-y-1">
                  {notifications.map((n) => {
                    const hasLink = !!n.idea_id;
                    const trackerPath = n.tracker_type === "post" ? "/post-tracker" : "/content-tracker";
                    const href = hasLink ? `${trackerPath}?idea=${n.idea_id}` : null;
                    return (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (href) { navigate(href); setShowPanel(false); }
                        }}
                        className={`rounded-lg px-3 py-2.5 transition-colors ${hasLink ? "cursor-pointer hover:bg-zinc-700/50" : ""} ${!n.read ? "bg-violet-500/8 border border-violet-500/20" : "bg-zinc-800/40"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="text-sm mt-0.5 shrink-0">{TYPE_ICON[n.type] ?? "🔔"}</span>
                            <p className="text-[11px] text-zinc-300 leading-snug">{n.message}</p>
                          </div>
                          <span className="text-[9px] text-zinc-600 shrink-0">{timeAgoShort(n.created_at)}</span>
                        </div>
                        {n.idea_title && (
                          <p className="text-[10px] text-zinc-500 mt-1 truncate pl-6">📌 {n.idea_title} {hasLink && <span className="text-violet-500">→ open</span>}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {panelTab === "avatar" && (
            <div className="p-3">
              <p className="text-xs text-zinc-400 mb-2">Pick your buddy</p>
              <div className="grid grid-cols-6 gap-1">
                {ANIMALS.map((a) => (
                  <button
                    key={a}
                    onClick={() => { pickAnimal(a); setShowPanel(false); }}
                    className={`text-xl p-1.5 rounded-lg hover:bg-zinc-800 transition-colors ${animal === a ? "bg-violet-500/20 ring-1 ring-violet-500" : ""}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  external?: boolean;
};

const playbookNavItems: NavItem[] = (["bpb", "xf", "tech"] as const).map((id) => ({
  to: PLAYBOOK_CONFIGS[id].route,
  label: PLAYBOOK_CONFIGS[id].label,
  icon: FlaskConical,
}));

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/fsi-canvas", label: "FSI Canvas", icon: Sparkles },
  { to: "/content-tracker", label: "Reel Tracker", icon: ClipboardList },
  ...playbookNavItems,
  { to: "/post-tracker", label: "Post Tracker", icon: Image },
  { to: "/post-ips", label: "Post IPs", icon: Image },
  { to: "/six-day-tracker", label: "6-Day Tracker", icon: Radio },
  { to: "/team-performance", label: "Teams", icon: Trophy },
  { to: "/tickets", label: "Tickets", icon: Ticket },
  { to: "/news", label: "News Feed", icon: Newspaper },
  { to: "/growth", label: "Growth", icon: TrendingUp },
  { to: "/pages", label: "IP's", icon: Users },
  { to: "http://16.112.125.207:5173/", label: "Pintu", icon: Scissors, external: true },
];

function FsiCanvasMenuButton({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { role } = usePermissions();
  if (!isRouteAllowed(role, "/fsi-canvas")) return null;
  return (
    <button
      type="button"
      onClick={() => {
        navigate("/fsi-canvas");
        onNavigate?.();
      }}
      className="flex w-full items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-3 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/25 mb-2"
    >
      <Sparkles className="h-4 w-4 shrink-0" />
      FSI Canvas
    </button>
  );
}

function FsiCanvasQuickLink() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = usePermissions();
  if (location.pathname.startsWith("/fsi-canvas")) return null;
  if (!isRouteAllowed(role, "/fsi-canvas")) return null;
  return (
    <button
      type="button"
      onClick={() => navigate("/fsi-canvas")}
      className="fixed bottom-6 left-6 z-[60] flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/90 px-4 py-2.5 text-sm font-semibold text-amber-100 shadow-xl backdrop-blur hover:bg-amber-500/20"
    >
      <Sparkles className="h-4 w-4" />
      FSI Canvas
    </button>
  );
}

function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, signOut, ROLES, canUseRolePreview } = useAuth();
  const { can, role, isRolePreviewActive, setRolePreview } = usePermissions();
  const allowedNavItems = navItems.filter((item) =>
    item.external
      ? canAccessPintu(role, user?.email, { rolePreviewActive: isRolePreviewActive })
      : isRouteAllowed(role, item.to)
  );

  const { data: assignedTickets = [] } = useQuery<any[]>({
    queryKey: ["tickets-assigned-badge", (user?.email || "").toLowerCase()],
    queryFn: () => getTickets({ assigned_to_email: user?.email || "" }),
    enabled: !!user?.email,
    refetchInterval: 20_000,
  });

  const ticketsBadgeCount = assignedTickets.filter((t: any) => (t?.status || "") !== "resolved").length;

  return (
    <div className={`fixed left-5 z-50 ${isRolePreviewActive ? "top-14" : "top-5"}`}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm hover:bg-zinc-800 hover:border-violet-500/50"
          >
            <Menu className="w-5 h-5 text-white" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-zinc-950 border-zinc-800 p-0 flex flex-col">
          <div className="px-5 py-6 border-b border-zinc-800">
            <h1 className="text-lg font-bold text-white tracking-tight">FSBOARD</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Frontseat Media</p>
            {import.meta.env.DEV && (
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-amber-400">
                Local dev · port 8080
              </p>
            )}
          </div>
          <nav className="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
            <FsiCanvasMenuButton onNavigate={() => setOpen(false)} />
            {allowedNavItems.filter((item) => item.to !== "/fsi-canvas").map(({ to, label, icon: Icon, external }) => (
              <button
                key={to}
                onClick={() => {
                  if (external) {
                    window.open(to, "_blank", "noopener,noreferrer");
                  } else {
                    navigate(to);
                  }
                  setOpen(false);
                }}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors w-full text-left text-zinc-400 hover:text-white hover:bg-zinc-900"
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1">{label}</span>
                {label === "Tickets" && ticketsBadgeCount > 0 ? (
                  <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-[10px] font-black text-violet-100 flex items-center justify-center">
                    {ticketsBadgeCount}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="px-3 py-4 border-t border-zinc-800">
            <p className="px-3 text-xs text-zinc-600 truncate mb-2">{user?.email}</p>
            {canUseRolePreview && !isRolePreviewActive && (
              <div className="px-3 mb-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-1.5">
                  <Eye className="h-3 w-3" />
                  Preview role view
                </p>
                <Select onValueChange={setRolePreview}>
                  <SelectTrigger className="h-9 border-zinc-700 bg-zinc-900 text-xs text-zinc-200">
                    <SelectValue placeholder="Select role to preview…" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800">
                    {ROLES.map(({ value, label }) => (
                      <SelectItem key={value} value={value} className="text-sm">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {can('manage_team') && (
              <button
                onClick={() => { navigate("/team-roles"); setOpen(false); }}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors w-full text-left text-violet-400 hover:text-violet-300 hover:bg-zinc-900"
              >
                <ShieldCheck className="w-4 h-4" />
                Manage Team
              </button>
            )}
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors w-full text-left text-red-400 hover:text-red-300 hover:bg-zinc-900"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AppLayout() {
  const location = useLocation();
  const { user, signOut, isRolePreviewActive } = useAuth();
  const { role: layoutRole } = usePermissions();
  const sidebarNavItems = navItems.filter((item) =>
    item.external
      ? canAccessPintu(layoutRole, user?.email, { rolePreviewActive: isRolePreviewActive })
      : isRouteAllowed(layoutRole, item.to)
  );

  const { data: assignedTicketsSidebar = [] } = useQuery<any[]>({
    queryKey: ["tickets-assigned-badge-sidebar", (user?.email || "").toLowerCase()],
    queryFn: () => getTickets({ assigned_to_email: user?.email || "" }),
    enabled: !!user?.email,
    refetchInterval: 20_000,
  });

  const ticketsBadgeCount = assignedTicketsSidebar.filter((t: any) => (t?.status || "") !== "resolved").length;

  const isFullScreen =
    location.pathname === "/" ||
    location.pathname === "/wrap" ||
    location.pathname === "/content-tracker" ||
    location.pathname === "/post-tracker" ||
    location.pathname === "/post-ips" ||
    location.pathname === "/pipeline" ||
    location.pathname === "/six-day-tracker" ||
    location.pathname === "/team-performance" ||
    location.pathname === "/tickets" ||
    location.pathname === "/news" ||
    location.pathname.startsWith("/post-ips/") ||
    location.pathname.startsWith("/page/") ||
    location.pathname === "/team-roles" ||
    location.pathname.startsWith("/experiment-") ||
    location.pathname === "/fsi-canvas" ||
    location.pathname.startsWith("/fsi-canvas/") ||
    location.pathname === "/canvas";

  return (
    <>
      <RolePreviewRouteGuard />
      <RolePreviewBanner />
      {isFullScreen ? (
        <div className={`relative ${isRolePreviewActive ? "pt-11" : ""}`}>
          <HamburgerMenu />
          <div className={`fixed right-5 z-[60] flex items-center gap-2 sm:gap-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-3 sm:px-4 py-2 shadow-lg max-w-[min(100vw-1rem,480px)] flex-wrap justify-end ${isRolePreviewActive ? "top-14" : "top-5"}`}>
            <MonthlyWrapOpenButton />
            <AnimalPicker userId={user?.id} />
            <p className="text-sm text-zinc-400">
              {getGreeting()}, <span className="text-white font-medium">{getFirstName(user)}</span>
            </p>
            <button
              onClick={signOut}
              className="h-7 w-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5 text-zinc-400 hover:text-red-400" />
            </button>
          </div>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/wrap" element={<WrapView />} />
            <Route path="/content-tracker" element={<ContentTracker />} />
            <Route path="/post-tracker" element={<PostTracker />} />
            <Route path="/post-ips" element={<PostIPsView />} />
            <Route path="/post-ips/:pageId" element={<PageDetail />} />
            <Route path="/page/:pageId" element={<PageDetail />} />
            <Route path="/pipeline" element={<PipelineView />} />
            <Route path="/six-day-tracker" element={<SixDayTracker />} />
            <Route
              path="/team-performance"
              element={
                <ErrorBoundary title="Team performance crashed">
                  <TeamPerformance />
                </ErrorBoundary>
              }
            />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/news" element={<NewsFeed />} />
            <Route path="/ideas" element={<IdeaEngine />} />
            <Route path="/competitor-ideas" element={<CompetitorIdeas />} />
            <Route path="/team-roles" element={<TeamRolesPage />} />
            <Route path="/experiment-bpb" element={<ExperimentX playbookId="bpb" />} />
            <Route path="/experiment-xf" element={<ExperimentX playbookId="xf" />} />
            <Route path="/experiment-tech" element={<ExperimentX playbookId="tech" />} />
            <Route path="/experiment-x" element={<Navigate to="/experiment-bpb" replace />} />
            <Route path="/fsi-canvas" element={<FsiCanvasHub />} />
            <Route
              path="/fsi-canvas/:studyId"
              element={
                <ErrorBoundary title="FSI Canvas crashed">
                  <FsiCanvasWorkspace />
                </ErrorBoundary>
              }
            />
            <Route path="/canvas" element={<Navigate to="/fsi-canvas" replace />} />
          </Routes>
        </div>
      ) : (
        <div className={`flex min-h-screen bg-zinc-950 ${isRolePreviewActive ? "pt-11" : ""}`}>
          {/* Sidebar */}
          <aside className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
            <div className="px-5 py-5 border-b border-zinc-800">
              <h1 className="text-lg font-bold tracking-tight text-white">FSBOARD</h1>
              <p className="text-xs text-zinc-500 mt-0.5">Frontseat Media</p>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1">
              <NavLink
                to="/fsi-canvas"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors mb-2 border ${
                    isActive
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-100"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                  }`
                }
              >
                <Sparkles className="w-4 h-4" />
                FSI Canvas
              </NavLink>
              {sidebarNavItems.filter((item) => item.to !== "/fsi-canvas").map(({ to, label, icon: Icon, external }) => (
                external ? (
                  <a
                    key={to}
                    href={to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-zinc-500 hover:text-white hover:bg-zinc-900"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </a>
                ) : (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-violet-500/10 text-violet-400"
                          : "text-zinc-500 hover:text-white hover:bg-zinc-900"
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span className="flex-1">{label}</span>
                    {label === "Tickets" && ticketsBadgeCount > 0 ? (
                      <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-[10px] font-black text-violet-100 flex items-center justify-center">
                        {ticketsBadgeCount}
                      </span>
                    ) : null}
                  </NavLink>
                )
              ))}
            </nav>

            <div className="px-3 py-4 border-t border-zinc-800">
              <div className="flex items-center gap-2 px-3 mb-1">
                <AnimalPicker userId={user?.id} />
                <p className="text-sm text-zinc-400 truncate">
                  {getGreeting()}, <span className="text-white font-medium">{getFirstName(user)}</span>
                </p>
              </div>
              <p className="px-3 text-xs text-zinc-600 truncate mb-2">{user?.email}</p>
              <button
                onClick={signOut}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left text-red-400 hover:text-red-300 hover:bg-zinc-900"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto bg-zinc-950">
            <Routes>
              <Route path="/pages" element={<PagesView />} />
              <Route path="/posts" element={<PostsView />} />
              <Route path="/reels/stage1" element={<ReelsStage1View />} />
              <Route path="/reels/main" element={<MainReelsView />} />
              <Route path="/growth" element={<GrowthView />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      )}
    </>
  );
}

function AuthGate() {
  const { user, loading, domainError, needsRole } = useAuth();

  useEffect(() => {
    stashWrapMonthFromUrl();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (domainError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <h1 className="text-2xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-zinc-400">
            Only <span className="text-violet-400">@owledmedia.com</span> email addresses are allowed.
          </p>
          <p className="text-xs text-zinc-600">
            You signed in with a different email. Please try again with your Owled Media account.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (needsRole) {
    return <RoleSelect />;
  }

  return (
    <MonthlyWrapRoot>
      <FsiCanvasQuickLink />
      <AppLayout />
    </MonthlyWrapRoot>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
