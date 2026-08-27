// ─────────────────────────────────────────────────────────────────────────────
// AppSidebar — collapsible left nav (CRM-style), replacing the old top bar
// (FramerTopNav). Same data source (NAV/navForRoles from config/appNav) and
// gating logic; built on the shadcn Sidebar primitive (components/ui/sidebar)
// for the collapse/expand + mobile-drawer plumbing.
// ─────────────────────────────────────────────────────────────────────────────
import { NavLink, useLocation } from "react-router-dom";
import { Home, LogOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTickets } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { navForRoles, type NavLeaf } from "@/config/appNav";
import { areaForRoute, canView, canSeeAnyNonSeeding, canonicalRole, type PersonAccess } from "@/lib/accessModel";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const NAME_OVERRIDES: Record<string, string> = {
  "krishna.koushik@owledmedia.com": "Koushik",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(user: { user_metadata?: { full_name?: string; name?: string }; email?: string } | null): string {
  const email = user?.email || "";
  if (NAME_OVERRIDES[email]) return NAME_OVERRIDES[email];
  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  if (fullName) return fullName.split(" ")[0];
  return email.split("@")[0] || "";
}

/** Role-aware nav label overrides (e.g. Fulfillment sees "All Approved Deals"). */
function leafLabel(it: NavLeaf, role: string | null | undefined): string {
  if (it.to === "/seeding/deals") {
    const isFulfillment = String(role || "").split(",").map((r) => r.trim()).some((r) => canonicalRole(r) === "fulfillment");
    if (isFulfillment) return "All Approved Deals";
  }
  return it.label;
}

function filterNavLeaves(
  items: NavLeaf[],
  role: string | null | undefined,
  personAccess?: PersonAccess | null,
): NavLeaf[] {
  if (!role) return items;
  return items.filter((it) => {
    const area = areaForRoute(it.to);
    if (area) return canView(role, area, undefined, personAccess);
    // external / unmapped — show only to roles that have some FSOS/content access.
    return canSeeAnyNonSeeding(role, undefined, personAccess);
  });
}

interface Props {
  roles?: string[];
  role?: string | null;
  onSignOut?: () => void;
  themeToggle?: React.ReactNode;
  rolePreviewPicker?: React.ReactNode;
  monthlyWrapButton?: React.ReactNode;
  animalPicker?: React.ReactNode;
}

export function AppSidebar({ roles = [], role, onSignOut, themeToggle, rolePreviewPicker, monthlyWrapButton, animalPicker }: Props) {
  const { personAccess } = useAreaAccess();
  const { user } = useAuth();
  const { state, isMobile } = useSidebar();
  const location = useLocation();
  const menus = navForRoles(roles, personAccess);
  const greeting = getGreeting();
  const userName = getFirstName(user);

  const { data: assignedTickets = [] } = useQuery<any[]>({
    queryKey: ["tickets-assigned-badge-sidebar", (user?.email || "").toLowerCase()],
    queryFn: () => getTickets({ assigned_to_email: user?.email || "" }),
    enabled: !!user?.email,
    refetchInterval: 20_000,
  });
  const ticketsBadgeCount = assignedTickets.filter((t: any) => (t?.status || "") !== "resolved").length;

  // Footer utility controls (theme / role-preview / wrap / avatar) need real width to
  // read — rather than shoehorn each into an icon-only collapsed state, they just show
  // once the sidebar is open (desktop) or always (mobile, which is a full-width Sheet).
  const showFooterControls = isMobile || state === "expanded";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {state === "collapsed" && !isMobile ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
            <SidebarTrigger style={{ color: "var(--f-dim)" }} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "4px 2px" }}>
            <NavLink to="/" end aria-label="Frontseat home" style={{ display: "flex", alignItems: "center", minWidth: 0, overflow: "hidden" }}>
              <img src="/frontseat-wordmark.svg" alt="Frontseat" className="f-brand-word" draggable={false} style={{ height: 14 }} />
            </NavLink>
            <SidebarTrigger style={{ color: "var(--f-dim)", flexShrink: 0 }} />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location.pathname === "/"} tooltip="Home">
                <NavLink to="/" end>
                  <Home size={16} strokeWidth={1.85} />
                  <span>Home</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {menus.map((m, i) => {
          if ("link" in m) return null; // "Home" already rendered above
          const items = filterNavLeaves(m.items, role, personAccess);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={i}>
              <SidebarGroupLabel>{m.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((it) => {
                    const Icon = it.icon;
                    const isActive = !it.external && (location.pathname === it.to || location.pathname.startsWith(it.to + "/"));
                    return (
                      <SidebarMenuItem key={it.to}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={leafLabel(it, role)}>
                          {it.external ? (
                            <a href={it.to} target="_blank" rel="noopener noreferrer">
                              <Icon size={16} strokeWidth={1.85} />
                              <span>{leafLabel(it, role)}</span>
                            </a>
                          ) : (
                            <NavLink to={it.to}>
                              <Icon size={16} strokeWidth={1.85} />
                              <span>{leafLabel(it, role)}</span>
                            </NavLink>
                          )}
                        </SidebarMenuButton>
                        {it.to === "/tickets" && ticketsBadgeCount > 0 && (
                          <SidebarMenuBadge>{ticketsBadgeCount}</SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        {showFooterControls && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {themeToggle}
              {monthlyWrapButton}
              {animalPicker}
            </div>
            {rolePreviewPicker}
            {userName && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 4, borderTop: "1px solid var(--f-line)" }}>
                <span style={{ fontSize: 12, color: "var(--f-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {greeting}, <b style={{ color: "var(--f-ink)" }}>{userName}</b>
                </span>
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    title="Sign out"
                    className="f-ghost"
                    style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, flexShrink: 0 }}
                  >
                    <LogOut size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {!showFooterControls && onSignOut && (
          <button
            onClick={onSignOut}
            title="Sign out"
            className="f-ghost"
            style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 8, margin: "0 auto" }}
          >
            <LogOut size={15} />
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
