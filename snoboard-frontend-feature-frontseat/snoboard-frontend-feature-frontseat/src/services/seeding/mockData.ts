// Local seeding fixtures — migrated from migrations/seeding_data_export.sql
// Used when VITE_SEEDING_MOCK=true (opt-in). Mutations persist to localStorage so refresh keeps edits.

export type SeedingTeam = { team_id: string; team_name: string };
export type SeedingUser = { user_id: string; name: string; email?: string };

export type SeedingDeal = {
  deal_id: string;
  brand_name: string;
  agency_or_client_name: string;
  brief_text?: string;
  brief_link?: string;
  assets_links?: string;
  notes?: string;
  admin_feedback?: string;
  price_closed_at: number;
  payment_due_date?: string;
  go_live_date_time?: string;
  admin_review_status: string;
  deal_status: string | null;
  payment_status?: string;
  payment_notes?: string;
  amount_received?: number;
  payment_updated_by?: string;
  payment_updated_at?: string;
  submitted_by_team?: SeedingTeam;
  submitted_by_user?: SeedingUser;
  approved_at?: string;
  created_at?: string;
};

export type SeedingDeliverable = {
  deliverable_id: string;
  page_name: string;
  deliverable_type: string;
  status: string;
  go_live_date_time?: string;
  live_link?: string;
  views?: number;
  notes?: string;
  assigned_to?: string;
};

export type SeedingDealDetail = SeedingDeal & {
  deliverables?: SeedingDeliverable[];
  outputs?: { output_id: string; label: string; status: string }[];
  general_comments?: { comment_id: string; text: string; author?: string; created_at?: string }[];
  internal_notes?: { note_id: string; text: string; author?: string; created_at?: string }[];
};

const TEAMS: Record<string, SeedingTeam> = {
  team_21e60310db54: { team_id: "team_21e60310db54", team_name: "Snoball" },
  team_56b4ab680ceb: { team_id: "team_56b4ab680ceb", team_name: "Hooc" },
  team_460502b4ecd2: { team_id: "team_460502b4ecd2", team_name: "OWLED Core" },
  team_99c4b4a0d63d: { team_id: "team_99c4b4a0d63d", team_name: "AY" },
};

const USERS: Record<string, SeedingUser> = {
  user_df7b485feef6: { user_id: "user_df7b485feef6", name: "Snoball BD", email: "snoball.bd@owledmedia.com" },
  user_674b656f0f31: { user_id: "user_674b656f0f31", name: "Hooc BD", email: "hooc.bd@owledmedia.com" },
  user_f1403e74d093: { user_id: "user_f1403e74d093", name: "OWLED Core BD", email: "core.bd@owledmedia.com" },
  user_ade2b8e9f8ce: { user_id: "user_ade2b8e9f8ce", name: "AY BD", email: "ay.bd@owledmedia.com" },
};

