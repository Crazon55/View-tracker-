import { useState, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { getDeadlines, getSixDayConfig, getSixDayDeadlines, getTickets } from "@/services/api";
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate, Navigate } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import { isRouteAllowed } from "@/lib/permissions";
import { useNotifications, NotificationProvider } from "@/hooks/useNotifications";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";
import WrapView from "./pages/WrapView";
import PostsView from "./pages/PostsView";
import ReelsStage1View from "./pages/ReelsStage1View";
import GrowthView from "./pages/GrowthView";
import MainReelsView from "./pages/MainReelsView";
import IdeaEngine from "./pages/IdeaEngine";
import IdeaEngineGallery from "./pages/IdeaEngineGallery";
import CompetitorIdeas from "./pages/CompetitorIdeas";
import PipelineView from "./pages/PipelineView";
import ContentTracker from "./pages/ContentTracker";
import PostTracker from "./pages/PostTracker";
import SixDayTracker from "./pages/SixDayTracker";
import ErrorBoundary from "./components/ErrorBoundary";
import Tickets from "./pages/Tickets";
import NewsFeed from "./pages/NewsFeed";
import RoleSelect from "./pages/RoleSelect";
import TeamRolesPage from "./pages/TeamRolesPage";
import ExperimentX from "./pages/ExperimentX";
import FsiCanvasHub from "./pages/FsiCanvas/FsiCanvasHub";
import FsiCanvasWorkspace from "./pages/FsiCanvas/FsiCanvasWorkspace";
import NotFound from "./pages/NotFound";
import { AppSidebar } from "./components/shell/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { WavyGridBackground } from "./components/shell/WavyGridBackground";
import { FsiCanvasFab } from "./components/shell/FsiCanvasFab";
import { DebugBoundary } from "./components/shell/DebugBoundary";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import SeedingOverview from "./pages/Seeding/SeedingOverview";
import SeedingBDDashboard from "./pages/Seeding/SeedingBDDashboard";
import SeedingApprovalQueue from "./pages/Seeding/SeedingApprovalQueue";
import { canonicalRole } from "./lib/accessModel";
import SeedingAllDeals from "./pages/Seeding/SeedingAllDeals";
import SeedingTeamwise from "./pages/Seeding/SeedingTeamwise";
import SeedingFulfillmentBoard from "./pages/Seeding/SeedingFulfillmentBoard";
import SeedingSubmitBrief from "./pages/Seeding/SeedingSubmitBrief";
import SeedingCampaignReports from "./pages/Seeding/SeedingCampaignReports";
import SeedingCampaignReportDetail from "./pages/Seeding/SeedingCampaignReportDetail";
import SeedingDealDetail from "./pages/Seeding/SeedingDealDetail";
import SeedingSectionPage from "./pages/Seeding/SeedingSectionPage";
import { SeedingPreviewBanner } from "./components/seeding/SeedingPreviewBanner";
import FramerHome from "./pages/FramerHome";
import { MonthlyWrapRoot, MonthlyWrapOpenButton } from "./components/MonthlyWrapHost";
import { stashWrapMonthFromUrl } from "@/lib/monthlyWrap";
import { RolePreviewBanner } from "./components/RolePreviewBanner";
import { RolePreviewPicker } from "./components/RolePreviewPicker";
import { AnchoredPanel } from "./components/AnchoredPanel";
import { RolePreviewRouteGuard } from "./components/RolePreviewRouteGuard";
import { RequireArea } from "./components/RequireArea";

const queryClient = new QueryClient();

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
  const buttonRef = useRef<HTMLButtonElement>(null);
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

  const TYPE_ICON: Record<string, string> = {
    comment: "💬", blocker: "🔴", update: "🟡", review_request: "👁", assignment: "🏷️",
    seeding_brief_submitted: "📋", seeding_brief_approved: "✅", seeding_fulfillment_update: "🔧",
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
    <div className="relative">
      <button
        ref={buttonRef}
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
      <AnchoredPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        anchorRef={buttonRef}
        width={320}
        maxHeight={460}
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl"
      >
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
                  const href = !hasLink
                    ? null
                    : n.tracker_type === "seeding"
                      ? `/seeding/deals/${n.idea_id}`
                      : `${n.tracker_type === "post" ? "/post-tracker" : "/content-tracker"}?idea=${n.idea_id}`;
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
      </AnchoredPanel>
    </div>
  );
}

