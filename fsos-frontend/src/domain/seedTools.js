// Seed data for the tool surfaces ported from snoboard: 6-Day Tracker, Growth,
// Tickets, News Feed and the Users & Roles access store. Kept separate from
// seed.js so existing (v2) local data can be topped up without a reset.
import { addDays } from "./dates";

const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Instagram handle, tracker group and growth stage per seeded IP code.
export const IP_TOOL_META = {
  "101xf.": { handle: "101xfounders", group: "x101", stage: 3 },
  FII: { handle: "foundersinindia", group: "founders", stage: 3 },
  IFC: { handle: "indianfoundersco", group: "bizz_playbook", stage: 3 },
  Bizz: { handle: "bizzindia", group: "bizz", stage: 3 },
  "IFC 2": { handle: "indiafounderscore", group: "bizz_playbook", stage: 1 },
  IBC: { handle: "indiabusinesscom", group: "bizz_playbook", stage: 2 },
  SC: { handle: "startupcoded", group: "founders", stage: 2 },
  IHN: { handle: "indiahappeningnow", group: "news", stage: 2 },
};

export function toolMetaForIP(ip) {
  const m = IP_TOOL_META[ip.code];
  return {
    handle: ip.handle || m?.handle || String(ip.code || ip.name || "").toLowerCase().replace(/[^a-z0-9._]/g, ""),
    group: ip.group || m?.group || "none",
    stage: ip.stage || m?.stage || 1,
  };
}

// ---- 6-day cycles (calendar based: 1–6, 7–12, 13–18, 19–24, 25–end) ----
export function monthOf(dateStr) { return dateStr.slice(0, 7); }

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function sixDayCyclesFor(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0");
  return [
    { cycle: 1, start: `${ym}-01`, end: `${ym}-06`, deadline: `${ym}-07` },
    { cycle: 2, start: `${ym}-07`, end: `${ym}-12`, deadline: `${ym}-13` },
    { cycle: 3, start: `${ym}-13`, end: `${ym}-18`, deadline: `${ym}-19` },
    { cycle: 4, start: `${ym}-19`, end: `${ym}-24`, deadline: `${ym}-25` },
    { cycle: 5, start: `${ym}-25`, end: `${ym}-${last}`, deadline: `${ym}-${last}` },
  ];
}

const STAGE_BASE = { 3: 2_600_000, 2: 780_000, 1: 180_000 };

function buildSixDay(ips, users, anchor, rnd) {
  const entries = [];
  const topContent = [];
  const actuals = [];
  const curMonth = monthOf(anchor);
  const months = [-4, -3, -2, -1, 0].map((d) => shiftMonth(curMonth, d));
  const active = ips.filter((i) => i.active);
  const coc = users.find((u) => u.roles.includes("COC")) || users[0];

  months.forEach((ym, mIdx) => {
    const trend = 0.78 + mIdx * 0.07; // steady month-on-month growth
    const cycles = sixDayCyclesFor(ym);
    const monthSums = {};
    cycles.forEach((c) => {
      const isCurrent = ym === curMonth;
      if (isCurrent && anchor < c.deadline) return; // not due yet
      // the most recently overdue cycle is left partly unfilled to demo the alert
      const lastDue = isCurrent && !cycles.some((x) => x.cycle > c.cycle && anchor >= x.deadline);
      active.forEach((ip, k) => {
        if (lastDue && k % 3 === 1) return;
        const { stage } = toolMetaForIP(ip);
        const views = Math.round(STAGE_BASE[stage] * trend * (0.7 + rnd() * 0.6) / 1000) * 1000;
        const reelPct = ip.floors.posts === 0 ? 100 : Math.round(55 + rnd() * 30);
        entries.push({
          id: uid("sde"), month: ym, cycle: c.cycle, ipId: ip.id, views,
          reelPct, postPct: 100 - reelPct,
          reelPerf: Math.round((views * reelPct) / 100 / (ip.floors.reels * 6 || 1)),
          postPerf: ip.floors.posts ? Math.round((views * (100 - reelPct)) / 100 / (ip.floors.posts * 6)) : null,
          filledBy: coc.id, updatedAt: `${c.deadline}T06:30:00.000Z`,
        });
        monthSums[ip.id] = (monthSums[ip.id] || 0) + views;
        if (rnd() < 0.5) {
          const n = 1 + Math.floor(rnd() * 2);
          for (let j = 0; j < n; j++) {
            const type = rnd() < 0.7 ? "reel" : "post";
            topContent.push({
              id: uid("sdt"), month: ym, cycle: c.cycle, ipId: ip.id, type,
              link: `https://www.instagram.com/${type === "reel" ? "reel" : "p"}/DEMO${Math.floor(rnd() * 1e8).toString(36)}/`,
              views: Math.round(views * (0.08 + rnd() * 0.2) / 100) * 100,
            });
          }
        }
      });
    });
    if (ym !== curMonth) {
      active.forEach((ip) => {
        if (!monthSums[ip.id]) return;
        actuals.push({ month: ym, ipId: ip.id, actualViews: Math.round(monthSums[ip.id] * (0.94 + rnd() * 0.14) / 1000) * 1000, filledBy: coc.id });
      });
    }
  });

  return { entries, topContent, actuals, config: { assigneeId: coc.id } };
}

