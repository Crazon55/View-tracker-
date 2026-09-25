// My work has to answer "what do I pick up next" without reading every row.
//
// A producer saw their assigned ideas with deadlines and nothing else. A deadline says
// when something is due, not what to drop — two things due Friday can be very different
// amounts of "now" — so the ordering is priority first, deadline second.
import fs from "fs";
import path from "path";
import { myWork } from "./selectors";
import { priorityRank, PRIORITIES, PRIORITY_KEYS, DEFAULT_PRIORITY } from "./constants";

const idea = (id, priority, deadline) => ({
  id, priority, deadline, productionOwnerId: "u-1", stream: "BO",
  approval: { state: "approved" }, destinations: [],
});

const dbWith = (ideas) => ({ ideas, versions: [], publications: [], placements: [] });

test("Urgent first, then Important, then Average", () => {
  const db = dbWith([idea("c", "AVERAGE"), idea("a", "URGENT"), idea("b", "IMPORTANT")]);
  expect(myWork(db, "u-1").map((x) => x.idea.id)).toEqual(["a", "b", "c"]);
});

test("within a priority the nearest deadline comes first", () => {
  const db = dbWith([
    idea("later", "IMPORTANT", "2026-10-10"),
    idea("sooner", "IMPORTANT", "2026-09-26"),
    idea("urgent", "URGENT", "2026-12-01"),
  ]);
  // Urgent leads even though it is due in December — that is the point of Urgent.
  expect(myWork(db, "u-1").map((x) => x.idea.id)).toEqual(["urgent", "sooner", "later"]);
});

test("no deadline sorts after one that has a date, not before", () => {
  const db = dbWith([idea("none", "IMPORTANT", null), idea("dated", "IMPORTANT", "2026-11-01")]);
  expect(myWork(db, "u-1").map((x) => x.idea.id)).toEqual(["dated", "none"]);
});

test("an idea written before priority existed is treated as the default", () => {
  const db = dbWith([idea("old", undefined), idea("low", "AVERAGE"), idea("top", "URGENT")]);
  expect(priorityRank({ priority: undefined })).toBe(PRIORITIES[DEFAULT_PRIORITY].rank);
  expect(myWork(db, "u-1").map((x) => x.idea.id)).toEqual(["top", "old", "low"]);
});

test("only the named person's work comes back", () => {
  const mine = idea("mine", "IMPORTANT");
  const theirs = { ...idea("theirs", "URGENT"), productionOwnerId: "u-2" };
  expect(myWork(dbWith([mine, theirs]), "u-1").map((x) => x.idea.id)).toEqual(["mine"]);
});

test("the order is stable when priority and deadline both tie", () => {
  const db = dbWith([idea("b", "IMPORTANT", "2026-10-01"), idea("a", "IMPORTANT", "2026-10-01")]);
  const once = myWork(db, "u-1").map((x) => x.idea.id);
  expect(once).toEqual(myWork(db, "u-1").map((x) => x.idea.id));
  expect(once).toEqual(["a", "b"]);
});

test("every level has wording aimed at the person doing the work", () => {
  for (const k of ["URGENT", "IMPORTANT", "AVERAGE"]) {
    expect(PRIORITIES[k].blurb.length).toBeGreaterThan(20);
    expect(PRIORITIES[k].short).toBeTruthy();
  }
});

// The allowed values live in three places — this file's source of truth, the API, and a
// check constraint in the database. The link-domain list drifted the same way earlier,
// so the same guard applies: read the Python and compare. The database is covered by the
// API refusing anything it would reject before it gets there.
describe("frontend and backend agree on the values", () => {
  const py = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "fsos-backend", "app", "routers", "ideas.py"), "utf8");

  test("the same three names, in the same order", () => {
    const block = py.match(/PRIORITIES\s*=\s*\(([^)]*)\)/);
    expect(block).not.toBeNull();
    expect([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual(PRIORITY_KEYS);
  });

  test("and the same default", () => {
    expect(py).toContain(`DEFAULT_PRIORITY = "${DEFAULT_PRIORITY}"`);
  });

  test("the default is the middle one, not the loudest", () => {
    // Defaulting to Urgent makes the top level meaningless within a week.
    expect(PRIORITIES[DEFAULT_PRIORITY].rank).toBe(1);
  });
});