/** BD sees a team-scoped dashboard; everyone else sees the admin Overview. */
function SeedingHome() {
  const { role } = usePermissions();
  const isBD = String(role || "").split(",").map((r) => r.trim()).some((r) => canonicalRole(r) === "bd");
  return isBD ? <SeedingBDDashboard /> : <SeedingOverview />;
}

// The FSOS Home ("Overall growth"). Roles scoped to Seeding only (BD, Fulfillment)
// have no non-seeding areas, so send them to Seeding. Content Strategists LAND on
// the Idea Engine — their home base — the first time they hit "/" each session, but
// can still open the Home dashboard afterwards (clicking Home no longer bounces).
// Everyone else gets the growth overview.
const CS_LANDED_KEY = "fsos-cs-landed";
function Home() {
  const { role } = usePermissions();
  const { canSeeContent } = useAreaAccess();
  const roles = String(role || "").split(",").map((r) => canonicalRole(r.trim()));
  const isCs = roles.includes("cs");
  // Read (don't mutate) during render; the one-shot flag is set in the effect below.
  const shouldLandCs = isCs && !sessionStorage.getItem(CS_LANDED_KEY);
  useEffect(() => {
    if (isCs) sessionStorage.setItem(CS_LANDED_KEY, "1");
  }, [isCs]);

  if (!canSeeContent()) return <Navigate to="/seeding" replace />;
  if (shouldLandCs) return <Navigate to="/idea-engine" replace />;
  return <FramerHome />;
}