function buildGrowth(ips, anchor, rnd) {
  const cur = monthOf(anchor);
  const followers = [];
  [-4, -3, -2, -1].forEach((d) => {
    const ym = shiftMonth(cur, d);
    ips.filter((i) => i.active && toolMetaForIP(i).stage === 3).forEach((ip) => {
      followers.push({ month: ym, ipId: ip.id, followersGained: Math.round((6000 + rnd() * 22000) * (1 + (4 + d) * 0.12)) });
    });
  });
  return { followers };
}

// ---- Tickets ----
function buildTickets(users, anchor) {
  const by = (role) => users.find((u) => u.roles.includes(role)) || users[0];
  const mention = (u) => `@${u.name.split(" ")[0]}`;
  const [founder, lead, cs, coa, designer, editor, coc] =
    [by("Founder/Admin"), by("Short-form Lead"), by("CS"), by("COA"), by("Designer"), by("Editor"), by("COC")];
  const at = (daysAgo, hh = "09") => `${addDays(anchor, -daysAgo)}T${hh}:15:00.000Z`;
  const rows = [
    { title: "Distribution calendar freezes on 10-day view", description: "Scrolling the network calendar past day 7 freezes the tab for ~5s.\nHappens on Chrome, not on Safari.\nScreenshot attached.", urgency: "urgent", status: "not_started", tags: [mention(coa), "#distribution"], reporterId: coc.id, assigneeId: null, createdAt: at(0, "05") },
    { title: "Canva link not accepted on IFC version", description: "Pasting a Canva share link on the IFC version says 'invalid link'. Drive links work fine.", urgency: "normal", status: "not_started", tags: [mention(designer)], reporterId: designer.id, assigneeId: null, createdAt: at(1) },
    { title: "Need 'IHN' added to HPN quick record", description: "IHN is missing from the HPN quick-record destination list.", urgency: "low", status: "not_started", tags: ["#hpn"], reporterId: cs.id, assigneeId: null, createdAt: at(2) },
    { title: "Pintu export drops audio on 9:16", description: "Batch export from Pintu loses the music track on 9:16 renders. 1:1 is fine.", urgency: "urgent", status: "in_progress", tags: [mention(editor), "#pintu"], reporterId: editor.id, assigneeId: coa.id, createdAt: at(1, "11") },
    { title: "6-day tracker: Reel % not saving", description: "Reel % goes blank again after tabbing out on cycle 3.", urgency: "normal", status: "in_progress", tags: [mention(coc)], reporterId: coc.id, assigneeId: founder.id, createdAt: at(3) },
    { title: "Wrong view count on yesterday cohort", description: "Command Room yesterday cohort shows 0 for a post that has views captured.", urgency: "normal", status: "resolved", tags: [], reporterId: lead.id, assigneeId: coa.id, createdAt: at(6), resolvedAt: at(4) },
    { title: "Add dark overlay option to static template", description: "Request: statics need a dark overlay preset for photo-heavy posts.", urgency: "low", status: "resolved", tags: [mention(designer)], reporterId: cs.id, assigneeId: designer.id, createdAt: at(9), resolvedAt: at(7) },
  ];
  return rows.map((r, i) => ({
    id: uid("tkt"), ticketNumber: 101 + i, attachments: [], updatedAt: r.resolvedAt || r.createdAt, resolvedAt: null, ...r,
  }));
}

