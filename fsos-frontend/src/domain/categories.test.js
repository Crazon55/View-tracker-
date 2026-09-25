// The category filter has to offer only what it could actually find.
//
// Categories are per stream and per format — "Fact static" exists only as a BO Static —
// so a filter that offers all of them everywhere returns nothing for most choices, and
// people stop trusting it after the second empty list.
import { categoryOptions, formatHasCategory } from "./selectors";

// The real taxonomy, as it stands in the database.
const db = {
  categories: [
    { name: "Case study", stream: "BO", format: "Carousel" },
    { name: "Comparison", stream: "BO", format: "Carousel" },
    { name: "Proven BO", stream: "BO", format: "Carousel" },
    { name: "A-roll", stream: "BO", format: "Reel" },
    { name: "Fact static", stream: "BO", format: "Static" },
    { name: "Statement/quote", stream: "BO", format: "Static" },
    { name: "News carousel", stream: "HPN", format: "Carousel" },
    { name: "A-roll", stream: "HPN", format: "Reel" },
    { name: "News", stream: "HPN", format: "Reel" },
    { name: "Viral news static", stream: "HPN", format: "Static" },
  ],
};

test("one stream, every format", () => {
  expect(categoryOptions(db, ["BO"])).toEqual([
    "A-roll", "Case study", "Comparison", "Fact static", "Proven BO", "Statement/quote",
  ]);
});

test("BO statics only — the case this was asked for", () => {
  expect(categoryOptions(db, ["BO"], "Static")).toEqual(["Fact static", "Statement/quote"]);
});

test("HPN does not leak into a BO list", () => {
  expect(categoryOptions(db, ["BO"])).not.toContain("News");
  expect(categoryOptions(db, ["HPN"])).not.toContain("Fact static");
});

test("a name in both streams appears once, not twice", () => {
  // A-roll is a BO reel and an HPN reel. idea.category is only a name, so a duplicate
  // entry would be two identical options that filter identically.
  const both = categoryOptions(db, ["BO", "HPN"], "Reel");
  expect(both).toEqual(["A-roll", "News"]);
  expect(both.filter((c) => c === "A-roll")).toHaveLength(1);
});

test("a format with nothing in it returns an empty list, not everything", () => {
  expect(categoryOptions(db, ["HPN"], "Nonsense")).toEqual([]);
});

test("survives a workspace with no categories yet", () => {
  expect(categoryOptions({}, ["BO"])).toEqual([]);
  expect(categoryOptions({ categories: [] }, ["BO"], "Reel")).toEqual([]);
});

describe("dropping a filter the new format cannot hold", () => {
  test("Static cannot hold A-roll", () => {
    expect(formatHasCategory(db, "A-roll", "Static")).toBe(false);
  });
  test("Static can hold Fact static", () => {
    expect(formatHasCategory(db, "Fact static", "Static")).toBe(true);
  });
  test("a name that matches in either stream is enough to keep it", () => {
    expect(formatHasCategory(db, "A-roll", "Reel")).toBe(true);
  });
});