function AppLayout() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { role: layoutRole } = usePermissions();

  const isFullScreen =
    location.pathname === "/" ||
    location.pathname === "/wrap" ||
    location.pathname === "/content-tracker" ||
    location.pathname === "/post-tracker" ||
    location.pathname === "/pipeline" ||
    location.pathname === "/six-day-tracker" ||
    location.pathname === "/growth" ||
    location.pathname === "/tickets" ||
    location.pathname === "/news" ||
    location.pathname === "/idea-engine" ||
    location.pathname === "/team-roles" ||
    location.pathname === "/content-distribution" ||
    location.pathname === "/production" ||
    location.pathname.startsWith("/experiment-") ||
    location.pathname === "/fsi-canvas" ||
    location.pathname.startsWith("/fsi-canvas/") ||
    location.pathname === "/canvas";

  const isSeeding = location.pathname.startsWith("/seeding");
  const seedingRoles = (layoutRole || "").split(",").map((s) => s.trim()).filter(Boolean);
  // FSI Canvas workspace (/fsi-canvas/:studyId) is a focused full-screen tool —
  // hide the global top nav so it isn't stacked above the canvas's own header.
  const isCanvasWorkspace = /^\/fsi-canvas\/[^/]+/.test(location.pathname);
  const isCanvasRoute = location.pathname.startsWith("/fsi-canvas");
  const showFsiCanvasFab = !isCanvasRoute && isRouteAllowed(layoutRole, "/fsi-canvas");

  return (
    <>
      <RolePreviewRouteGuard />
      <RolePreviewBanner />
      <SidebarProvider>
        {!isCanvasWorkspace && (
          <AppSidebar
            roles={seedingRoles}
            role={layoutRole}
            onSignOut={signOut}
            themeToggle={<ThemeToggleButton />}
            rolePreviewPicker={<RolePreviewPicker />}
            monthlyWrapButton={<MonthlyWrapOpenButton />}
            animalPicker={<AnimalPicker userId={user?.id} />}
          />
        )}
        <SidebarInset className="bg-transparent">
          {showFsiCanvasFab && <FsiCanvasFab />}
          <DebugBoundary>
            {isSeeding ? (
              <div>
                <SeedingPreviewBanner />
                <Routes>
                  <Route path="/seeding" element={<RequireArea area="seeding_overview"><SeedingHome /></RequireArea>} />
                  <Route path="/seeding/approvals" element={<RequireArea area="seeding_approvals"><SeedingApprovalQueue /></RequireArea>} />
                  <Route path="/seeding/deals" element={<RequireArea area="seeding_deals"><SeedingAllDeals /></RequireArea>} />
                  <Route path="/seeding/deals/:dealId" element={<RequireArea anyOf={["seeding_deals", "seeding_overview"]}><SeedingDealDetail /></RequireArea>} />
                  <Route path="/seeding/fulfillment" element={<RequireArea area="seeding_fulfillment"><SeedingFulfillmentBoard /></RequireArea>} />
                  <Route path="/seeding/campaign-reports" element={<RequireArea area="seeding_campaign_reports"><SeedingCampaignReports /></RequireArea>} />
                  <Route path="/seeding/campaign-reports/:dealId" element={<RequireArea area="seeding_campaign_reports"><SeedingCampaignReportDetail /></RequireArea>} />
                  <Route path="/seeding/submit" element={<RequireArea area="seeding_submit"><SeedingSubmitBrief /></RequireArea>} />
                  <Route path="/seeding/pages" element={<RequireArea area="seeding_pages"><SeedingSectionPage /></RequireArea>} />
                  <Route path="/seeding/teamwise" element={<RequireArea area="seeding_teamwise"><SeedingTeamwise /></RequireArea>} />
                  <Route path="/seeding/users" element={<RequireArea area="users_roles"><SeedingSectionPage /></RequireArea>} />
                </Routes>
              </div>
            ) : isFullScreen ? (
              <div className="relative">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/dashboard-old" element={<Dashboard />} />
                  <Route path="/wrap" element={<WrapView />} />
                  <Route path="/content-tracker" element={<ContentTracker />} />
                  <Route path="/post-tracker" element={<PostTracker />} />
                  <Route path="/pipeline" element={<PipelineView />} />
                <Route path="/six-day-tracker" element={<SixDayTracker />} />
                <Route path="/team-performance" element={<Navigate to="/" replace />} />
                <Route path="/tickets" element={<Tickets />} />
                  <Route path="/news" element={<NewsFeed />} />
                  <Route path="/idea-engine" element={<RequireArea area="idea_engine"><IdeaEngineGallery /></RequireArea>} />
                  <Route path="/ideas" element={<IdeaEngine />} />
                  <Route path="/competitor-ideas" element={<CompetitorIdeas />} />
                  <Route path="/team-roles" element={<TeamRolesPage />} />
                  <Route path="/content-distribution" element={<RequireArea area="playbook_bpb"><ExperimentX playbookId="bpb" /></RequireArea>} />
                  <Route path="/production" element={<RequireArea area="production"><ExperimentX playbookId="bpb" /></RequireArea>} />
                  <Route path="/experiment-bpb" element={<Navigate to="/content-distribution" replace />} />
                  <Route path="/experiment-xf" element={<RequireArea area="playbook_xf"><ExperimentX playbookId="xf" /></RequireArea>} />
                  <Route path="/experiment-tech" element={<RequireArea area="playbook_tech"><ExperimentX playbookId="tech" /></RequireArea>} />
                  <Route path="/experiment-x" element={<Navigate to="/content-distribution" replace />} />
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
                  <Route path="/growth" element={<GrowthView />} />
                </Routes>
              </div>
            ) : (
              <div className="min-h-screen">
                <main>
                  <Routes>
                    <Route path="/posts" element={<PostsView />} />
                    <Route path="/reels/stage1" element={<ReelsStage1View />} />
                    <Route path="/reels/main" element={<MainReelsView />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </main>
              </div>
            )}
          </DebugBoundary>
        </SidebarInset>
      </SidebarProvider>
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

  // New joiners land as pending — Admin assigns roles; no self-serve role pick.
  if (needsRole) {
    return <RoleSelect />;
  }

  return (
    <MonthlyWrapRoot>
      <AppLayout />
    </MonthlyWrapRoot>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider>
        <WavyGridBackgroundThemed />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <NotificationProvider>
              <AuthGate />
            </NotificationProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

function WavyGridBackgroundThemed() {
  const { theme } = useTheme();
  return <WavyGridBackground theme={theme} />;
}

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="f-ghost"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8 }}
    >
      {theme === "dark" ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
    </button>
  );
}

export default App;