// ---- News feed ----
const NEWS_ITEMS = [
  ["news", "Inc42", "Zepto raises $450 Mn at a $7 Bn valuation ahead of its IPO filing", "The quick-commerce startup's latest round was led by existing investors, taking its total funding past $1.9 Bn as it prepares a draft red herring prospectus."],
  ["news", "Entrackr", "Mamaearth parent Honasa's D2C revenue crosses ₹2,000 Cr", "Honasa Consumer reported that its direct-to-consumer channel now contributes 38% of revenue, led by The Derma Co and Aqualogica."],
  ["news", "Economic Times", "RBI tightens rules on unsecured lending by fintech NBFCs", "The central bank raised risk weights on consumer credit extended through fintech partnerships, a move likely to slow BNPL growth."],
  ["news", "YourStory", "How a Jaipur founder built a ₹60 Cr D2C jewellery brand with no funding", "Bootstrapped since 2019, the brand sells demi-fine jewellery online and now runs 14 stores across Rajasthan and Gujarat."],
  ["news", "Mint", "Nithin Kamath on why Zerodha still won't spend on advertising", "The Zerodha founder said word-of-mouth and investor education content continue to drive over 70% of new accounts."],
  ["news", "Moneycontrol", "Shark Tank India season 5: Aman Gupta and Namita Thapar split on a ₹1 Cr offer", "A Bengaluru-based pet food startup walked away with a deal after a rare disagreement between the sharks over valuation."],
  ["news", "Business Standard", "Government extends Startup India seed fund scheme to 2030", "The Department for Promotion of Industry and Internal Trade said the scheme has supported over 2,500 startups so far."],
  ["news", "Economic Times", "Shree Balaji Industries Limited reports standalone net loss of Rs 3.2 crore in March quarter", "Shree Balaji Industries Limited reported a standalone net loss of Rs 3.2 crore for the quarter ended March, compared with a profit a year ago."],
  ["news", "Firstpost", "Login / Sign up — My Reads — Budget 2026 highlights for MSMEs", "Login / Sign Up My Reads My Account Newsletters हिंदी में {{firstname}} edit logout"],
  ["news", "Fortune India", "Ola Electric cuts scooter prices by 12% as competition heats up", "The EV maker's move follows aggressive pricing from Ather and Bajaj in the 1-lakh segment."],
  ["news", "Inc42", "Meesho turns profitable for the full financial year for the first time", "The social commerce platform posted a net profit of ₹58 Cr, helped by lower logistics costs and higher ad revenue."],
  ["news", "Indian Express", "Parliament passes the Digital Competition Bill amid opposition protest", "The bill introduces ex-ante regulation for large digital platforms operating in India."],
  ["news", "TechCrunch", "Razorpay launches an AI agent for small-business collections in India", "The payments company says the agent follows up on overdue invoices over WhatsApp and UPI."],
  ["news", "Mint", "Karan Industries Ltd reports consolidated net profit of Rs 1.1 crore in Q4", "Karan Industries Ltd posted a consolidated net profit of Rs 1.1 crore for Q4, up from Rs 0.8 crore."],
  ["inshorts", "Inshorts · ET", "Swiggy's Instamart to open 300 more dark stores by December", "Swiggy said Instamart will expand to 40 new cities, taking its dark-store count past 1,000.", "startup"],
  ["inshorts", "Inshorts · Mint", "Infosys wins $1.5 Bn deal from European retailer", "Infosys said the 10-year deal covers cloud, AI and digital transformation work for the retailer.", "technology"],
  ["inshorts", "Inshorts · PTI", "Nykaa founder Falguni Nayar joins the billionaire list again", "Nayar's net worth crossed $1 Bn after Nykaa shares rallied 18% this month.", "business"],
  ["inshorts", "Inshorts · ANI", "Bengaluru startup builds India's first homegrown GPU chip prototype", "The founders said the chip is aimed at edge AI workloads and will be taped out next year.", "technology"],
  ["inshorts", "Inshorts · Mint", "boAt files fresh draft papers for a ₹1,500 Cr IPO", "The wearables brand refiled its DRHP after withdrawing it in 2022.", "startup"],
  ["inshorts", "Inshorts · ET", "Union Budget: angel tax abolished for all classes of investors", "The finance minister said the move will boost funding for early-stage startups.", "business"],
  ["linkedin", "Kunal Shah", "Kunal Shah", "The best consumer businesses in India are built on delta of efficiency. If your product isn't 10x better, distribution will eat your margins alive.", null, 18400, 612],
  ["linkedin", "Nikhil Kamath", "Nikhil Kamath", "Spent the week with founders from tier-2 cities. The hunger is different. Capital is the only thing missing — and that is changing fast.", null, 24100, 880],
  ["linkedin", "Namita Thapar", "Namita Thapar", "Profitability is not a dirty word. Every founder pitching to me this season: show me unit economics before GMV.", null, 31200, 1204],
  ["linkedin", "Ghazal Alagh", "Ghazal Alagh", "Seven years ago we launched with one toxin-free product and ₹25 lakh. Grateful for every customer who trusted a new brand.", null, 15800, 530],
  ["linkedin", "Aman Gupta", "Aman Gupta", "Made in India is not a tag. It is a responsibility. Proud of our team shipping audio products from Noida this quarter.", null, 12900, 402],
];

