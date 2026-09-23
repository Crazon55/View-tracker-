// Every selector, run against a brand-new database.
//
// The demo seed always had ideas, publications and settings in it, so nothing was ever
// asked what it does with none of them. The real database starts empty — no ideas, no
// publications, no categories, and an `app_settings` row nobody has filled in yet — and
// the first person to open FSOS sees exactly that. A selector that assumes there's at
// least one of something crashes the whole page, so each one is called here with
// nothing to work with.
//
// This is the test that would have caught `sixDayCycles` splitting a null cycle anchor.
import * as S from "./selectors";
import * as T from "./toolSelectors";

// The shape `GET /api/workspace` returns for a database with people and IPs loaded
// (they come from the snoboard import) and nothing else — which is where we start.
const empty = () => ({
  meta: { anchor: "2026-09-23", source: "api" },
  actingUserId: "u-1",
  settings: {
    // What the backend sends when app_settings has never been edited.
    thresholds: { good: 100, average: 50 },
    baselineSample: 5,
    cycleAnchor: null,
    spacingMinutes: null,
    approverBoId: null,
    shortFormLeadId: null,
    hpnBypassUserIds: [],
    exceptionApproverIds: [],
    sixDayAssigneeId: null,
  },
  users: [{ id: "u-1", name: "Someone", initials: "S", color: "#000", roles: ["Founder/Admin"], streams: ["BO", "HPN"], skills: [], active: true }],
  ips: [{ id: "ip-1", code: "Bizz", name: "BizzIndia", handle: "bizzindia", hex: "#000", active: true, group: "bizz", stage: 3, floors: { posts: 0, reels: 0 }, ranges: {}, menu: [], boTarget: null, perfTarget: { reel: null, post: null, note: "" }, spacingMinutes: null }],
  categories: [],
  batches: [],
  ideas: [],
  versions: [],
  placements: [],
  publications: [],
  snapshots: [],
  comments: [],
  activity: [],
  notifications: [],
  sixDay: { entries: [], topContent: [], actuals: [], config: { assigneeId: null } },
  growth: { followers: [] },
  newsState: { feedback: {}, rules: [], saved: [], savedItems: {} },
  access: { roles: {}, people: {} },
});

const user = () => empty().users[0];

// Every selector, with the arguments the screens actually pass. Anything that throws
// here takes a page down with it in the browser.
const CALLS = [
  ["ipById", (db) => S.ipById(db, "nope")],
  ["userById", (db) => S.userById(db, "nope")],
  ["ideaById", (db) => S.ideaById(db, "nope")],
  ["versionsOf", (db) => S.versionsOf(db, "nope")],
  ["activePlacementOf", (db) => S.activePlacementOf(db, "nope")],
  ["publicationOf", (db) => S.publicationOf(db, "nope")],
  ["snapshotOf", (db) => S.snapshotOf(db, "nope")],
  ["bankSummary", (db) => S.bankSummary(db)],
  ["bankStockDays", (db) => S.bankStockDays(db)],
  ["networkStatus", (db) => S.networkStatus(db, db.meta.anchor)],
  ["readyBankVersions", (db) => S.readyBankVersions(db)],
  ["targetFor", (db) => S.targetFor(db, "ip-1", "Reel")],
  ["recentBaseline", (db) => S.recentBaseline(db, "ip-1", "Reel", null, db.settings.baselineSample)],
  ["sixDayCycles", (db) => S.sixDayCycles(db)],
  ["cyclePerIp", (db) => S.cyclePerIp(db)],
  ["captureTasks", (db) => S.captureTasks(db, db.meta.anchor)],
  ["yesterdayCohort", (db) => S.yesterdayCohort(db, db.meta.anchor)],
  ["myWork", (db) => S.myWork(db, user())],
  ["productionIssues", (db) => S.productionIssues(db, db.meta.anchor)],
  ["searchIdeas", (db) => S.searchIdeas(db, "anything")],
  ["candidateGaps", (db) => S.candidateGaps(db, db.meta.anchor)],
  ["sameDayConflict", (db) => S.sameDayConflict(db, "nope", db.meta.anchor)],
  ["sixDayMonth", (db) => T.sixDayMonth(db, "2026-09", db.meta.anchor)],
  ["sixDayOverdue", (db) => T.sixDayOverdue(db, db.meta.anchor)],
  ["pageSummaries", (db) => T.pageSummaries(db, "2026-09")],
  ["growthRows", (db) => T.growthRows(db)],
  ["trackerGroup", (db) => T.trackerGroup(db.ips[0])],
  ["visibleIps", (db) => S.visibleIps(db)],
];

