// My work has to answer "what do I pick up next" without reading every row.
//
// A producer saw their assigned ideas with deadlines and nothing else. A deadline says
// when something is due, not what to drop — two things due Friday can be very different
// amounts of "now" — so the ordering is priority first, deadline second.
import { myWork } from "./selectors";
import { priorityRank, PRIORITIES, DEFAULT_PRIORITY } from "./constants";

const idea = (id, priority, deadline) => ({
  id, priority, deadline, productionOwnerId: "u-1", stream: "BO",
  approval: { state: "approved" }, destinations: [],
});

const dbWith = (ideas) => ({ ideas, versions: [], publications: [], placements: [] });

test("P0 first, then P1, then P2", () => {
  const db = dbWith([idea("c", "P2"), idea("a", "P0"), idea("b", "P1")]);
  expect(myWork(db, "u-1").map((x) => x.idea.id)).toEqual(["a", "b", "c"]);
});

test("within a priority the nearest deadline comes first", () => {
  const db = dbWith([
    idea("later", "P1", "2026-10-10"),
    idea("sooner", "P1", "2026-09-26"),
    idea("urgent", "P0", "2026-12-01"),
  ]);
  // The P0 leads even though it is due in December — that is the point of P0.
  expect(myWork(db, "u-1").map((x) => x.idea.id)).toEqual(["urgent", "sooner", "later"]);
});

test("no deadline sorts after one that has a date, not before", () => {
  const db = dbWith([idea("none", "P1", null), idea("dated", "P1", "2026-11-01")]);
  expect(myWork(db, "u-1").map((x) => x.idea.id)).toEqual(["dated", "none"]);
});

test("an idea written before priority existed is treated as the default", () => {
  const db = dbWith([idea("old", undefined), idea("low", "P2"), idea("top", "P0")]);
  expect(priorityRank({ priority: undefined })).toBe(PRIORITIES[DEFAULT_PRIORITY].rank);
  expect(myWork(db, "u-1").map((x) => x.idea.id)).toEqual(["top", "old", "low"]);
});

test("only the named person's work comes back", () => {
  const mine = idea("mine", "P1");
  const theirs = { ...idea("theirs", "P0"), productionOwnerId: "u-2" };
  expect(myWork(dbWith([mine, theirs]), "u-1").map((x) => x.idea.id)).toEqual(["mine"]);
});

test("the order is stable when priority and deadline both tie", () => {
  const db = dbWith([idea("b", "P1", "2026-10-01"), idea("a", "P1", "2026-10-01")]);
  const once = myWork(db, "u-1").map((x) => x.idea.id);
  expect(once).toEqual(myWork(db, "u-1").map((x) => x.idea.id));
  expect(once).toEqual(["a", "b"]);
});

test("every level has wording aimed at the person doing the work", () => {
  for (const k of ["P0", "P1", "P2"]) {
    expect(PRIORITIES[k].blurb.length).toBeGreaterThan(20);
    expect(PRIORITIES[k].short).toBeTruthy();
  }
});
