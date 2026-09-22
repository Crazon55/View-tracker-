import { istDateStr, addDays, nowIso } from "./dates";
import { DEFAULT_CATEGORIES } from "./constants";
import { ensureToolSlices } from "./seedTools";

const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

// simple seeded PRNG for stable-ish demo data
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IP_DEFS = [
  { code: "101xf.", name: "101xfounders", hex: "#9F1239", posts: 3, reels: 4, postsMax: 5, reelsMax: 4 },
  { code: "FII", name: "FoundersInIndia", hex: "#2563EB", posts: 3, reels: 3, postsMax: 3, reelsMax: 3 },
  { code: "IFC", name: "IndianFoundersCo", hex: "#0D9488", posts: 3, reels: 2, postsMax: 4, reelsMax: 3 },
  { code: "Bizz", name: "BizzIndia", hex: "#D97706", posts: 7, reels: 5, postsMax: 9, reelsMax: 6 },
  { code: "IFC 2", name: "IndiaFoundersCore", hex: "#4F46E5", posts: 0, reels: 2, postsMax: 0, reelsMax: 2 },
  { code: "IBC", name: "IndiaBusinessCom", hex: "#059669", posts: 4, reels: 4, postsMax: 5, reelsMax: 5 },
  { code: "SC", name: "StartupCoded", hex: "#7C3AED", posts: 3, reels: 2, postsMax: 3, reelsMax: 3 },
  { code: "IHN", name: "IndiaHappeningNow", hex: "#C2410C", posts: 0, reels: 5, postsMax: 0, reelsMax: 7 },
];

const IP_MENUS = {
  "101xf.": ["statement/proven BO", "case study/proven BO", "happenings", "A-roll", "news"],
  FII: ["fact static/proven BO", "news roundup/happening", "XF collaboration", "statement", "A-roll", "A-roll/news"],
  IFC: ["fact static", "proven BO/happening", "massive happening", "A-roll", "news", "case study"],
  Bizz: ["business news roundup", "fact static", "happenings", "proven BO", "informational A-roll", "case study (explainer)", "news/happenings"],
  "IFC 2": ["A-roll reel — glow edit, strong music"],
  IBC: ["fact static", "statement", "proven BO/happening", "happening", "A-roll", "written case study treatment", "video case study treatment"],
  SC: ["startup news roundup/happening", "XF collaboration", "proven BO/happening", "A-roll clips"],
  IHN: ["current-affairs/news reels", "wider editorial focus"],
};

const USER_DEFS = [
  { name: "Jaskaran Singh", roles: ["Founder/Admin", "CS"], streams: ["BO", "HPN"], skills: ["Editorial", "Strategy"], initials: "JS", color: "#9F1239" },
  { name: "Ishaan Mehta", roles: ["Short-form Lead"], streams: ["BO", "HPN"], skills: ["Editorial", "Review"], initials: "IM", color: "#2563EB" },
  { name: "Ananya Rao", roles: ["CS"], streams: ["BO", "HPN"], skills: ["Scripting", "Research"], initials: "AR", color: "#0D9488" },
  { name: "Rohan Kapoor", roles: ["CS"], streams: ["BO", "HPN"], skills: ["Scripting", "Trends"], initials: "RK", color: "#D97706" },
  { name: "Meera Nair", roles: ["COA"], streams: ["BO", "HPN"], skills: ["Ops", "Scheduling"], initials: "MN", color: "#4F46E5" },
  { name: "Kabir Sethi", roles: ["Designer"], streams: ["BO"], skills: ["Design", "Canva"], initials: "KS", color: "#059669" },
  { name: "Zoya Khan", roles: ["Editor"], streams: ["BO", "HPN"], skills: ["Editing", "Motion"], initials: "ZK", color: "#7C3AED" },
  { name: "Pintu Das", roles: ["Editor"], streams: ["HPN"], skills: ["Editing", "Fast-turn"], initials: "PD", color: "#C2410C" },
  { name: "Devraj Bose", roles: ["COC"], streams: ["BO", "HPN"], skills: ["Distribution", "Calendar"], initials: "DB", color: "#1D4ED8" },
];

