# Framer-style build prompt — FSOS + Seeding (LOCKED design)

Paste the block below. It generates the hero + feature grid for one app; run once for FSOS,
once for Seeding (swap the bracketed content). Append the "constraints" line at the end.

---

## THE PROMPT (FSOS)

Design a **pure-black, high-end product dashboard** in the exact style of Framer's product
page. Two-part layout: a bold hero, then a **feature grid of hairline-bordered panels where
a data visualization IS the content of each cell** (not decoration).

**System:** Background pure black `#000`. Thin `1px` hairline borders `rgba(255,255,255,.10)`
dividing a large rounded container into feature cells (2 columns, multiple rows). Headline &
UI type is a **bold geometric grotesque sans**, left-aligned, tight tracking, white. Body/
descriptions in muted grey `#8a8a92`. Accent is **purple `#8b5cf6` / `#a78bfa`** (used only
inside the visualizations and for one active state — never a purple gradient hero). Small
**monospace pill badges** (`P75`, `GOOD`, `MTD`). White primary button + dark secondary button.
Generous negative space.

**Top nav:** small — logo left, links (Dashboard · Trackers · Growth · Seeding · Tickets),
"Log in / + New" right.

**Hero:** big two-line headline **"Every reel, post and deal — measured in one seat."**, then
a white "Open dashboard" button + a dark "Preview as…" button.

**Feature grid cells (each = a viz + a bold sub-heading + a grey description):**
1. **Wireframe globe** with a few glowing purple edge-arcs → heading "Total ecosystem reach →",
   desc "828.9M reached across 29 live pages and 7 niches, rolled up daily."
2. **Before/after dot-grid cards** (like Framer's chunks): left card "Reels · 512M" grey dots,
   right card "Posts · 316M" purple dots, each with a small progress bar under it → heading
   "Reels vs posts breakdown".
3. **Node/tree diagram**: a Frontseat mark → branches to page icons (Founders Index, Elitefoundrs,
   India Founder) → heading "One tree, every page →".
4. **Core-Web-Vitals-style progress-bar card** with a green `GOOD` badge: rows "Reach ▲ 828.9M",
   "Growth ▲ 794.9M", "Cadence · on track" as purple bars → heading "Ecosystem health".
5. **Image/thumbnail cards** (2 small tiles with selection handles + a `● LIVE` chip): top reels
   → heading "Top performing content".
6. **Ranked stat list**: Founders Index 92M / Elitefoundrs 61M / India Founder 44M → heading
   "Leaderboard".

## THE PROMPT (SEEDING) — same system, swap the content:

**Hero headline:** "Close every brand deal — briefed, fulfilled, paid." Buttons "Open deals" +
"+ New brief". Feature cells:
1. **Pipeline-flow viz** (rails carrying deals left→right) → "Deal pipeline →", "5 deals from
   brief to paid — Notion, Zoho, CRED, and more."
2. **Deal-status dot grid** (5 dots: purple=live, green=paid, amber=awaiting, red=rejected,
   grey=archived) + a value bar → "Deals by status", "₹10.8L closed".
3. **Node/tree diagram**: Deal → deliverables → payment nodes → "Brief to invoice →".
4. **Progress-bar card** with an amber `AT RISK` badge: "Collected ₹3.2L" (green bar 30%),
   "Outstanding ₹7.6L" (amber bar 70%), "Fulfilment 2/12" (purple bar) → "Collection & fulfilment".
5. **Image cards**: live posted deliverables (2 tiles, `● LIVE`) → "Live deliverables · 170.5K views".
6. **Team leaderboard list**: OWLED Core ₹5.2L / Snoball ₹3.2L / Hooc ₹2.4L → "Revenue by team".

---

### CONSTRAINTS (append to either prompt)
*Pure black `#000`, hairline `rgba(255,255,255,.10)` borders, purple `#8b5cf6` accent only inside
the data-viz, bold grotesque sans, monospace badges, white primary button. The visualization is
the hero of each cell — give it as much care as Framer gives the globe and the chunk grids. 16:9,
high-fidelity realistic UI, sharp legible text, no lorem, use exactly these labels and numbers.
Do NOT use a gradient hero, glowing wordmark, or atmospheric background — this is a precise,
technical, data-forward dashboard.*