export const MOCK_DEALS: SeedingDeal[] = [
  {
    deal_id: "deal_63954e4422b5",
    brand_name: "Notion",
    agency_or_client_name: "Direct",
    brief_text: "Founder-focused campaign showing Notion AI use cases for Indian startups.",
    price_closed_at: 520000,
    payment_due_date: "2026-07-30T09:34:10.086422+00:00",
    go_live_date_time: "2026-07-14T09:34:10.086422+00:00",
    admin_review_status: "Approved",
    deal_status: "In Progress",
    payment_status: "Not Raised",
    submitted_by_team: TEAMS.team_460502b4ecd2,
    submitted_by_user: USERS.user_f1403e74d093,
    approved_at: "2026-06-20T09:34:10.086422+00:00",
    created_at: "2026-06-20T09:34:10.086422+00:00",
  },
  {
    deal_id: "deal_08b17148ceb7",
    brand_name: "Zoho",
    agency_or_client_name: "Direct",
    brief_text: "Zoho CRM launch reels series targeting bootstrapped founders.",
    price_closed_at: 320000,
    payment_due_date: "2026-07-30T09:34:10.086422+00:00",
    go_live_date_time: "2026-06-28T09:34:10.086422+00:00",
    admin_review_status: "Approved",
    deal_status: "Completed",
    payment_status: "Paid",
    submitted_by_team: TEAMS.team_21e60310db54,
    submitted_by_user: USERS.user_df7b485feef6,
    approved_at: "2026-06-05T09:34:10.086422+00:00",
    created_at: "2026-06-05T09:34:10.086422+00:00",
  },
  {
    deal_id: "deal_d273b4661595",
    brand_name: "CRED",
    agency_or_client_name: "Wavemaker",
    brief_text: "Brand awareness carousel for new CRED Garage launch.",
    price_closed_at: 240000,
    payment_due_date: "2026-07-30T09:34:10.086422+00:00",
    go_live_date_time: "2026-07-14T09:34:10.086422+00:00",
    admin_review_status: "Approved",
    deal_status: "Accepted",
    payment_status: "Raised",
    submitted_by_team: TEAMS.team_56b4ab680ceb,
    submitted_by_user: USERS.user_674b656f0f31,
    approved_at: "2026-06-30T10:07:53.533423+00:00",
    created_at: "2026-06-26T09:34:10.086422+00:00",
  },
  {
    deal_id: "deal_a03f2cc553cc",
    brand_name: "ToothlessFoods",
    agency_or_client_name: "Direct",
    brief_text: "Single static post for early-stage D2C food brand.",
    price_closed_at: 45000,
    go_live_date_time: "2026-07-14T09:34:10.086422+00:00",
    admin_review_status: "Rejected",
    deal_status: null,
    payment_status: "Raised",
    submitted_by_team: TEAMS.team_99c4b4a0d63d,
    submitted_by_user: USERS.user_ade2b8e9f8ce,
    created_at: "2026-06-24T09:34:10.086422+00:00",
  },
  {
    deal_id: "deal_49786da36a0b",
    brand_name: "Razorpay",
    agency_or_client_name: "Direct",
    brief_text: "Series of posts to push Razorpay's new SME credit product.",
    price_closed_at: 390000,
    go_live_date_time: "2026-07-14T09:34:10.086422+00:00",
    admin_review_status: "Archived",
    deal_status: null,
    payment_status: "Paid",
    submitted_by_team: TEAMS.team_21e60310db54,
    submitted_by_user: USERS.user_df7b485feef6,
    created_at: "2026-06-28T09:34:10.086422+00:00",
  },
  {
    deal_id: "deal_7f2a91c1e8d4",
    brand_name: "Stripe",
    agency_or_client_name: "Direct",
    brief_text: "Reel series on Stripe Atlas for Indian SaaS founders.",
    price_closed_at: 185000,
    go_live_date_time: "2026-07-22T09:34:10.086422+00:00",
    admin_review_status: "Submitted",
    deal_status: null,
    payment_status: "Not Raised",
    submitted_by_team: TEAMS.team_56b4ab680ceb,
    submitted_by_user: USERS.user_674b656f0f31,
    created_at: "2026-07-01T09:34:10.086422+00:00",
  },
  {
    deal_id: "deal_91bc44e2a0f1",
    brand_name: "Freshworks",
    agency_or_client_name: "GroupM",
    brief_text: "Carousel on Freshworks CX stack for D2C brands.",
    price_closed_at: 210000,
    go_live_date_time: "2026-07-28T09:34:10.086422+00:00",
    admin_review_status: "Needs More Info",
    deal_status: null,
    payment_status: "Not Raised",
    submitted_by_team: TEAMS.team_21e60310db54,
    submitted_by_user: USERS.user_df7b485feef6,
    created_at: "2026-07-03T09:34:10.086422+00:00",
  },
];

const MOCK_DEALS_KEY = "seeding_mock_deals_v1";

