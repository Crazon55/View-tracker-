/** Default page packages for brief submit / admin add-brief. */

export type BriefPackage = {
  id: string;
  name: string;
  priceInr: number;
  /** page_name keys as stored on monetisable_pages (matched case-insensitively). */
  pages: string[];
};

export const BRIEF_PACKAGES: BriefPackage[] = [
  {
    id: "network",
    name: "Network Bundle",
    priceInr: 100_000,
    pages: [
      "101xFounders",
      "BizzIndia",
      "IndiaBusinessCom",
      "IndiaFoundersCo",
      "IndiaFoundersCore",
      "FoundersInIndia",
      "StartupCoded",
      "IndiaStartupStory",
      "TheChangingOrder",
    ],
  },
  {
    id: "business",
    name: "Business Bundle",
    priceInr: 65_000,
    pages: [
      "BizzIndia",
      "IndiaBusinessCom",
      "IndiaFoundersCo",
      "IndiaFoundersCore",
      "FoundersInIndia",
      "StartupCoded",
      "IndiaStartupStory",
      "TheChangingOrder",
    ],
  },
  {
    id: "top_pages",
    name: "Top Pages Bundle",
    priceInr: 65_000,
    pages: ["101xFounders", "BizzIndia", "TheChangingOrder"],
  },
];

export function normPageKey(s: string) {
  return String(s || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function formatPackagePrice(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Resolve package page names against live eligible pages (by normalized name). */
export function resolvePackagePages<T extends { page_id: string; page_name: string }>(
  pkg: BriefPackage,
  eligible: T[],
): { matched: T[]; missing: string[] } {
  const byKey = new Map(eligible.map((p) => [normPageKey(p.page_name), p]));
  const matched: T[] = [];
  const missing: string[] = [];
  for (const name of pkg.pages) {
    const hit = byKey.get(normPageKey(name));
    if (hit) matched.push(hit);
    else missing.push(name);
  }
  return { matched, missing };
}
