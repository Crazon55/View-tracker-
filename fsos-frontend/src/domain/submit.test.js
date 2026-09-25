// Nothing goes to review until both names are on it.
//
// Submit for review worked on an unassigned idea. Review is a conversation between two
// named people — the reviewer asks for changes, the owner makes them — and either one
// missing breaks it in its own way. With no owner the request has nobody behind it and
// the changes never come. With no reviewer the version moves to awaiting review and
// notifies nobody: a queue addressed to no one, which looks like progress and isn't.
import { submitBlocker } from "./submit";

const version = (over = {}) => ({ id: "v-1", reviewStatus: "in_production", assetLinks: [{ id: "l1", url: "https://canva.com/x" }], ...over });
const idea = (over = {}) => ({ id: "i-1", productionOwnerId: "u-owner", reviewerId: "u-rev", ...over });

test("fully assigned with a deliverable can go", () => {
  expect(submitBlocker(idea(), [version()])).toBeNull();
});

test("no owner is refused, and says so", () => {
  const msg = submitBlocker(idea({ productionOwnerId: null }), [version()]);
  expect(msg).toMatch(/production owner/);
  expect(msg).not.toMatch(/and a reviewer/);
});

test("no reviewer is refused, and says so", () => {
  const msg = submitBlocker(idea({ reviewerId: null }), [version()]);
  expect(msg).toMatch(/a reviewer/);
  expect(msg).not.toMatch(/production owner/);
});

test("neither assigned names both, so it takes one trip not two", () => {
  const msg = submitBlocker(idea({ productionOwnerId: null, reviewerId: null }), [version()]);
  expect(msg).toMatch(/a production owner and a reviewer/);
});

test("assignment is checked before the deliverable", () => {
  // Otherwise someone adds the link they were told to, and only then finds out
  // the real problem was that nobody is assigned.
  const msg = submitBlocker(idea({ productionOwnerId: null }), [version({ assetLinks: [] })]);
  expect(msg).toMatch(/production owner/);
});

test("assigned but nothing to look at is still refused", () => {
  expect(submitBlocker(idea(), [version({ assetLinks: [] })])).toMatch(/Canva or Drive/);
});

test("a pending link that has not been saved yet counts as a deliverable", () => {
  const v = version({ assetLinks: [] });
  expect(submitBlocker(idea(), [v], { "v-1": { url: "https://canva.link/abc" } })).toBeNull();
});

test("a deadline is not required — not knowing when is a real state", () => {
  expect(submitBlocker(idea({ deadline: null }), [version()])).toBeNull();
});

test("versions already with the reviewer are not resubmittable on their own", () => {
  expect(submitBlocker(idea(), [version({ reviewStatus: "awaiting_review" })])).toMatch(/Canva or Drive/);
});