function persistMockDeals() {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MOCK_DEALS_KEY, JSON.stringify(MOCK_DEALS));
  } catch {
    /* ignore quota / private mode */
  }
}

function hydrateMockDeals() {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(MOCK_DEALS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as SeedingDeal[];
    if (!Array.isArray(parsed) || !parsed.length) return;
    MOCK_DEALS.splice(0, MOCK_DEALS.length, ...parsed);
  } catch {
    /* ignore corrupt cache */
  }
}

hydrateMockDeals();

const MOCK_DELIVERABLES: Record<string, SeedingDeliverable[]> = {
  deal_d273b4661595: [
    {
      deliverable_id: "del_cred_1",
      page_name: "Startup by Dog",
      deliverable_type: "Carousel",
      status: "Not Started",
      go_live_date_time: "2026-07-14T09:34:10.086422+00:00",
      live_link: "",
      views: 0,
      notes: "",
      assigned_to: "",
    },
    {
      deliverable_id: "del_cred_2",
      page_name: "Startup by Dog",
      deliverable_type: "Carousel",
      status: "Not Started",
      go_live_date_time: "2026-07-14T09:34:10.086422+00:00",
      live_link: "",
      views: 0,
      notes: "",
      assigned_to: "",
    },
  ],
  deal_63954e4422b5: [
    { deliverable_id: "del_notion_1", page_name: "Startupcoded", deliverable_type: "Reel", status: "Designing", go_live_date_time: "2026-07-14T09:34:10.086422+00:00", views: 0, assigned_to: "" },
    { deliverable_id: "del_notion_2", page_name: "Indian", deliverable_type: "Carousel", status: "Not Started", go_live_date_time: "2026-07-14T09:34:10.086422+00:00", views: 0, assigned_to: "" },
    { deliverable_id: "del_notion_3", page_name: "Indian", deliverable_type: "Carousel", status: "Not Started", go_live_date_time: "2026-07-14T09:34:10.086422+00:00", views: 0, assigned_to: "" },
    { deliverable_id: "del_notion_4", page_name: "India", deliverable_type: "Static", status: "Writing", go_live_date_time: "2026-07-14T09:34:10.086422+00:00", views: 0, assigned_to: "" },
  ],
  deal_7f2a91c1e8d4: [
    { deliverable_id: "del_stripe_1", page_name: "101x Founders", deliverable_type: "Reel", status: "Not Started", go_live_date_time: "2026-07-22T15:04:00+00:00", views: 0, assigned_to: "" },
    { deliverable_id: "del_stripe_2", page_name: "101x Founders", deliverable_type: "Reel", status: "Not Started", go_live_date_time: "2026-07-22T15:04:00+00:00", views: 0, assigned_to: "" },
    { deliverable_id: "del_stripe_3", page_name: "Bizz India", deliverable_type: "Carousel", status: "Not Started", go_live_date_time: "2026-07-22T15:04:00+00:00", views: 0, assigned_to: "" },
  ],
};

// Outputs added via the deal detail page, keyed by deal_id (mock-mode only).
const MOCK_OUTPUTS: Record<string, any[]> = {};

function enrichDeal(deal: SeedingDeal): SeedingDealDetail {
  const extras: Partial<SeedingDealDetail> = {};
  if (deal.deal_id === "deal_d273b4661595") {
    extras.admin_feedback = "Need exact creative direction & target audience persona.";
    extras.payment_updated_by = "Krishna Koushik";
    extras.payment_updated_at = "2026-06-30T10:27:53.533423+00:00";
    extras.amount_received = 0;
    extras.payment_notes = "";
  }
  return {
    ...deal,
    deliverables: MOCK_DELIVERABLES[deal.deal_id] || [],
    outputs: MOCK_OUTPUTS[deal.deal_id] || [],
    general_comments: [],
    internal_notes: [],
    ...extras,
  };
}

