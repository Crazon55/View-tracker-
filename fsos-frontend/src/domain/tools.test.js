import { sixDayCyclesFor, monthOf, shiftMonth, ipMeta } from "./sixDay";
import { resolveAccess, resolvePersonAccess, resolveRoleAccess, LOCKED_ROLE } from "./access";
import { navItemsForUser, canAccessPath, homePathForUser } from "./roles";
import { sixDayOverdue, growthRows, pageSummaries, trackerGroup } from "./toolSelectors";

// A workspace the size of a postage stamp, in the shape `GET /api/workspace` returns.
// These tests are about the rules, not the data, so the fixture is written out rather
// than generated — when one fails you can see the whole world it ran in.
const ips = [
  { id: "ip-1", code: "Bizz", name: "BizzIndia", handle: "bizzindia", group: "bizz", stage: 3, active: true },
  { id: "ip-2", code: "SC", name: "StartupCoded", handle: "startupcoded", group: "founders", stage: 2, active: true },
  { id: "ip-3", code: "OLD", name: "Paused IP", handle: "", group: "news", stage: 1, active: false },
];

const users = [
  { id: "u-admin", name: "Admin", roles: ["Founder/Admin"], streams: ["BO", "HPN"] },
  { id: "u-cs", name: "CS", roles: ["CS"], streams: ["BO", "HPN"] },
  { id: "u-coc", name: "COC", roles: ["COC"], streams: ["BO"] },
  { id: "u-designer", name: "Designer", roles: ["Designer"], streams: ["BO"] },
];

const db = {
  meta: { anchor: "2026-09-23" },
  ips,
  users,
  access: { roles: {}, people: {} },
  sixDay: {
    entries: [
      { month: "2026-09", cycle: 1, ipId: "ip-1", views: 120000, reelPct: 60, postPct: 40 },
      { month: "2026-09", cycle: 2, ipId: "ip-1", views: 80000, reelPct: 50, postPct: 50 },
      { month: "2026-09", cycle: 1, ipId: "ip-2", views: 40000, reelPct: 70, postPct: 30 },
    ],
    topContent: [{ id: "t-1", month: "2026-09", cycle: 1, ipId: "ip-1", link: "https://x", views: 9000, type: "reel" }],
    actuals: [{ month: "2026-09", ipId: "ip-1", actualViews: 205000 }],
    config: { assigneeId: "u-coc" },
  },
  growth: { followers: [{ month: "2026-09", ipId: "ip-1", followersGained: 3100 }] },
};

const byId = (id) => users.find((u) => u.id === id);
const navIds = (u) => navItemsForUser(u, resolveAccess(db, u, null)).map((n) => n.id);

describe("6-day cycles", () => {
  it("cover the whole month, short February included", () => {
    const feb = sixDayCyclesFor("2026-02");
    expect(feb).toHaveLength(5);
    expect(feb[0].start).toBe("2026-02-01");
    expect(feb[4].end).toBe("2026-02-28");
  });

  it("run to the 31st in a long month", () => {
    expect(sixDayCyclesFor("2026-03")[4].end).toBe("2026-03-31");
  });

  it("monthOf and shiftMonth agree across a year boundary", () => {
    expect(monthOf("2026-01-14")).toBe("2026-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("tool selectors", () => {
  it("growth views equal the 6-day cycle sums", () => {
    const six = pageSummaries(db, "2026-09").reduce((s, p) => s + p.cycleViewsSum, 0);
    const growth = growthRows(db).filter((r) => r.month === "2026-09").reduce((s, r) => s + r.views, 0);
    expect(growth).toBe(six);
    expect(six).toBe(240000);
  });

  it("carries followers through even for a month with cycle data", () => {
    const row = growthRows(db).find((r) => r.ipId === "ip-1" && r.month === "2026-09");
    expect(row.followersGained).toBe(3100);
    expect(row.reelViews).toBe(112000);
  });

  it("flags active IPs with nothing filled once a deadline has passed", () => {
    // On the 23rd, cycles 1–3 are past their deadline. Both active IPs filled cycle 1,
    // so it isn't overdue — only cycles with someone actually missing are reported.
    const overdue = sixDayOverdue(db, "2026-09-23");
    expect(overdue.map((c) => c.cycle)).toEqual([2, 3]);
    expect(overdue.find((c) => c.cycle === 2).missing.map((i) => i.id)).toEqual(["ip-2"]);
    expect(overdue.find((c) => c.cycle === 3).missingCount).toBe(2);   // nobody filled it
    // The paused IP is never chased.
    expect(overdue.every((c) => c.missing.every((ip) => ip.active))).toBe(true);
  });

  it("puts a paused IP in Inactive whatever its group says", () => {
    expect(trackerGroup(ips[0])).toBe("bizz");
    expect(trackerGroup(ips[2])).toBe("inactive");
  });

  it("falls back to a derived handle for an IP nobody has configured", () => {
    expect(ipMeta(ips[2]).handle).toBe("old");
    expect(ipMeta({ code: "IFC 2" }).handle).toBe("ifc2");
    expect(ipMeta({}).stage).toBe(1);
  });
});

describe("access model", () => {
  it("keeps each role's workspace nav", () => {
    expect(navIds(byId("u-designer"))).toEqual(expect.arrayContaining(["production", "pintu", "growth"]));
    expect(navIds(byId("u-designer"))).not.toContain("distribution");
    expect(navIds(byId("u-coc"))).toEqual(expect.arrayContaining(["command-room", "distribution", "performance", "six-day"]));
    expect(navIds(byId("u-admin"))).toContain("users-roles");
    expect(navIds(byId("u-cs"))).not.toContain("users-roles");
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
    const cs = byId("u-cs");
    const access = resolvePersonAccess(cs.roles, null, { CS: { news: "none" } });
    expect(canAccessPath(cs, "/news", access)).toBe(false);
    expect(canAccessPath(cs, "/six-day-tracker", access)).toBe(true);
  });

  it("a user with no areas never redirects to a page they cannot open", () => {
    const u = { roles: ["Designer"], streams: ["BO"] };
    const none = Object.fromEntries(Object.keys(resolvePersonAccess(u.roles)).map((k) => [k, "none"]));
    expect(navItemsForUser(u, none)).toHaveLength(0);
    expect(homePathForUser(u, none)).toBe("/");
  });

  it("preview resolves from the previewed role only", () => {
    const m = resolveAccess(db, byId("u-admin"), "Editor");
    expect(m.users_roles).toBe("none");
    expect(m.production).toBe("edit");
  });
});
