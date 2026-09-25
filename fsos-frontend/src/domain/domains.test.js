// The allowed link domains exist twice, and have to stay identical.
//
// The browser needs the list to tell someone their link is wrong while they are still
// looking at the box; the API needs it because the API is reachable without the UI. So
// it is written in both fsos-frontend/src/lib/links.js and fsos-backend/app/links.py,
// and a list kept in two places drifts — someone adds a domain where they noticed the
// problem and the other half quietly keeps refusing it.
//
// This reads the Python and compares. It is a crude parse on purpose: anything clever
// enough to handle arbitrary Python would be one more thing that can be wrong.
const fs = require("fs");
const path = require("path");
const { ALLOWED_HOSTS } = require("../lib/links");

const PY = path.join(__dirname, "..", "..", "..", "fsos-backend", "app", "links.py");

function pythonHosts() {
  const src = fs.readFileSync(PY, "utf8");
  const block = src.match(/ALLOWED_HOSTS\s*=\s*\(([\s\S]*?)\)/);
  if (!block) throw new Error("ALLOWED_HOSTS not found in app/links.py");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("the backend list is readable", () => {
  expect(pythonHosts().length).toBeGreaterThan(3);
});

test("frontend and backend allow exactly the same hosts", () => {
  expect([...ALLOWED_HOSTS].sort()).toEqual(pythonHosts().sort());
});

test("the domains people actually get handed are all on it", () => {
  // canva.link is what the Canva share button copies — it was missing at first, which
  // meant the commonest way of sharing a design was refused.
  for (const host of ["canva.com", "canva.link", "drive.google.com", "docs.google.com"]) {
    expect(ALLOWED_HOSTS).toContain(host);
  }
});