const BO_TITLES = [
  ["How Zerodha built a ₹30,000 Cr business with zero ad spend", "case study"],
  ["The 5 pricing mistakes killing early Indian SaaS startups", "fact static"],
  ["Why D2C founders are quietly switching back to offline retail", "proven BO"],
  ["Nikhil Kamath's contrarian rule for hiring your first 10 people", "statement"],
  ["The unit economics behind India's 10-minute delivery wars", "case study"],
  ["What Zoho teaches us about staying private and profitable", "case study"],
  ["3 numbers every founder must know before raising a seed round", "fact static"],
  ["The quiet rise of India's ₹100 Cr single-founder companies", "proven BO"],
  ["How Boat turned earphones into a lifestyle brand", "case study"],
  ["Why most startup 'growth hacks' are just survivorship bias", "statement"],
  ["The playbook behind Rare Rabbit's premium positioning", "case study"],
  ["Cash flow is a feature, not an afterthought", "statement"],
  ["How a Jaipur bootstrapper hit ₹8 Cr ARR without a sales team", "proven BO"],
  ["The margin math nobody shows you about cloud kitchens", "fact static"],
  ["Why great founders write memos, not decks", "statement"],
  ["Decoding the CRED business model in 90 seconds", "case study"],
  ["The hidden cost of discounting your way to GMV", "fact static"],
  ["What India's manufacturing founders get right about focus", "proven BO"],
  ["A-roll: the one metric that predicts churn before it happens", "A-roll clip"],
  ["Glow-edit A-roll: building in public actually works", "A-roll clip"],
  ["The founder's guide to reading a term sheet without a lawyer", "case study"],
  ["Why niche beats scale for India's first-time founders", "statement"],
  ["How Lenskart turned eyewear into a tech-retail machine", "case study"],
  ["The real reason your CAC keeps climbing every quarter", "fact static"],
  ["What Meesho understood about Bharat that others missed", "proven BO"],
  ["Founders: stop confusing revenue with traction", "statement"],
  ["The quiet power of a boring, repeatable sales motion", "proven BO"],
  ["How Nykaa built trust before it built scale", "case study"],
  ["Three balance-sheet lines investors read first", "fact static"],
  ["Why your second product usually kills your focus", "statement"],
  ["The bootstrapped SaaS that beat a funded rival", "proven BO"],
  ["Decoding Groww's flywheel in one carousel", "case study"],
  ["The hiring mistake that quietly caps most startups", "fact static"],
  ["What Dukaan learnt from cutting 90% of its staff", "case study"],
  ["Retention is the only growth metric that compounds", "statement"],
  ["How Wakefit made sleep a category worth ₹1,000 Cr", "case study"],
  ["The pricing psychology behind India's subscription boom", "fact static"],
  ["Why most 'category creation' pitches are a trap", "statement"],
  ["The margin story hiding inside quick-commerce", "fact static"],
  ["How Zepto compressed a decade of logistics into months", "case study"],
  ["The underrated moat of obsessive customer support", "proven BO"],
  ["A-roll: the founder habit that separates 10x from 1x", "A-roll clip"],
  ["Why distribution beats product more often than we admit", "statement"],
  ["How Sleepy Owl turned coffee into a D2C playbook", "case study"],
  ["The cash-conversion cycle nobody teaches founders", "fact static"],
  ["What Rapido proves about winning tier-2 India first", "proven BO"],
  ["The one slide that makes or breaks a seed pitch", "fact static"],
  ["Glow-edit A-roll: build the audience before the product", "A-roll clip"],
  ["Why founder-led sales should never fully stop", "statement"],
  ["How boAt out-marketed brands ten times its size", "case study"],
];

const HPN_TITLES = [
  ["Breaking: RBI's new UPI limits explained for founders", "news roundup"],
  ["Startup layoffs this week — what actually happened", "news roundup"],
  ["The IPO everyone in the ecosystem is talking about today", "happening"],
  ["Live: India's biggest tech summit — 5 takeaways so far", "massive happening"],
  ["A viral founder tweet just reignited the moonlighting debate", "happening"],
  ["New FDI rules dropped — here's the 60-second version", "news roundup"],
  ["That ₹2,000 Cr acquisition, decoded before lunch", "happening"],
  ["Why the whole timeline is arguing about this pricing change", "happening"],
  ["Budget reaction: what changed for early-stage startups", "news roundup"],
  ["Massive: a unicorn just cut its valuation in half overnight", "massive happening"],
  ["Just in: a major SaaS player enters the Indian market", "news roundup"],
  ["The founder apology thread everyone is dissecting today", "happening"],
  ["Breaking: new data-protection rules land for startups", "news roundup"],
  ["A ₹500 Cr fund just announced its India thesis", "happening"],
  ["Why this week's funding winter chatter is trending again", "happening"],
  ["Live: the keynote line that set the ecosystem buzzing", "massive happening"],
  ["That surprise CEO exit, explained in 60 seconds", "happening"],
  ["New GST clarification founders were waiting for", "news roundup"],
  ["The acquisition rumour that moved three stocks today", "happening"],
  ["Reaction: the policy tweak that changes D2C economics", "news roundup"],
  ["A viral product recall just became a case study overnight", "happening"],
  ["Breaking: two rivals announce a shock merger", "massive happening"],
  ["The hiring freeze memo that leaked this morning", "happening"],
];

