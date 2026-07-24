// Seeding sub-pages — approvals, pages, users.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { FramerPage, PageHeader } from "@/components/framer/Framer";
import { DealCardList } from "@/components/seeding/DealCardList";
import { PageCardList } from "@/components/seeding/PageCardList";
import { api } from "@/services/seeding/client";
import { getAllUserRoles } from "@/services/api";
import { PeopleAccessEditor } from "@/components/PeopleAccessEditor";
import { useAuth } from "@/contexts/AuthContext";
import { canonicalRole } from "@/lib/accessModel";
import type { SeedingDeal } from "@/services/seeding/mockData";

/* eslint-disable @typescript-eslint/no-explicit-any */

type SectionKey = "approvals" | "pages" | "users";

const META: Record<SectionKey, { title: string; lead: string; eyebrow: string }> = {
  approvals: {
    eyebrow: "SEEDING · APPROVALS",
    title: "Approval Queue",
    lead: "Select a brief, edit inline, or approve / reject from the editor.",
  },
  pages: {
    eyebrow: "SEEDING · PAGES",
    title: "Monetisable Pages",
    lead: "Deal-eligible Instagram pages — each page is its own card.",
  },
  users: {
    eyebrow: "SEEDING · ACCESS",
    title: "Users & Roles",
    lead: "Seeding workspace access, FSOS platform role, and business team mapping.",
  },
};

function sectionFromPath(pathname: string): SectionKey {
  const tail = pathname.replace(/^\/seeding\/?/, "").split("/")[0];
  if (tail && tail in META) return tail as SectionKey;
  return "approvals";
}

function GlassPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`seeding-surface ${className}`.trim()} style={{ padding: "20px 22px" }}>{children}</div>;
}

export default function SeedingSectionPage() {
  const { pathname } = useLocation();
  const section = sectionFromPath(pathname);
  const meta = META[section];
  const { role, actualRole } = useAuth();
  // Manage pages as the real admin even if role-preview is active on other seeding tabs.
  const isAdmin = String(actualRole || role || "")
    .split(",")
    .some((r) => canonicalRole(r.trim()) === "admin");

  const [deals, setDeals] = useState<SeedingDeal[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [fsosUsers, setFsosUsers] = useState<{ email: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDeals = useCallback(async () => {
    if (section === "approvals") {
      const { data } = await api.get<SeedingDeal[]>("/deals", { params: { admin_review_status: "Submitted" } });
      setDeals(data || []);
    }
  }, [section]);

  const loadPages = useCallback(async () => {
    const { data } = await api.get<any[]>("/pages", { params: { only_active: true } });
    setPages(data || []);
  }, []);

  useEffect(() => {
    setLoading(true);
    const loads: Promise<void>[] = [loadDeals().catch(() => {})];
    if (section === "pages") {
      loads.push(loadPages().catch(() => {}));
    }
    if (section === "users") {
      loads.push(api.get<any[]>("/users").then(({ data }) => setUsers(data || [])));
      // FSOS RBAC users/roles live on the main app (/api/v1/user-roles).
      loads.push(
        getAllUserRoles()
          .then((rows) => setFsosUsers(rows || []))
          .catch(() => setFsosUsers([])),
      );
    }
    Promise.all(loads).finally(() => setLoading(false));
  }, [section, loadDeals, loadPages]);

  const handleDealUpdated = (updated: SeedingDeal) => {
    if (section === "approvals" && updated.admin_review_status !== "Submitted") {
      setDeals((prev) => prev.filter((d) => d.deal_id !== updated.deal_id));
      return;
    }
    setDeals((prev) => prev.map((d) => (d.deal_id === updated.deal_id ? updated : d)));
  };

  const filteredDeals = useMemo(
    () => deals.filter((d) => d.admin_review_status === "Submitted"),
    [deals],
  );

  // Union of seeding users + FSOS users, keyed by email — so everyone shows up with
  // whichever role(s) they hold (seeding workspace role and/or FSOS platform role).
  const mergedUsers = useMemo(() => {
    const byEmail = new Map<string, any>();
    for (const u of users) {
      const key = String(u.email || "").trim().toLowerCase();
      if (!key) continue;
      byEmail.set(key, {
        name: u.name || "",
        email: u.email,
        seeding_role: u.role || null,
        fsos_role: null as string | null,
        team_name: u.team_name || "",
      });
    }
    for (const f of fsosUsers) {
      const key = String(f.email || "").trim().toLowerCase();
      if (!key) continue;
      const existing = byEmail.get(key);
      if (existing) {
        existing.fsos_role = f.role || null;
        if (!existing.name && f.name) existing.name = f.name;
      } else {
        byEmail.set(key, {
          name: f.name || "",
          email: f.email,
          seeding_role: null,
          fsos_role: f.role || null,
          team_name: "",
        });
      }
    }
    return [...byEmail.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [users, fsosUsers]);

  const handleFsosRoleSaved = useCallback((email: string, role: string | null, name: string) => {
    setFsosUsers((prev) => {
      const key = email.trim().toLowerCase();
      const others = prev.filter((u) => String(u.email).trim().toLowerCase() !== key);
      if (!role) return others;
      const existingName = prev.find((u) => String(u.email).trim().toLowerCase() === key)?.name || name;
      return [...others, { email, name: existingName, role }];
    });
  }, []);

  const dealEmpty = section === "approvals" ? "No briefs waiting for approval." : "Nothing here.";

  return (
    <FramerPage>
      <PageHeader eyebrow={meta.eyebrow} title={meta.title} lead={meta.lead} />

      {loading ? (
        <GlassPanel><p style={{ fontSize: 13, color: "var(--f-faint)" }}>Loading…</p></GlassPanel>
      ) : section === "pages" ? (
        <div style={{ marginTop: 24 }}>
          <PageCardList rows={pages} empty="No monetisable pages." canManage={isAdmin} onChanged={loadPages} />
        </div>
      ) : section === "users" ? (
        <div style={{ marginTop: 24 }}>
          <div className="f-eyebrow" style={{ marginBottom: 4 }}>PEOPLE · ACCESS</div>
          <p style={{ fontSize: 12, color: "var(--f-faint)", marginBottom: 14 }}>
            Pick a role to preset a person's access, then fine-tune their <b>View / Edit per tab</b> with “Edit access”.
          </p>
          {mergedUsers.length === 0 ? (
            <GlassPanel><p style={{ fontSize: 13, color: "var(--f-faint)" }}>No users.</p></GlassPanel>
          ) : (
            <PeopleAccessEditor people={mergedUsers} onRoleChanged={handleFsosRoleSaved} />
          )}
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <DealCardList
            rows={filteredDeals}
            empty={dealEmpty}
            onUpdated={handleDealUpdated}
            showApprovalActions={section === "approvals" && String(role || "").split(",").some((r) => canonicalRole(r.trim()) === "admin")}
          />
        </div>
      )}
    </FramerPage>
  );
}
