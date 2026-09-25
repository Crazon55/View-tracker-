// A deliverable link has to be a file the reviewer can open.
//
// The field took any text at all, so a typo or a random URL went in and nobody found
// out until the reviewer clicked it — a day lost on something due today.
import { isAssetLink, assetLinkError, hostOf } from "../lib/links";

describe("accepts the real thing", () => {
  test.each([
    "https://www.canva.com/design/DAF123/edit",
    "https://canva.com/design/x",
    "https://app.canva.com/design/x",
    "canva.com/design/x",                       // pasted without the scheme
    "https://drive.google.com/file/d/abc/view",
    "https://docs.google.com/document/d/x/edit",
    // The share button hands out canva.link, and the first version of this refused it.
    "https://canva.link/nxdwbla4udgt924",
    "canva.link/nxdwbla4udgt924",
    "https://www.canva.com/design/DAHUxf1azvk/XVSJE1rueOZKztdN2_XB8A/edit",
    "https://canva.site/my-published-thing",
    "https://sheets.google.com/x",
    "https://slides.google.com/x",
    "https://drive.usercontent.google.com/download?id=abc",
  ])("%s", (url) => {
    expect(isAssetLink(url)).toBe(true);
    expect(assetLinkError(url)).toBeNull();
  });
});

describe("refuses everything else", () => {
  test.each([
    "https://poop.com",
    "poop.com",
    "https://instagram.com/reel/abc",
    "https://dropbox.com/s/x",
    "just some words",
  ])("%s", (url) => {
    expect(isAssetLink(url)).toBe(false);
    expect(assetLinkError(url)).toBeTruthy();
  });

  test("a lookalike domain does not sneak through on a prefix", () => {
    // canva.com.evil.net ends with neither ".canva.com" nor "canva.com".
    expect(isAssetLink("https://canva.com.evil.net/design")).toBe(false);
    expect(isAssetLink("https://notcanva.com/design")).toBe(false);
  });

  test("the message names what was actually pasted, so it is obvious what to change", () => {
    expect(assetLinkError("https://poop.com/x")).toContain("poop.com");
  });

  test("an empty box is not roasted — they have not done anything, just not finished", () => {
    expect(assetLinkError("")).toBe("Paste a Canva or Drive link.");
    expect(assetLinkError("   ")).toBe("Paste a Canva or Drive link.");
  });
});

test("hostOf survives junk without throwing", () => {
  expect(hostOf("")).toBeNull();
  expect(hostOf("http://")).toBeNull();
  expect(() => hostOf("::::")).not.toThrow();
});
