import { buildSeed } from "./seed";
import { ensureToolSlices, sixDayCyclesFor, monthOf } from "./seedTools";
import { resolveAccess, resolvePersonAccess, resolveRoleAccess, LOCKED_ROLE } from "./access";
import { navItemsForUser, canAccessPath, homePathForUser } from "./roles";
import { sixDayOverdue, growthRows, pageSummaries } from "./toolSelectors";

// Prefer someone who holds only that role (Jaskaran is Founder/Admin + CS).
const byRole = (db, role) => db.users.find((u) => u.roles.length === 1 && u.roles[0] === role) || db.users.find((u) => u.roles.includes(role));
const navIds = (db, u) => navItemsForUser(u, resolveAccess(db, u, null)).map((n) => n.id);

describe("tool seed", () => {
  const db = buildSeed();

  it("seeds every new slice", () => {
    ["sixDay", "growth", "tickets", "news", "newsState", "access"].forEach((k) => expect(db[k]).toBeDefined());
    expect(db.tickets.length).toBeGreaterThan(0);
    expect(db.news.items.length).toBeGreaterThan(20);
    db.ips.forEach((ip) => { expect(ip.handle).toBeTruthy(); expect(ip.stage).toBeGreaterThan(0); });
  });

  it("tops up a v2 db that predates the tools without touching existing data", () => {
    const old = buildSeed();
    ["sixDay", "growth", "tickets", "ticketSeq", "news", "newsState", "access"].forEach((k) => delete old[k]);
    old.ips.forEach((ip) => { delete ip.handle; delete ip.group; delete ip.stage; });
    const ideas = old.ideas.length;
    const migrated = ensureToolSlices(old);
    expect(migrated.ideas.length).toBe(ideas);
    expect(migrated.sixDay.entries.length).toBeGreaterThan(0);
    expect(migrated.access).toEqual({ roles: {}, people: {} });
  });

  it("6-day cycles cover the whole month", () => {
    const c = sixDayCyclesFor("2026-02");
    expect(c).toHaveLength(5);
    expect(c[4].end).toBe("2026-02-28");
  });

  it("growth views equal 6-day cycle sums", () => {
    const month = monthOf(db.meta.anchor);
    const six = pageSummaries(db, month).reduce((s, p) => s + p.cycleViewsSum, 0);
    const growth = growthRows(db).filter((r) => r.month === month).reduce((s, r) => s + r.views, 0);
    expect(growth).toBe(six);
  });

  it("flags an overdue cycle once a deadline has passed", () => {
    const anchor = db.meta.anchor;
    const anyPassed = sixDayCyclesFor(monthOf(anchor)).some((c) => anchor >= c.deadline);
    if (anyPassed) expect(sixDayOverdue(db, anchor).length).toBeGreaterThan(0);
  });
});

describe("access model", () => {
  const db = buildSeed();

  it("keeps each role's pre-existing workspace nav", () => {
    expect(navIds(db, byRole(db, "Designer"))).toEqual(expect.arrayContaining(["production", "tickets", "pintu", "growth"]));
    expect(navIds(db, byRole(db, "Designer"))).not.toContain("distribution");
    expect(navIds(db, byRole(db, "COC"))).toEqual(expect.arrayContaining(["command-room", "distribution", "performance", "six-day"]));
    expect(navIds(db, byRole(db, "Founder/Admin"))).toContain("users-roles");
    expect(navIds(db, byRole(db, "CS"))).not.toContain("users-roles");
  });

  it("highest level wins across roles; person overrides apply last", () => {
    const m = resolvePersonAccess(["Designer", "COC"], { growth: "none" });
    expect(m.production).toBe("edit");
    expect(m.distribution).toBe("edit");
    expect(m.growth).toBe("none");
  });

  it("never lets the locked admin role be downgraded", () => {
    expect(resolveRoleAccess(LOCKED_ROLE, { [LOCKED_ROLE]: { users_roles: "none" } }).users_roles).toBe("edit");
    expect(resolvePersonAccess([LOCKED_ROLE], { users_roles: "none" }).users_roles).toBe("edit");
  });

  it("role overrides change route gating", () => {
    const cs = byRole(db, "CS");
    const access = resolvePersonAccess(cs.roles, null, { CS: { news: "none" } });
    expect(canAccessPath(cs, "/news", access)).toBe(false);
    expect(canAccessPath(cs, "/tickets", access)).toBe(true);
  });

  it("a user with no areas never redirects to a page they cannot open", () => {
    const u = { roles: ["Designer"], streams: ["BO"] };
    const none = Object.fromEntries(Object.keys(resolvePersonAccess(u.roles)).map((k) => [k, "none"]));
    expect(navItemsForUser(u, none)).toHaveLength(0);
    expect(homePathForUser(u, none)).toBe("/");
  });

  it("preview resolves from the previewed role only", () => {
    const founder = byRole(db, "Founder/Admin");
    const m = resolveAccess(db, founder, "Editor");
    expect(m.users_roles).toBe("none");
    expect(m.production).toBe("edit");
  });
});
