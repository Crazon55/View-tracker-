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

  it("reports no coverage rather than inventing any", () => {
    const db = empty();
    expect(S.readyBankVersions(db)).toEqual([]);
    expect(S.captureTasks(db, db.meta.anchor)).toEqual([]);
    expect(T.growthRows(db)).toEqual([]);
  });
});