const RESERVE_ITEMS = [
  ["news", "Inc42", "PhysicsWallah's offline centres now contribute 45% of revenue", "The edtech unicorn said its hybrid model helped it post a second straight profitable year."],
  ["news", "Entrackr", "CRED launches a UPI credit line for its members", "The Kunal Shah-led company will offer small-ticket credit on UPI in partnership with two banks."],
  ["inshorts", "Inshorts · PTI", "Tata Electronics to begin iPhone component exports from Hosur", "The plant will employ over 20,000 people once fully operational.", "technology"],
  ["news", "YourStory", "Lenskart founder Peyush Bansal backs a Delhi-based eyewear robotics startup", "The seed round will fund automated lens edging machines for small optical stores."],
  ["inshorts", "Inshorts · ET", "Zomato's Blinkit crosses ₹10,000 Cr in annualised GOV", "Blinkit said the milestone came 18 months ahead of internal targets.", "startup"],
  ["linkedin", "Anupam Mittal", "Anupam Mittal", "Founders — your pitch deck is not your company. Build something customers can't stop talking about, the deck writes itself.", null, 21300, 745],
  ["news", "Moneycontrol", "Rapido raises $200 Mn led by Prosus to expand cab services", "The bike-taxi platform is now valued at over $1.1 Bn."],
  ["inshorts", "Inshorts · ANI", "Government approves ₹10,000 Cr fund of funds for deep-tech startups", "The fund will invest through SEBI-registered alternative investment funds.", "business"],
];

function toFeedItem(row, minutesAgo) {
  const [type, source, title, body, category, likes, comments] = row;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return {
    id: `${type}-${slug}`,
    type,
    title,
    body,
    source,
    url: type === "linkedin"
      ? `https://www.linkedin.com/feed/update/demo-${slug.slice(0, 24)}`
      : `https://example.com/news/${slug}`,
    authorUrl: type === "linkedin" ? `https://www.linkedin.com/in/${source.toLowerCase().replace(/\s+/g, "-")}` : undefined,
    publishedAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    category: category || undefined,
    likes: likes || undefined,
    comments: comments || undefined,
  };
}

function buildNews(rnd) {
  const items = NEWS_ITEMS.map((row, i) => toFeedItem(row, 20 + i * 55 + Math.floor(rnd() * 40)));
  // One stale LinkedIn post — older than the 3-day window, so it's filtered out.
  items.push(toFeedItem(["linkedin", "Nithin Kamath", "Nithin Kamath", "Throwback to our first office in Bengaluru. Build slow, build to last.", null, 9800, 210], 5 * 24 * 60));
  return { items, reserve: RESERVE_ITEMS, lastScrapedAt: new Date().toISOString() };
}

export function scrapeReserveItems(reserve, count = 3) {
  return reserve.slice(0, count).map((row, i) => toFeedItem(row, 2 + i * 7));
}

export function buildToolsSeed({ ips, users, anchor }) {
  const rnd = mulberry32(20260922);
  return {
    sixDay: buildSixDay(ips, users, anchor, rnd),
    growth: buildGrowth(ips, anchor, rnd),
    tickets: buildTickets(users, anchor),
    ticketSeq: 108,
    news: buildNews(rnd),
    newsState: { saved: [], feedback: {}, rules: [] },
    access: { roles: {}, people: {} },
  };
}

// Tops up an existing db (seeded before these tools existed) without touching its data.
export function ensureToolSlices(d) {
  if (!d) return d;
  (d.ips || []).forEach((ip) => {
    const m = toolMetaForIP(ip);
    if (!ip.handle) ip.handle = m.handle;
    if (!ip.group) ip.group = m.group;
    if (!ip.stage) ip.stage = m.stage;
  });
  const missing = ["sixDay", "growth", "tickets", "ticketSeq", "news", "newsState", "access"].filter((k) => d[k] === undefined);
  if (!missing.length) return d;
  const fresh = buildToolsSeed({ ips: d.ips, users: d.users, anchor: d.meta.anchor });
  missing.forEach((k) => { d[k] = fresh[k]; });
  return d;
}
