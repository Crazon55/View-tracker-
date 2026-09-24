// Every component used in JSX must actually be in scope.
//
// This has bitten three times in one day. A component gets used without being imported,
// the production build succeeds, and the page renders blank the moment it mounts —
// Users & Roles did exactly that, live. The build doesn't catch it: this project is on
// ESLint 9 with no flat config, so react-app's `no-undef` isn't running, and nothing
// else looks.
//
// So this walks the source and checks that every <Capitalised> tag is imported,
// declared, or a known global. It's a text scan rather than a real parser, which is
// enough for the failure it exists to prevent: a name used and never brought in.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..");

// Things that are legitimately in scope without an import in the file.
const GLOBALS = new Set(["React", "Fragment", "Math", "Object", "Array", "JSON", "Number",
  "String", "Boolean", "Date", "Set", "Map", "Promise", "Intl", "Error", "AbortSignal"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(full, out);
    } else if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) {
      out.push(full);
    }
  }
  return out;
}

/** Names this file brings in or defines itself. */
function declared(code) {
  const names = new Set();

  // import Foo, { Bar as Baz, Qux } from "…"  /  import * as Icons from "…"
  // The clause can't contain a quote or a semicolon, or a side-effect import
  // (`import "./index.css";`) swallows the statement after it and we lose that name.
  for (const m of code.matchAll(/import\s+([^"';]*?)\s+from\s+["']/g)) {
    const clause = m[1];
    const dflt = clause.match(/^\s*(\w+)/);
    if (dflt) names.add(dflt[1]);
    const star = clause.match(/\*\s+as\s+(\w+)/);
    if (star) names.add(star[1]);
    const braced = clause.match(/\{([\s\S]*?)\}/);
    if (braced) {
      for (const part of braced[1].split(",")) {
        const as = part.split(/\s+as\s+/);
        const name = (as[1] || as[0] || "").trim();
        if (name) names.add(name);
      }
    }
  }

  // Declared in the file.
  for (const m of code.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:default\s+)?function\s+(\w+)/g)) names.add(m[1]);
  for (const m of code.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(\w+)/g)) names.add(m[1]);
  // Destructuring, both in an assignment and in a parameter list. The parameter case
  // is how a component receives another component: `({ icon: Icon })` then `<Icon />`.
  const patterns = [
    /(?:const|let|var)\s*\{([^}]*)\}\s*=/g,        // const { Panel } = …
    /\(\s*\{([^}]*)\}\s*[,)]/g,                    // function f({ icon: Icon }) / ({ x }) =>
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      for (const part of m[1].split(",")) {
        const name = part.split(":").pop().trim().replace(/\s*=.*$/, "").replace(/^\.\.\./, "");
        if (/^\w+$/.test(name)) names.add(name);
      }
    }
  }
  return names;
}

/** Capitalised JSX tags used in the file, ignoring member access like <Icons.X />. */
function usedTags(code) {
  const tags = new Set();
  for (const m of code.matchAll(/<([A-Z]\w*)(?=[\s/>.])/g)) {
    const name = m[1];
    // <Foo.Bar /> only needs Foo, which the regex already captured.
    tags.add(name);
  }
  return tags;
}

describe("every component used is in scope", () => {
  const files = walk(SRC);

  it("finds the source to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  files.forEach((file) => {
    const rel = path.relative(SRC, file).replace(/\\/g, "/");
    it(rel, () => {
      const code = fs.readFileSync(file, "utf8");
      const have = declared(code);
      const missing = [...usedTags(code)].filter((t) => !have.has(t) && !GLOBALS.has(t));
      expect(missing).toEqual([]);
    });
  });
});