function approvedDeals() {
  return MOCK_DEALS.filter((d) => d.admin_review_status === "Approved" && d.deal_status !== "Cancelled");
}

function buildTeamPayments() {
  const map = new Map<string, { team_name: string; not_raised: number; raised: number; pending: number; paid: number; total: number }>();
  for (const d of approvedDeals()) {
    const team = d.submitted_by_team?.team_name || "Unassigned";
    const cur = map.get(team) || { team_name: team, not_raised: 0, raised: 0, pending: 0, paid: 0, total: 0 };
    cur.total += d.price_closed_at;
    const ps = d.payment_status ?? "Not Raised";
    if (ps === "Paid") cur.paid += d.price_closed_at;
    else if (ps === "Not Raised") cur.not_raised += d.price_closed_at;
    else if (ps === "Raised") cur.raised += d.price_closed_at;
    else cur.pending += d.price_closed_at;
    map.set(team, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function revenueOverTime(from?: string, to?: string) {
  const start = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = to ? new Date(to.replace(/T.*/, "")) : new Date();
  const points: { date: string; revenue: number; deals: number }[] = [];
  const approvals = [
    { date: "2026-06-05", revenue: 320000 },
    { date: "2026-06-20", revenue: 520000 },
    { date: "2026-06-26", revenue: 240000 },
  ];
  for (const a of approvals) {
    const d = new Date(a.date);
    if (d >= start && d <= end) points.push({ date: a.date, revenue: a.revenue, deals: 1 });
  }
  if (!points.length) {
    points.push({ date: start.toISOString().slice(0, 10), revenue: 0, deals: 0 });
  }
  return points;
}

export function buildOverviewReport(params?: Record<string, unknown>) {
  const teamName = typeof params?.team_name === "string" ? params.team_name : "";
  const pool = teamName
    ? MOCK_DEALS.filter((d) => (d.submitted_by_team?.team_name || "") === teamName)
    : MOCK_DEALS;
  const approved = pool.filter((d) => d.admin_review_status === "Approved" && d.deal_status !== "Cancelled");
  const revenueClosed = approved.reduce((s, d) => s + d.price_closed_at, 0);
  const collected = approved.filter((d) => d.payment_status === "Paid").reduce((s, d) => s + d.price_closed_at, 0);

  return {
    revenue_closed: revenueClosed,
    collected,
    outstanding: revenueClosed - collected,
    collection_pct: revenueClosed ? Math.round((collected / revenueClosed) * 100) : 0,
    deals_approved: approved.length,
    deals_submitted_pending: pool.filter((d) => d.admin_review_status === "Submitted").length,
    payment_pending_count: approved.filter((d) => d.payment_status && !["Paid"].includes(d.payment_status)).length,
    deals_completed: approved.filter((d) => d.deal_status === "Completed").length,
    total_views: teamName ? (teamName === "Snoball" ? 170500 : 0) : 170500,
    blocked_deliverables: teamName ? 0 : 2,
    deals_needs_info: pool.filter((d) => d.admin_review_status === "Needs More Info").length,
    revenue_over_time: revenueOverTime(params?.from_date as string | undefined, params?.to_date as string | undefined),
    team_revenue: teamName
      ? [{ team_id: approved[0]?.submitted_by_team?.team_id || "", team_name: teamName, revenue: revenueClosed, deals: approved.length }]
      : [
          { team_id: "team_460502b4ecd2", team_name: "OWLED Core", revenue: 520000, deals: 1 },
          { team_id: "team_21e60310db54", team_name: "Snoball", revenue: 320000, deals: 1 },
          { team_id: "team_56b4ab680ceb", team_name: "Hooc", revenue: 240000, deals: 1 },
          { team_id: "team_99c4b4a0d63d", team_name: "AY", revenue: 0, deals: 0 },
        ],
    team_views: teamName
      ? [{ team_name: teamName, views: teamName === "Snoball" ? 170500 : 0 }]
      : [
          { team_name: "Snoball", views: 170500 },
          { team_name: "OWLED Core", views: 0 },
          { team_name: "Hooc", views: 0 },
          { team_name: "AY", views: 0 },
        ],
    team_payments: buildTeamPayments().filter((t) => !teamName || t.team_name === teamName),
    revenue_by_team: teamName
      ? [{ team: teamName, value: revenueClosed }]
      : [
          { team: "OWLED Core", value: 520000 },
          { team: "Snoball", value: 320000 },
          { team: "Hooc", value: 240000 },
          { team: "AY", value: 0 },
        ],
    pipeline: [
      { label: "Not started", count: 6, color: "#3b476b" },
      { label: "Designing", count: 2, color: "var(--accent)" },
      { label: "Blocked", count: 2, color: "#f2555a" },
      { label: "Completed", count: 2, color: "#22c55e" },
    ],
    recent_deals: pool,
  };
}

export function filterDeals(params?: Record<string, unknown>) {
  let rows = [...MOCK_DEALS];
  const status = params?.admin_review_status;
  if (typeof status === "string" && status) {
    rows = rows.filter((d) => d.admin_review_status === status);
  }
  const teamName = params?.team_name;
  if (typeof teamName === "string" && teamName) {
    rows = rows.filter((d) => (d.submitted_by_team?.team_name || "") === teamName);
  }
  const teamId = params?.team_id;
  if (typeof teamId === "string" && teamId) {
    rows = rows.filter((d) => d.submitted_by_team?.team_id === teamId);
  }
  return rows;
}

export function mockSeedingPost<T>(path: string, body: Record<string, unknown>): T {
  const clean = path.split("?")[0];

  // Admin review action — POST /deals/{id}/review { action, comment }
  const reviewMatch = clean.match(/^\/deals\/([^/]+)\/review$/);
  if (reviewMatch) {
    const idx = MOCK_DEALS.findIndex((d) => d.deal_id === reviewMatch[1]);
    if (idx < 0) throw new Error("Deal not found");
    const action = String(body.action || "");
    const comment = String(body.comment || "");
    const patch: Partial<SeedingDeal> = {};
    if (action === "Approve") { patch.admin_review_status = "Approved"; patch.deal_status = "Accepted"; patch.approved_at = new Date().toISOString(); }
    else if (action === "Needs More Info") {
      if (!comment.trim()) throw new Error("Comment required for Needs More Info");
      patch.admin_review_status = "Needs More Info"; patch.admin_feedback = comment;
    }
    else if (action === "Reject") { patch.admin_review_status = "Rejected"; }
    else if (action === "Cancel") { patch.admin_review_status = "Cancelled"; patch.deal_status = "Cancelled"; }
    else if (action === "Reopen") { patch.admin_review_status = "Submitted"; patch.deal_status = null; }
    else if (action === "Archive") { patch.admin_review_status = "Archived"; }
    else throw new Error(`Unknown review action: ${action}`);
    MOCK_DEALS[idx] = { ...MOCK_DEALS[idx], ...patch } as SeedingDeal;
    persistMockDeals();
    return enrichDeal(MOCK_DEALS[idx]) as T;
  }

  // Add deliverables to a deal — POST /deals/{id}/deliverables { page_id, deliverable_type, quantity }
  const delivMatch = clean.match(/^\/deals\/([^/]+)\/deliverables$/);
  if (delivMatch) {
    const dealId = delivMatch[1];
    const page = MOCK_PAGES.find((p) => p.page_id === body.page_id);
    const type = String(body.deliverable_type || "Reel");
    const qty = Math.max(1, Number(body.quantity) || 1);
    const deal = MOCK_DEALS.find((d) => d.deal_id === dealId);
    const rows = (MOCK_DELIVERABLES[dealId] ??= []);
    const created = Array.from({ length: qty }, (_, i) => ({
      deliverable_id: `del_${Math.random().toString(36).slice(2, 8)}_${i}`,
      page_name: page?.page_name || "Unknown page",
      deliverable_type: type,
      status: "Not Started",
      go_live_date_time: deal?.go_live_date_time,
      live_link: "",
      views: 0,
      notes: "",
      assigned_to: "",
    }));
    rows.push(...created);
    return created as T;
  }

  // Add an output to a deal — POST /outputs { deal_id, ... }
  if (clean === "/outputs") {
    const dealId = String(body.deal_id || "");
    const output = {
      output_id: `out_${Math.random().toString(36).slice(2, 10)}`,
      output_type: String(body.output_type || "Writeup"),
      title: String(body.title || "Untitled"),
      writeup_text: String(body.writeup_text || ""),
      link: String(body.link || ""),
      status: String(body.status || "Draft"),
      visible_to_bd: body.visible_to_bd === true,
      created_at: new Date().toISOString(),
    };
    (MOCK_OUTPUTS[dealId] ??= []).push(output);
    return output as T;
  }

  if (clean === "/pages") {
    const page = {
      page_id: `page_${Math.random().toString(36).slice(2, 10)}`,
      page_name: String(body.page_name || "Untitled page"),
      active: body.active !== false,
      notes: String(body.notes || ""),
    };
    MOCK_PAGES.push(page);
    return page as T;
  }
  if (clean === "/deals") {
    const deal: SeedingDeal = {
      deal_id: `deal_${Math.random().toString(36).slice(2, 10)}`,
      brand_name: String(body.brand_name || "New brand"),
      agency_or_client_name: String(body.agency_or_client_name || "Direct"),
      brief_text: body.brief_text as string | undefined,
      brief_link: body.brief_link as string | undefined,
      assets_links: body.assets_links as string | undefined,
      notes: body.notes as string | undefined,
      price_closed_at: Number(body.price_closed_at) || 0,
      payment_due_date: body.payment_due_date as string | undefined,
      go_live_date_time: body.go_live_date_time as string | undefined,
      admin_review_status: String(body.admin_review_status || "Submitted"),
      deal_status: (body.deal_status as string | null) ?? null,
      payment_status: String(body.payment_status || "Not Raised"),
      submitted_by_team: body.submitted_by_team as SeedingTeam | undefined,
      submitted_by_user: body.submitted_by_user as SeedingUser | undefined,
      created_at: new Date().toISOString(),
    };
    MOCK_DEALS.unshift(deal);
    persistMockDeals();
    const drafts = body.deliverable_drafts as { page_name: string; deliverable_type: string; quantity: number }[] | undefined;
    if (drafts?.length) {
      MOCK_DELIVERABLES[deal.deal_id] = drafts.flatMap((d, i) =>
        Array.from({ length: d.quantity }, (_, q) => ({
          deliverable_id: `del_${deal.deal_id}_${i}_${q}`,
          page_name: d.page_name,
          deliverable_type: d.deliverable_type,
          status: "Not Started",
          go_live_date_time: deal.go_live_date_time,
          views: 0,
          assigned_to: "",
        })),
      );
    }
    return enrichDeal(deal) as T;
  }
  throw new Error("Unsupported POST");
}

export function mockSeedingPatch<T>(path: string, body: Record<string, unknown>): T {
  const pageMatch = path.split("?")[0].match(/^\/pages\/([^/]+)$/);
  if (pageMatch) {
    const idx = MOCK_PAGES.findIndex((p) => p.page_id === pageMatch[1]);
    if (idx < 0) throw new Error("Page not found");
    MOCK_PAGES[idx] = { ...MOCK_PAGES[idx], ...body } as (typeof MOCK_PAGES)[number];
    return MOCK_PAGES[idx] as T;
  }
  const dealMatch = path.match(/^\/deals\/([^/]+)$/);
  if (dealMatch) {
    const idx = MOCK_DEALS.findIndex((d) => d.deal_id === dealMatch[1]);
    if (idx >= 0) {
      MOCK_DEALS[idx] = { ...MOCK_DEALS[idx], ...body } as SeedingDeal;
      persistMockDeals();
      return enrichDeal(MOCK_DEALS[idx]) as T;
    }
  }
  throw new Error("Deal not found");
}

export function mockSeedingDelete<T>(path: string): T {
  const clean = path.split("?")[0];
  const pageMatch = clean.match(/^\/pages\/([^/]+)$/);
  if (pageMatch) {
    const idx = MOCK_PAGES.findIndex((p) => p.page_id === pageMatch[1]);
    if (idx < 0) throw new Error("Page not found");
    MOCK_PAGES.splice(idx, 1);
    return { deleted: pageMatch[1] } as T;
  }
  const delivMatch = clean.match(/^\/deliverables\/([^/]+)$/);
  if (delivMatch) {
    for (const dealId of Object.keys(MOCK_DELIVERABLES)) {
      const rows = MOCK_DELIVERABLES[dealId];
      const idx = rows.findIndex((d) => d.deliverable_id === delivMatch[1]);
      if (idx >= 0) { rows.splice(idx, 1); return { deleted: delivMatch[1] } as T; }
    }
    throw new Error("Deliverable not found");
  }
  throw new Error("Unsupported DELETE");
}

/** Route mock GET requests from the seeding axios shim. */
export function mockSeedingGet<T>(path: string, params?: Record<string, unknown>): T {
  const clean = path.split("?")[0];
  if (clean === "/reports/overview") return buildOverviewReport(params) as T;
  if (clean === "/deals") return filterDeals(params).map(enrichDeal) as T;
  if (clean === "/deliverables") {
    const flat = Object.entries(MOCK_DELIVERABLES).flatMap(([deal_id, rows]) =>
      rows.map((r) => ({ ...r, deal_id })),
    );
    const dealId = params?.deal_id;
    return (dealId ? flat.filter((r) => r.deal_id === dealId) : flat) as T;
  }
  if (clean === "/pages" || clean === "/monetisable-pages") return MOCK_PAGES as T;
  if (clean === "/users") return MOCK_SEEDING_USERS as T;
  const dealMatch = clean.match(/^\/deals\/([^/]+)$/);
  if (dealMatch) {
    const deal = MOCK_DEALS.find((d) => d.deal_id === dealMatch[1]);
    return (deal ? enrichDeal(deal) : null) as T;
  }
  return [] as T;
}

// Mirrors the real backend monetisable_pages model: page_id, page_name, active, notes.
// Mutable so add / edit / delete work in mock mode for local verification.
export const MOCK_PAGES = [
  { page_id: "page_101xf", page_name: "101x Founders", active: true, notes: "@101xfounders · 1.24M followers" },
  { page_id: "page_bizz", page_name: "Bizz India", active: true, notes: "@bizzindia · 890K followers" },
  { page_id: "page_tco", page_name: "The Changing Order", active: true, notes: "@thechangingorder · 620K followers" },
  { page_id: "page_startup", page_name: "Startup Coded", active: false, notes: "@startupcoded · 410K followers" },
];

export const MOCK_SEEDING_USERS = [
  { user_id: "user_df7b485feef6", name: "Snoball BD", email: "snoball.bd@owledmedia.com", role: "bd", team_name: "Snoball" },
  { user_id: "user_674b656f0f31", name: "Hooc BD", email: "hooc.bd@owledmedia.com", role: "bd", team_name: "Hooc" },
  { user_id: "user_f1403e74d093", name: "OWLED Core BD", email: "core.bd@owledmedia.com", role: "bd", team_name: "OWLED Core" },
  { user_id: "user_ade2b8e9f8ce", name: "AY BD", email: "ay.bd@owledmedia.com", role: "bd", team_name: "AY" },
  { user_id: "user_admin", name: "Seeding Admin", email: "admin@owledmedia.com", role: "admin", team_name: "—" },
];