const HOOKS = [
  "Stop scrolling — this changes how you think about {topic}.",
  "Nobody tells you this about {topic}.",
  "The uncomfortable truth about {topic}.",
  "Founders keep getting {topic} wrong. Here's the fix.",
  "This 90-second breakdown of {topic} will save you months.",
];

const SUB_HOOKS = [
  "Watch till the number — that's the actual mechanism.",
  "The second beat is the part most founders miss.",
  "Then this one decision made the rest obvious.",
  "Here's what happens if you ignore this for 12 months.",
  "Stay for the example — it's uncomfortably specific.",
];

const CAROUSEL_BODIES = [
  ["The setup", "Most people assume the obvious. It's wrong.", "Here's what the data actually shows.", "One example that makes it click.", "What to do on Monday morning."],
  ["The myth", "Why it persists", "The real mechanism", "A concrete number", "Your takeaway"],
];

const CANVA = "https://www.canva.com/design/DEMO-placeholder/view";
const DRIVE = "https://drive.google.com/file/d/DEMO-placeholder/view";
const IG = "https://www.instagram.com/reel/DEMO-placeholder/";

export function buildSeed() {
  const rand = mulberry32(20260601);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const chance = (p) => rand() < p;

  const anchor = istDateStr(); // demo "today" (IST) at seed time
  const ips = IP_DEFS.map((d, i) => ({
    id: `ip-${i + 1}`,
    code: d.code,
    name: d.name,
    hex: d.hex,
    active: true,
    floors: { posts: d.posts, reels: d.reels },
    ranges: { postsMax: d.postsMax, reelsMax: d.reelsMax },
    menu: IP_MENUS[d.code] || [],
    boTarget: null, // unconfigured BO quota — intentionally left null
    perfTarget: {
      reel: d.code === "IHN" ? 50000 : 8000,
      post: d.posts > 0 ? 4000 : null,
      note: d.code === "IHN" ? "IHN 50k reel baseline goal (known)." : "Illustrative demo target — editable.",
    },
    spacingMinutes: null,
  }));

  const users = USER_DEFS.map((u, i) => ({ id: `u-${i + 1}`, active: true, ...u }));
  const byRole = (r) => users.find((u) => u.roles.includes(r));
  const founder = byRole("Founder/Admin");
  const shortLead = byRole("Short-form Lead");
  const csList = users.filter((u) => u.roles.includes("CS"));
  const coa = byRole("COA");
  const designers = users.filter((u) => u.roles.includes("Designer"));
  const editors = users.filter((u) => u.roles.includes("Editor"));
  const producers = [...designers, ...editors];
  const coc = byRole("COC");

  const categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));

  const ips_ids = ips.map((i) => i.id);
  const pickIps = (n) => {
    const shuffled = [...ips_ids].sort(() => rand() - 0.5);
    return shuffled.slice(0, n);
  };

  const ideas = [];
  const versions = [];
  const placements = [];
  const publications = [];
  const snapshots = [];
  const comments = [];
  const activity = [];
  const batches = [];

  const logActivity = (ideaId, type, text, actorId, at) =>
    activity.push({ id: uid("act"), ideaId, type, text, actorId, at: at || nowIso() });

  function makeBrief(format, title, topic) {
    const b = { sharedHook: pick(HOOKS).replace("{topic}", topic) };
    if (format === "Reel") {
      b.editingDirection = "Punchy 6s hook, B-roll under key stat, hard cut to CTA. Glow grade.";
      b.musicNotes = "Ambient build → beat drop at the reveal. Ref link below.";
      b.musicLink = "https://demo.link/track";
    }
    if (format === "Carousel") {
      b.slides = pick(CAROUSEL_BODIES).map((body, idx) => ({ id: uid("sl"), body }));
      b.visualHook = "Bold serif number on slide 1, terracotta accent, lots of whitespace.";
    }
    if (format === "Static") {
      b.bodyCopy = title + " — one strong line, credited source in the corner.";
      b.visualHook = "Single statement over a muted photo. High contrast type.";
    }
    return b;
  }

  function makeVersions(idea, reviewStatusFor) {
    return idea.destinations.map((ipId, idx) => {
      const status = reviewStatusFor(idx);
      const links = [];
      if (["awaiting_review", "changes_requested", "ready"].includes(status)) {
        links.push({ id: uid("lnk"), type: idea.format === "Reel" ? "drive" : "canva", url: idea.format === "Reel" ? DRIVE : CANVA, label: idea.format === "Reel" ? "Edited cut (Pintu)" : "Canva design" });
      }
      const v = {
        id: uid("ver"),
        ideaId: idea.id,
        ipId,
        hookOverride: idx === 0 ? "" : pick(HOOKS).replace("{topic}", idea.topic),
        subHook: idea.format === "Reel" ? pick(SUB_HOOKS) : "",
        bodyText: idea.format === "Static" ? (idea.brief.bodyCopy || "") : idea.format === "Carousel" ? (idea.brief.slides || []).map((s) => s.body).filter(Boolean).join("\n\n") : "",
        caption: `${idea.title} — full breakdown in comments. #startup #india`,
        notesOverride: "",
        assetLinks: links,
        reviewStatus: status,
        revisions: links.length ? [{ id: uid("rev"), at: nowIso(), by: idea.productionOwnerId, note: "Initial upload" }] : [],
      };
      versions.push(v);
      return v;
    });
  }

  let ideaCounter = 0;
  function newIdea(stream, title, category, format, opts = {}) {
    ideaCounter += 1;
    const topic = title.split(" ").slice(0, 4).join(" ").toLowerCase();
    const creator = stream === "BO" ? pick(csList) : pick(csList);
    const idea = {
      id: `idea-${ideaCounter}`,
      code: `${stream}-${String(ideaCounter).padStart(3, "0")}`,
      stream,
      title,
      topic,
      format,
      category,
      creatorId: creator.id,
      createdAt: opts.createdAt || nowIso(),
      sources: [
        { id: uid("src"), url: "https://youtube.com/watch?v=DEMO", label: "Reference video", start: format === "Reel" ? "00:42" : "", end: format === "Reel" ? "01:58" : "" },
        { id: uid("src"), url: "https://demo.article/link", label: "Supporting article" },
      ],
      brief: makeBrief(format, title, topic),
      destinations: opts.destinations || pickIps(opts.destCount || 3),
      approval: opts.approval || { state: "pending", by: null, at: null },
      productionOwnerId: opts.productionOwnerId || null,
      reviewerId: opts.reviewerId || null,
      batchId: opts.batchId || null,
      deadline: opts.deadline || null,
      bypassUsed: opts.bypassUsed || null,
      dropped: [],
    };
    ideas.push(idea);
    logActivity(idea.id, "created", `Idea created by ${creator.name}`, creator.id, idea.createdAt);
    return idea;
  }

  // ---- BO BATCHES with mixed states ----
  const boPool = [...BO_TITLES];
  function takeTitle(pool) {
    return pool.length ? pool.shift() : ["Untitled idea", "fact static"];
  }

  // Batch 1: fully ready future stock (bank)
  const batch1 = { id: uid("batch"), name: "BO Batch — Founder Playbooks", stream: "BO", deadline: addDays(anchor, 2), reviewerId: founder.id, ideaIds: [] };
  batches.push(batch1);
  for (let i = 0; i < 12; i++) {
    const [title, cat] = takeTitle(boPool);
    const format = chance(0.5) ? "Carousel" : chance(0.5) ? "Reel" : "Static";
    const idea = newIdea("BO", title, cat, format, {
      destCount: 2 + Math.floor(rand() * 4),
      approval: { state: "approved", by: founder.id, at: addDays(anchor, -4) + "T05:00:00.000Z" },
      productionOwnerId: pick(producers).id,
      reviewerId: founder.id,
      batchId: batch1.id,
      deadline: batch1.deadline,
      createdAt: addDays(anchor, -6) + "T04:00:00.000Z",
    });
    batch1.ideaIds.push(idea.id);
    makeVersions(idea, () => "ready");
    logActivity(idea.id, "approved", `Idea approved by ${founder.name}`, founder.id, idea.approval.at);
  }

  // Batch 2: in production / awaiting review / changes requested mix
  const batch2 = { id: uid("batch"), name: "BO Batch — Unit Economics", stream: "BO", deadline: addDays(anchor, 1), reviewerId: null, ideaIds: [] };
  batches.push(batch2);
  const reviewerForB2 = csList[1] || founder;
  batch2.reviewerId = reviewerForB2.id;
  for (let i = 0; i < 9; i++) {
    const [title, cat] = takeTitle(boPool);
    const format = chance(0.5) ? "Carousel" : "Reel";
    const idea = newIdea("BO", title, cat, format, {
      destCount: 2 + Math.floor(rand() * 3),
      approval: { state: "approved", by: founder.id, at: addDays(anchor, -2) + "T05:00:00.000Z" },
      productionOwnerId: pick(producers).id,
      reviewerId: reviewerForB2.id,
      batchId: batch2.id,
      deadline: batch2.deadline,
      createdAt: addDays(anchor, -3) + "T04:00:00.000Z",
    });
    batch2.ideaIds.push(idea.id);
    makeVersions(idea, (idx) => {
      if (i === 0 && idx === 0) return "changes_requested";
      if (i === 0) return "ready";
      if (idx === 0) return "awaiting_review";
      return chance(0.5) ? "in_production" : "awaiting_review";
    });
    if (i === 0) {
      const v = versions.find((vv) => vv.ideaId === idea.id && vv.reviewStatus === "changes_requested");
      if (v) comments.push({ id: uid("cm"), ideaId: idea.id, versionId: v.id, anchor: { type: "asset" }, text: "Hook lands late — tighten the first 3 seconds and re-grade.", authorId: reviewerForB2.id, at: nowIso(), resolved: false, replies: [] });
    }
    logActivity(idea.id, "approved", `Idea approved by ${founder.name}`, founder.id, idea.approval.at);
  }

  // Batch 3: approved but unassigned (needs COA assignment)
  const batch3 = { id: uid("batch"), name: "BO Batch — Contrarian Takes", stream: "BO", deadline: addDays(anchor, 3), reviewerId: csList[0].id, ideaIds: [] };
  batches.push(batch3);
  for (let i = 0; i < 6; i++) {
    const [title, cat] = takeTitle(boPool);
    const idea = newIdea("BO", title, cat, chance(0.5) ? "Carousel" : "Reel", {
      destCount: 2 + Math.floor(rand() * 3),
      approval: { state: "approved", by: founder.id, at: addDays(anchor, -1) + "T05:00:00.000Z" },
      batchId: batch3.id,
      reviewerId: csList[0].id,
      createdAt: addDays(anchor, -2) + "T04:00:00.000Z",
    });
    batch3.ideaIds.push(idea.id);
    makeVersions(idea, () => "not_started");
    logActivity(idea.id, "approved", `Idea approved by ${founder.name}`, founder.id, idea.approval.at);
  }

  // Batch 5: large-destination ready stock (demonstrates 6-destination volume)
  const batch5 = { id: uid("batch"), name: "BO Batch — Network Wide Bank", stream: "BO", deadline: addDays(anchor, 4), reviewerId: founder.id, ideaIds: [] };
  batches.push(batch5);
  for (let i = 0; i < 8; i++) {
    const [title, cat] = takeTitle(boPool);
    const format = chance(0.5) ? "Carousel" : chance(0.5) ? "Reel" : "Static";
    const idea = newIdea("BO", title, cat, format, {
      destCount: i < 3 ? 6 : 3 + Math.floor(rand() * 3),
      approval: { state: "approved", by: founder.id, at: addDays(anchor, -3) + "T05:00:00.000Z" },
      productionOwnerId: pick(producers).id,
      reviewerId: founder.id,
      batchId: batch5.id,
      deadline: batch5.deadline,
      createdAt: addDays(anchor, -5) + "T04:00:00.000Z",
    });
    batch5.ideaIds.push(idea.id);
    makeVersions(idea, (idx) => (idx < 4 ? "ready" : chance(0.5) ? "ready" : "in_production"));
    logActivity(idea.id, "approved", `Idea approved by ${founder.name}`, founder.id, idea.approval.at);
  }

  // Draft / awaiting approval BO ideas (not yet approved)
  const batch4 = { id: uid("batch"), name: "BO Batch — Draft Intake", stream: "BO", deadline: addDays(anchor, 5), reviewerId: null, ideaIds: [] };
  batches.push(batch4);
  for (let i = 0; i < 5; i++) {
    const [title, cat] = takeTitle(boPool);
    const idea = newIdea("BO", title, cat, "Carousel", {
      destCount: 3 + Math.floor(rand() * 3),
      approval: i === 0 ? { state: "pending", by: null, at: null } : { state: "pending", by: null, at: null },
      batchId: batch4.id,
      createdAt: addDays(anchor, -1) + "T09:00:00.000Z",
    });
    batch4.ideaIds.push(idea.id);
    makeVersions(idea, () => "not_started");
    // anchored comment on a slide of the first draft idea
    if (i === 0 && idea.brief.slides) {
      comments.push({ id: uid("cm"), ideaId: idea.id, versionId: null, anchor: { type: "slide", slideId: idea.brief.slides[1].id }, text: "Can we lead with the number here instead? Feels stronger.", authorId: coa.id, at: nowIso(), resolved: false, replies: [{ id: uid("rp"), authorId: idea.creatorId, at: nowIso(), text: "Agreed, reworking slide 2." }] });
    }
  }

  // ---- HPN ideas ----
  const hpnPool = [...HPN_TITLES];
  // Urgent HPN in production, pre-approval bypass used
  {
    const [title, cat] = hpnPool.shift();
    const idea = newIdea("HPN", title, cat, "Reel", {
      destCount: 2,
      approval: { state: "pending", by: null, at: null },
      productionOwnerId: pick(editors).id,
      reviewerId: shortLead.id,
      bypassUsed: { by: coa.id, at: nowIso(), basis: "production_start" },
      createdAt: addDays(anchor, 0) + "T06:30:00.000Z",
    });
    makeVersions(idea, (idx) => (idx === 0 ? "awaiting_review" : "in_production"));
    logActivity(idea.id, "bypass", `${coa.name} started production without prior idea approval (authorised HPN bypass)`, coa.id, idea.bypassUsed.at);
  }
  // A few ready HPN
  for (let i = 0; i < 4; i++) {
    const [title, cat] = hpnPool.shift();
    const idea = newIdea("HPN", title, cat, chance(0.5) ? "Reel" : "Static", {
      destCount: 1 + Math.floor(rand() * 2),
      approval: { state: "approved", by: shortLead.id, at: addDays(anchor, 0) + "T05:00:00.000Z" },
      productionOwnerId: pick(editors).id,
      reviewerId: shortLead.id,
      createdAt: addDays(anchor, 0) + "T04:00:00.000Z",
    });
    makeVersions(idea, () => "ready");
    logActivity(idea.id, "approved", `Idea approved by ${shortLead.name}`, shortLead.id, idea.approval.at);
  }
  // A few HPN in production / awaiting review
  for (let i = 0; i < 4; i++) {
    const [title, cat] = hpnPool.shift();
    const idea = newIdea("HPN", title, cat, "Reel", {
      destCount: 1 + Math.floor(rand() * 2),
      approval: { state: "approved", by: shortLead.id, at: addDays(anchor, 0) + "T04:30:00.000Z" },
      productionOwnerId: pick(editors).id,
      reviewerId: shortLead.id,
      createdAt: addDays(anchor, 0) + "T03:30:00.000Z",
    });
    makeVersions(idea, (idx) => (idx === 0 ? "awaiting_review" : "in_production"));
    logActivity(idea.id, "approved", `Idea approved by ${shortLead.name}`, shortLead.id, idea.approval.at);
  }

  // ---- HISTORICAL published ideas across last 30 days (for cycles + performance) ----
  // Reuse BO + HPN titles; these are fully published with snapshots.
  const histTitles = [...BO_TITLES, ...HPN_TITLES];
  const cycleAnchor = addDays(anchor, -30);
  for (let day = 30; day >= 1; day--) {
    const date = addDays(anchor, -day);
    const perDay = 2 + Math.floor(rand() * 2); // 2-3 published ideas per day
    for (let k = 0; k < perDay; k++) {
      const [title, cat] = pick(histTitles);
      const stream = ["news roundup", "happening", "massive happening"].includes(cat) ? "HPN" : "BO";
      const format = chance(0.55) ? "Reel" : chance(0.5) ? "Carousel" : "Static";
      const dest = pickIps(1 + Math.floor(rand() * 3));
      const idea = newIdea(stream, title, cat, format, {
        destinations: dest,
        approval: { state: "approved", by: stream === "BO" ? founder.id : shortLead.id, at: date + "T05:00:00.000Z" },
        productionOwnerId: pick(producers).id,
        reviewerId: stream === "BO" ? founder.id : shortLead.id,
        createdAt: addDays(date, -3) + "T04:00:00.000Z",
      });
      const vs = makeVersions(idea, () => "ready");
      // publish each version; sometimes make a collaboration (single publication for 2 IPs)
      const collab = vs.length >= 2 && chance(0.15);
      if (collab) {
        const publishedAt = date + `T${String(9 + Math.floor(rand() * 9)).padStart(2, "0")}:15:00.000Z`;
        const pub = { id: uid("pub"), versionIds: vs.slice(0, 2).map((v) => v.id), ipIds: vs.slice(0, 2).map((v) => v.ipId), url: IG, publishedAt, placementIds: [], isCollab: true };
        vs.slice(0, 2).forEach((v) => {
          const pl = { id: uid("pl"), versionId: v.id, ipId: v.ipId, date, time: "09:15", order: 1, state: "confirmed", history: [], exceptionReason: "Deliberate collaboration" };
          placements.push(pl); pub.placementIds.push(pl.id);
        });
        publications.push(pub);
        addSnapshot(pub, date, format, dest[0]);
        // remaining versions publish individually
        vs.slice(2).forEach((v) => publishVersion(v, date, format));
      } else {
        vs.forEach((v) => publishVersion(v, date, format));
      }
    }
  }

  function publishVersion(v, date, format) {
    const publishedAt = date + `T${String(9 + Math.floor(rand() * 10)).padStart(2, "0")}:${String(Math.floor(rand() * 6) * 10).padStart(2, "0")}:00.000Z`;
    const pl = { id: uid("pl"), versionId: v.id, ipId: v.ipId, date, time: publishedAt.slice(11, 16), order: 1, state: "confirmed", history: [], exceptionReason: null };
    placements.push(pl);
    const pub = { id: uid("pub"), versionIds: [v.id], ipIds: [v.ipId], url: IG, publishedAt, placementIds: [pl.id], isCollab: false };
    publications.push(pub);
    addSnapshot(pub, date, format, v.ipId);
  }

  function addSnapshot(pub, date, format, ipId) {
    const ip = ips.find((i) => i.id === ipId);
    const base = format === "Reel" ? ip.perfTarget.reel : ip.perfTarget.post || 4000;
    // most captured, a few missing / late / zero
    const roll = rand();
    let views = Math.round(base * (0.3 + rand() * 1.5));
    let measuredAt = pub.publishedAt.slice(0, 10);
    let ageNote = 24;
    if (roll < 0.08) { views = null; } // missing measurement
    else if (roll < 0.13) { views = 0; } // explicit zero
    else if (roll < 0.2) { ageNote = 31; } // late capture
    const measuredIso = addDays(pub.publishedAt.slice(0, 10), 1) + `T${String((Number(pub.publishedAt.slice(11, 13)) + (ageNote - 24)) % 24).padStart(2, "0")}:00:00.000Z`;
    const dueAt = new Date(new Date(pub.publishedAt).getTime() + 24 * 3600000).toISOString();
    snapshots.push({
      id: uid("snap"),
      publicationId: pub.id,
      views,
      measuredAt: views === null ? null : measuredIso,
      ageHours: views === null ? null : ageNote,
      recordedBy: coc.id,
      dueAt,
    });
  }

  // ---- FUTURE placements for READY bank stock (batch1 + ready HPN) over next 10 days ----
  const readyBankVersions = versions.filter((v) => v.reviewStatus === "ready" && !publications.some((p) => p.versionIds.includes(v.id)));
  // Place ~60% of ready stock into future days, leave rest unallocated
  readyBankVersions.forEach((v, i) => {
    if (i % 5 === 0) return; // leave some unallocated
    const idea = ideas.find((id) => id.id === v.ideaId);
    if (!idea || idea.stream !== "BO") return;
    const offset = 1 + (i % 9);
    const date = addDays(anchor, offset);
    // avoid same idea same date on multiple IPs (repetition rule) — stagger by ip index
    const dayOffset = idea.destinations.indexOf(v.ipId);
    placements.push({
      id: uid("pl"), versionId: v.id, ipId: v.ipId, date: addDays(date, dayOffset), time: null, order: 1, state: "pending", history: [], exceptionReason: null,
    });
  });

  // Capture tasks: derive from publications w/o complete snapshot. Add a few overdue ones by using recent publications lacking snapshot values (already have some null).

  // ---- Demonstrate exception + collaboration paths on TODAY ----
  // 1) Intentional same-day repetition (unauthorised) on today across two IPs of one ready BO idea.
  const repIdea = ideas.find((i) => i.stream === "BO" && versions.filter((v) => v.ideaId === i.id && v.reviewStatus === "ready").length >= 2);
  if (repIdea) {
    const rv = versions.filter((v) => v.ideaId === repIdea.id && v.reviewStatus === "ready").slice(0, 2);
    rv.forEach((v) => {
      placements.filter((p) => p.versionId === v.id && p.state !== "cancelled").forEach((p) => (p.state = "cancelled"));
      placements.push({ id: uid("pl"), versionId: v.id, ipId: v.ipId, date: anchor, time: null, order: 1, state: "pending", history: [], exceptionReason: null });
    });
    logActivity(repIdea.id, "placed", "Placed on two IPs today — awaiting authorised exception", coc.id, nowIso());
  }
  // 2) One HPN publication today so collaboration linkage has a target and Today shows a live item.
  const hpnReadyToday = versions.find((v) => { const idea = ideas.find((i) => i.id === v.ideaId); return idea && idea.stream === "HPN" && v.reviewStatus === "ready" && !publications.some((p) => p.versionIds.includes(v.id)); });
  if (hpnReadyToday) {
    const publishedAt = anchor + "T08:20:00.000Z";
    const pl = { id: uid("pl"), versionId: hpnReadyToday.id, ipId: hpnReadyToday.ipId, date: anchor, time: "08:20", order: 1, state: "confirmed", history: [], exceptionReason: null };
    placements.push(pl);
    const pub = { id: uid("pub"), versionIds: [hpnReadyToday.id], ipIds: [hpnReadyToday.ipId], url: "https://instagram.com/reel/today-demo", publishedAt, placementIds: [pl.id], isCollab: false };
    publications.push(pub);
    const dueAt = new Date(new Date(publishedAt).getTime() + 24 * 3600000).toISOString();
    snapshots.push({ id: uid("snap"), publicationId: pub.id, views: null, measuredAt: null, ageHours: null, recordedBy: null, dueAt });
  }
  // 3) Also place a couple of ready versions on today so the execution list is populated.
  readyBankVersions.slice(0, 4).forEach((v, k) => {
    if (placements.some((p) => p.versionId === v.id && p.state !== "cancelled" && p.date === anchor)) return;
    const idea = ideas.find((i) => i.id === v.ideaId);
    // avoid creating another same-idea today conflict
    if (repIdea && idea && idea.id === repIdea.id) return;
    const conflictToday = placements.some((p) => p.state !== "cancelled" && p.date === anchor && versions.find((vv) => vv.id === p.versionId)?.ideaId === idea?.id);
    if (conflictToday) return;
    placements.filter((p) => p.versionId === v.id && p.state !== "cancelled").forEach((p) => (p.state = "cancelled"));
    placements.push({ id: uid("pl"), versionId: v.id, ipId: v.ipId, date: anchor, time: null, order: 1, state: "pending", history: [], exceptionReason: null });
  });

  const settings = {
    thresholds: { good: 100, average: 50 },
    baselineSample: 5,
    cycleAnchor,
    spacingMinutes: null,
    approverBoId: founder.id, // currently Jaskaran approves BO
    shortFormLeadId: shortLead.id,
    hpnBypassUserIds: [coa.id, founder.id, shortLead.id],
    exceptionApproverIds: [founder.id, shortLead.id],
  };

  return ensureToolSlices({
    meta: { anchor, seededAt: nowIso(), version: 2 },
    settings,
    ips,
    users,
    categories,
    batches,
    ideas,
    versions,
    placements,
    publications,
    snapshots,
    comments,
    activity,
    notifications: buildNotifications({ ideas, versions, coa, csList, snapshots, publications }),
    actingUserId: founder.id,
  });
}

function buildNotifications({ ideas, versions, snapshots, publications }) {
  const n = [];
  const awaiting = versions.filter((v) => v.reviewStatus === "awaiting_review").slice(0, 3);
  awaiting.forEach((v) => {
    const idea = ideas.find((i) => i.id === v.ideaId);
    if (idea) n.push({ id: uid("nt"), type: "review_request", text: `Review requested: ${idea.title}`, ideaId: idea.id, at: new Date().toISOString(), read: false });
  });
  const missing = snapshots.filter((s) => s.views === null).slice(0, 2);
  missing.forEach((s) => {
    const pub = publications.find((p) => p.id === s.publicationId);
    const v = pub && versions.find((x) => pub.versionIds.includes(x.id));
    n.push({ id: uid("nt"), type: "capture_due", text: "View capture overdue for a published item", publicationId: s.publicationId, ideaId: v?.ideaId || null, at: new Date().toISOString(), read: false });
  });
  return n;
}
