import React, { useState } from "react";
import { NavLink, Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { useDemo } from "../../domain/store";
import { useUI } from "../idea/IdeaModalProvider";
import { searchIdeas, notificationOpenTarget } from "../../domain/selectors";
import { canAccessPath, canCreateIdea, homePathForUser, navItemsForUser, streamFilterForUser } from "../../domain/roles";
import { resolveAccess, isAwaitingAccess, PREVIEW_ROLES } from "../../domain/access";
import { sixDayOverdue } from "../../domain/toolSelectors";
import { Avatar } from "../common/badges";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../ui/alert-dialog";

function NavItem({ n, badge }) {
  const Icon = Icons[n.icon] || Icons.Circle;
  const base = "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors";
  if (n.external) {
    return (
      <a href={n.path} target="_blank" rel="noopener noreferrer" data-testid={`nav-${n.id}`}
        className={cn(base, "text-stone-600 hover:bg-[#EFEBE4]/60 hover:text-stone-900")}>
        <Icon className="h-4 w-4" />{n.label}<Icons.ArrowUpRight className="ml-auto h-3.5 w-3.5 text-stone-400" />
      </a>
    );
  }
  return (
    <NavLink to={n.path} end={n.path === "/"} data-testid={`nav-${n.id}`}
      className={({ isActive }) => cn(base,
        isActive ? "bg-[#EFEBE4] text-stone-900 font-medium border-l-[3px] border-stone-800 pl-[9px]" : "text-stone-600 hover:bg-[#EFEBE4]/60 hover:text-stone-900"
      )}>
      <Icon className="h-4 w-4" />
      {n.label}
      {badge > 0 && <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-violet-600 px-1 text-[9px] font-semibold text-white" data-testid={`nav-badge-${n.id}`}>{badge}</span>}
    </NavLink>
  );
}

function Sidebar() {
  const { db, actingUser, gateUser, access } = useDemo();
  const items = navItemsForUser(gateUser, access);
  // Unread-style badge: open tickets assigned to the acting user.
  const myTickets = db.tickets.filter((t) => t.assigneeId === actingUser.id && t.status !== "resolved").length;
  const sections = [...new Set(items.map((n) => n.section))];
  return (
    <aside className="w-60 shrink-0 border-r border-[#E6E1D8] bg-[#F5F2EC] flex flex-col" data-testid="sidebar">
      <div className="h-14 flex items-center gap-2 px-5 border-b border-[#E6E1D8]">
        <div className="h-7 w-7 rounded-md bg-stone-900 text-white grid place-items-center font-serif text-sm">F</div>
        <div className="leading-tight">
          <div className="font-serif text-base text-stone-900">FSOS</div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono">Frontseat OS</div>
        </div>
      </div>
      <nav className="flex-1 py-3 px-2 overflow-y-auto fsos-scroll">
        {sections.map((s, i) => (
          <div key={s} className={cn("space-y-0.5", i > 0 && "mt-4")}>
            {sections.length > 1 && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400 font-mono">{s}</div>}
            {items.filter((n) => n.section === s).map((n) => <NavItem key={n.id} n={n} badge={n.id === "tickets" ? myTickets : 0} />)}
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-[#E6E1D8]">
        <NavLink to="/help" data-testid="nav-help" className="flex items-center gap-2 text-xs text-stone-500 hover:text-stone-900 transition-colors">
          <Icons.HelpCircle className="h-3.5 w-3.5" /> Walkthrough & Help
        </NavLink>
      </div>
    </aside>
  );
}

function GlobalSearch() {
  const { db } = useDemo();
  const { openIdea, streamFilter } = useUI();
  const [q, setQ] = useState("");
  const results = searchIdeas(db, q, streamFilter);
  return (
    <div className="relative w-72">
      <Icons.Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
      <Input data-testid="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search idea, ID, IP, batch…" className="pl-8 h-9 bg-white" />
      {q && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-stone-200 bg-white shadow-lg overflow-hidden">
          {results.map((r) => (
            <button key={r.id} data-testid={`search-result-${r.id}`} onClick={() => { openIdea(r.id); setQ(""); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50">
              <span className="font-mono text-[10px] text-stone-400">{r.code}</span>
              <span className="truncate text-stone-800">{r.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const { db, actions, actingUser, gateUser, today } = useDemo();
  const { openCreate, streamFilter, setStreamFilter, openIdea } = useUI();
  const navigate = useNavigate();
  // Notifications without a userId are team-wide; ticket notifications target one person.
  const mine = db.notifications.filter((n) => !n.userId || n.userId === actingUser.id);
  // 6-day overdue alerts go only to the configured tracker assignee (computed live, never stored).
  const overdue = db.sixDay.config.assigneeId === actingUser.id ? sixDayOverdue(db, today) : [];
  const unread = mine.filter((n) => !n.read).length + overdue.length;
  const openNotification = (n) => {
    actions.markNotificationRead(n.id);
    if (n.ticketId) { navigate(`/tickets?ticket=${n.ticketId}`); return; }
    const { ideaId, tab } = notificationOpenTarget(db, n);
    if (ideaId) openIdea(ideaId, { tab });
  };

  return (
    <header className="h-14 shrink-0 border-b border-[#E6E1D8] bg-white/90 backdrop-blur-md flex items-center gap-4 px-4 sticky top-0 z-40">
      <GlobalSearch />
      <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-0.5">
        {["All", "BO", "HPN"].map((s) => (
          <button key={s} data-testid={`stream-toggle-${s}`} onClick={() => setStreamFilter(s)}
            className={cn("px-3 py-1 text-xs font-medium rounded transition-colors", streamFilter === s ? "bg-white shadow-sm text-stone-900" : "text-stone-500 hover:text-stone-800")}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex-1" />

      {canCreateIdea(gateUser) && (
        <Button size="sm" data-testid="create-idea-btn" onClick={() => openCreate()} className="h-9 bg-stone-900 hover:bg-stone-800">
          <Icons.Plus className="h-4 w-4 mr-1" /> Create Idea
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button data-testid="notifications-btn" className="relative rounded-md p-2 hover:bg-stone-100 transition-colors">
            <Icons.Bell className="h-4.5 w-4.5 text-stone-600" />
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-[#C0512F] text-[9px] text-white grid place-items-center">{unread}</span>}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">In-app notifications
            <button className="text-[11px] text-stone-500 hover:text-stone-900" onClick={() => actions.markNotificationsRead()}>Mark all read</button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {overdue.map((c) => (
            <DropdownMenuItem key={`sd-${c.cycle}`} onClick={() => navigate("/six-day-tracker")} className="flex flex-col items-start gap-0.5 cursor-pointer" data-testid={`notif-six-day-${c.cycle}`}>
              <span className="text-xs text-amber-900"><Icons.Timer className="mr-1 inline h-3 w-3" />6-Day cycle {c.cycle} — {c.missingCount} IP{c.missingCount === 1 ? "" : "s"} unfilled</span>
              <span className="text-[10px] text-amber-700">overdue · {c.missing.slice(0, 3).map((ip) => ip.code).join(", ")}{c.missingCount > 3 ? "…" : ""}</span>
            </DropdownMenuItem>
          ))}
          {mine.length === 0 && overdue.length === 0 && <div className="px-3 py-4 text-xs text-stone-500">No notifications.</div>}
          {mine.slice(0, 8).map((n) => (
            <DropdownMenuItem key={n.id} onClick={() => openNotification(n)} className="flex flex-col items-start gap-0.5 cursor-pointer">
              <span className="text-xs text-stone-800">{n.ticketId && <Icons.Ticket className="mr-1 inline h-3 w-3 text-violet-600" />}{n.text}</span>
              <span className="text-[10px] text-stone-400">{n.read ? "read" : "new"}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <RoleSwitcher />
    </header>
  );
}

function RoleSwitcher() {
  const { db, actions, actingUser } = useDemo();
  const { setStreamFilter } = useUI();
  const navigate = useNavigate();
  const actAs = (u) => {
    actions.setActingUser(u.id);
    setStreamFilter(streamFilterForUser(u));
    navigate(homePathForUser(u, resolveAccess(db, u, null)));
    toast.success(`Acting as ${u.name}`, { description: u.roles.join(" · ") || "Pending access" });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button data-testid="role-switcher" className="flex items-center gap-2 rounded-md border border-stone-200 bg-white pl-1 pr-2 py-1 hover:border-stone-300 transition-colors">
          <Avatar user={actingUser} size={26} />
          <span className="text-left leading-tight">
            <span className="block text-xs font-medium text-stone-900">{actingUser.name}</span>
            <span className="block text-[10px] text-stone-500">{actingUser.roles[0] || "Pending access"}</span>
          </span>
          <Icons.ChevronDown className="h-3.5 w-3.5 text-stone-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Demo — act as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {db.users.filter((u) => u.active).map((u) => (
          <DropdownMenuItem key={u.id} data-testid={`act-as-${u.id}`} onSelect={() => actAs(u)} className="gap-2 cursor-pointer">
            <Avatar user={u} size={24} />
            <span className="flex-1">
              <span className="block text-xs">{u.name}</span>
              <span className="block text-[10px] text-stone-500">{u.roles.join(", ") || "Pending access"}</span>
            </span>
            {u.id === db.actingUserId && <Icons.Check className="h-3.5 w-3.5 text-emerald-600" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[10px] text-stone-400">Role switching demonstrates workflows — not production authentication.</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RoleGate() {
  const { gateUser, access, previewRole } = useDemo();
  const location = useLocation();
  if (!previewRole && isAwaitingAccess(gateUser)) return <PendingAccess />;
  if (!navItemsForUser(gateUser, access).some((n) => !n.external) && location.pathname !== "/help") return <PendingAccess noAreas />;
  if (!canAccessPath(gateUser, location.pathname, access)) {
    return <Navigate to={homePathForUser(gateUser, access)} replace />;
  }
  return <Outlet />;
}

// New joiners (no role yet) and people with every area switched off land here.
function PendingAccess({ noAreas }) {
  const { actingUser } = useDemo();
  return (
    <div className="grid min-h-full place-items-center p-6" data-testid="pending-access">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-800"><Icons.Hourglass className="h-5 w-5" /></div>
        <h1 className="font-serif text-3xl text-stone-900">Welcome, {actingUser.name.split(" ")[0]}</h1>
        <p className="text-sm leading-relaxed text-stone-600">
          {noAreas
            ? <>Your roles don't currently open any area of FSOS. An admin can grant access in <b>Users &amp; Roles</b>.</>
            : <>Your account is <span className="font-medium text-amber-800">pending access</span>. An admin will assign your role (for example CS, Editor or COC) before you can use FSOS.</>}
        </p>
        <p className="text-xs text-stone-400">Demo: use the "act as" switcher (top right) to become an admin and assign a role in Users &amp; Roles.</p>
      </div>
    </div>
  );
}

function PreviewBanner() {
  const { previewRole, setPreviewRole, actingUser } = useDemo();
  const navigate = useNavigate();
  if (!previewRole) return null;
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-sm text-amber-950" data-testid="preview-banner">
      <Icons.Eye className="h-4 w-4 text-amber-700" />
      <span>Previewing as <b>{previewRole}</b><span className="text-amber-800/70"> · signed in as {actingUser.name}</span></span>
      <select value={previewRole} onChange={(e) => setPreviewRole(e.target.value)} className="h-7 rounded-md border border-amber-300 bg-white/70 px-2 text-xs">
        {PREVIEW_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <button onClick={() => { setPreviewRole(null); navigate("/users-roles"); }} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs hover:bg-amber-200" data-testid="exit-preview">
        <Icons.X className="h-3.5 w-3.5" /> Exit preview
      </button>
    </div>
  );
}

export default function AppShell() {
  const { actions } = useDemo();
  return (
    <div className="flex h-screen overflow-hidden bg-[#FAF8F5]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <PreviewBanner />
        <TopBar />
        <main className="flex-1 overflow-auto fsos-scroll" data-testid="main-content">
          <RoleGate />
        </main>
      </div>
      <DemoClock onReset={actions.resetDemo} />
    </div>
  );
}

function DemoClock({ onReset }) {
  const { today } = useDemo();
  return (
    <div className="fixed bottom-3 right-3 z-30 flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 backdrop-blur px-3 py-1.5 shadow-sm text-[11px] text-stone-600" data-testid="demo-clock">
      <Icons.Clock className="h-3.5 w-3.5 text-stone-400" />
      <span>Demo today (IST): <span className="font-mono text-stone-800">{today}</span></span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button data-testid="reset-demo-btn" className="ml-1 rounded-full p-1 hover:bg-stone-100"><Icons.RotateCcw className="h-3.5 w-3.5" /></button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the demo?</AlertDialogTitle>
            <AlertDialogDescription>This clears all local edits, assignments, comments, placements and metrics, and regenerates fresh seed data with today's date.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="reset-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="reset-confirm" onClick={onReset} className="bg-[#C0512F] hover:bg-[#a8432593]">Reset demo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
