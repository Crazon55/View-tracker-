// What "ready" means once something is published.
//
// An idea with both its pages live read "0/2 ready · 2 live" on the idea list — the
// progress counter said nothing had been done while the work was finished and out.
// The status fields are mutually exclusive by design (`ideaDerivedState` needs that:
// "ready" has to mean ready-and-not-yet-published), so publishing a version silently
// removed it from the ready count. `done` is the number finished, and a published
// version is finished.
import { ideaProgress, ideaDerivedState } from "./selectors";

const idea = { id: "i-1", stream: "BO", approval: { state: "approved" }, productionOwnerId: "u-1", destinations: ["ip-1", "ip-2"] };

const makeDb = (publishedIps) => ({
  ideas: [idea],
  versions: [
    { id: "v-1", ideaId: "i-1", ipId: "ip-1", reviewStatus: "ready", assetLinks: [] },
    { id: "v-2", ideaId: "i-1", ipId: "ip-2", reviewStatus: "ready", assetLinks: [] },
  ],
  publications: publishedIps.map((ip, n) => ({ id: `pub-${n}`, versionIds: [ip] })),
  placements: [],
});

test("both pages live reads 2/2 ready, not 0/2", () => {
  const p = ideaProgress(makeDb(["v-1", "v-2"]), idea);
  expect(p).toMatchObject({ total: 2, published: 2, ready: 0, done: 2 });
});

test("one live, one still ready to go", () => {
  const p = ideaProgress(makeDb(["v-1"]), idea);
  expect(p).toMatchObject({ total: 2, published: 1, ready: 1, done: 2 });
});

test("nothing produced yet counts as nothing done", () => {
  const db = makeDb([]);
  db.versions.forEach((v) => { v.reviewStatus = "in_production"; });
  expect(ideaProgress(db, idea)).toMatchObject({ total: 2, published: 0, ready: 0, done: 0 });
});

test("the derived state still distinguishes ready from published", () => {
  // `done` must not leak into the state machine: ready-but-unpublished is not published.
  expect(ideaDerivedState(makeDb([]), idea)).toBe("ready");
  expect(ideaDerivedState(makeDb(["v-1"]), idea)).toBe("partly_published");
  expect(ideaDerivedState(makeDb(["v-1", "v-2"]), idea)).toBe("published");
});