describe("a brand-new database", () => {
  CALLS.forEach(([name, call]) => {
    it(`${name} survives it`, () => {
      expect(() => call(empty())).not.toThrow();
    });
  });

  it("six-day cycles still cover today when no anchor is configured", () => {
    const db = empty();
    const cycles = S.sixDayCycles(db);
    expect(cycles.length).toBeGreaterThan(0);
    const last = cycles[cycles.length - 1];
    expect(last.start <= db.meta.anchor && db.meta.anchor <= last.end).toBe(true);
  });

  it("an anchor, once set, is what the cycles are built from", () => {
    const db = empty();
    db.settings.cycleAnchor = "2026-09-01";
    const cycles = S.sixDayCycles(db, 6);
    expect(cycles[0].start).toBe("2026-09-01");
  });

  it("shows only the IPs being posted to, not the whole imported roster", () => {
    // 48 pages came across in the import and 13 are active. Listing all of them buries
    // the roster in rows reading "0P · 0R · met", which is what the team saw on day one.
    const db = empty();
    db.ips = [
      { id: "on-1", code: "A", active: true, floors: { posts: 0, reels: 0 } },
      { id: "off-1", code: "B", active: false, floors: { posts: 0, reels: 0 } },
      { id: "off-2", code: "C", active: false, floors: { posts: 0, reels: 0 } },
    ];
    expect(S.visibleIps(db).map((i) => i.id)).toEqual(["on-1"]);
    expect(S.networkStatus(db, db.meta.anchor).map((r) => r.ip.id)).toEqual(["on-1"]);
  });

  it("keeps a paused IP visible while it still has work on it", () => {
    // Pausing an IP doesn't delete its placements — hiding them would hide real work.
    const db = empty();
    db.ips = [
      { id: "on-1", code: "A", active: true, floors: { posts: 0, reels: 0 } },
      { id: "off-1", code: "B", active: false, floors: { posts: 0, reels: 0 } },
      { id: "off-2", code: "C", active: false, floors: { posts: 0, reels: 0 } },
    ];
    db.placements = [{ id: "p1", versionId: "v1", ipId: "off-1", date: db.meta.anchor, state: "pending" }];
    expect(S.visibleIps(db).map((i) => i.id).sort()).toEqual(["off-1", "on-1"]);

    // Cancel it and the paused IP drops out again.
    db.placements[0].state = "cancelled";
    expect(S.visibleIps(db).map((i) => i.id)).toEqual(["on-1"]);
  });

  it("keeps a paused IP in historical views that published in the window", () => {
    const db = empty();
    db.ips = [
      { id: "on-1", code: "A", active: true, floors: { posts: 0, reels: 0 } },
      { id: "off-1", code: "B", active: false, floors: { posts: 0, reels: 0 } },
    ];
    db.publications = [{ id: "pub1", ipIds: ["off-1"], versionIds: [], publishedAt: "2026-09-20T05:00:00Z" }];
    expect(S.cyclePerIp(db, "2026-09-18", "2026-09-23").map((r) => r.ip.id).sort()).toEqual(["off-1", "on-1"]);
    // The bank looks forward, so a past publication doesn't keep it there.
    expect(S.bankStockDays(db).map((r) => r.ip.id)).toEqual(["on-1"]);
  });

  it("reports no coverage rather than inventing any", () => {
    const db = empty();
    expect(S.readyBankVersions(db)).toEqual([]);
    expect(S.captureTasks(db, db.meta.anchor)).toEqual([]);
    expect(T.growthRows(db)).toEqual([]);
  });
});
