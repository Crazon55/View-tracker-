// ─────────────────────────────────────────────────────────────────────────────
// FramerTopNav — top nav with dropdown mega-menus (per whiteboard):
//   Home · Content · Seeding · Team growth · Users(admin) + New button.
// Role-gated. Uses styles/framer.css.
// ─────────────────────────────────────────────────────────────────────────────
import { NavLink } from "react-router-dom";
import { ChevronDown, LogOut } from "lucide-react";
import { navForRoles, type NavMenu, type NavLeaf } from "@/config/appNav";
import { areaForRoute, canView, canSeeAnyNonSeeding, canonicalRole, type PersonAccess } from "@/lib/accessModel";
import { useAreaAccess } from "@/hooks/useAreaAccess";

/** Role-aware nav label overrides (e.g. Fulfillment sees "All Approved Deals"). */
function leafLabel(it: NavLeaf, role: string | null | undefined): string {
  if (it.to === "/seeding/deals") {
    const isFulfillment = String(role || "").split(",").map((r) => r.trim()).some((r) => canonicalRole(r) === "fulfillment");
    if (isFulfillment) return "All Approved Deals";
  }
  return it.label;
}

interface Props {
  roles?: string[];
  role?: string | null;
  userName?: string;
  greeting?: string;
  onSignOut?: () => void;
  right?: React.ReactNode; // optional extra controls (wrap button, animal picker, etc.)
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

export function FramerTopNav({ roles = [], role, userName, greeting, onSignOut, right }: Props) {
  const { personAccess } = useAreaAccess();
  const menus = navForRoles(roles, personAccess);

  return (
    <header className="f-topwrap">
      <div className="f-bar">
        <NavLink to="/" end className="f-brand" aria-label="Frontseat home">
          <img src="/frontseat-wordmark.svg" alt="Frontseat" className="f-brand-word" draggable={false} />
        </NavLink>

        <nav className="f-nav">
          {menus.map((m, i) =>
            "link" in m ? (
              <NavLink
                key={i}
                to={m.link}
                end={m.link === "/"}
                className={({ isActive }) => `f-trigger${isActive ? " active" : ""}`}
              >
                {m.label}
              </NavLink>
            ) : (
              <Dropdown key={i} menu={m} role={role} personAccess={personAccess} />
            )
          )}
        </nav>

        <div className="f-right">
          {right}
          {userName && (
            <span style={{ fontSize: 13, color: "var(--f-dim)" }}>
              {greeting}, <b style={{ color: "var(--f-ink)" }}>{userName}</b>
            </span>
          )}
          {onSignOut && (
            <button className="f-ghost" onClick={onSignOut} title="Sign out"
              style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8 }}>
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Dropdown({
  menu,
  role,
  personAccess,
}: {
  menu: Extract<NavMenu, { items: unknown }>;
  role?: string | null;
  personAccess?: PersonAccess | null;
}) {
  const items = filterNavLeaves(menu.items, role, personAccess);
  if (items.length === 0) return null;
  const wide = items.length > 4;
  return (
    <div className="f-item">
      <button className="f-trigger">
        {menu.label}
        <ChevronDown className="cv" size={13} />
      </button>
      <div className={`f-panel${wide ? " wide" : ""}`}>
        <div className="f-phead">{menu.label.toUpperCase()}</div>
        {items.map((it) => {
          const Icon = it.icon;
          const inner = (
            <>
              <span className="ic"><Icon size={15} strokeWidth={1.75} /></span>
              <span><b>{leafLabel(it, role)}</b>{it.desc && <span>{it.desc}</span>}</span>
            </>
          );
          return it.external ? (
            <a key={it.to} href={it.to} target="_blank" rel="noopener noreferrer" className="f-plink">{inner}</a>
          ) : (
            <NavLink key={it.to} to={it.to} className="f-plink">{inner}</NavLink>
          );
        })}
      </div>
    </div>
  );
}
