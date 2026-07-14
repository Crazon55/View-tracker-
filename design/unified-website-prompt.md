# Unified Website — Design/Build Prompt (FSOS + FS-Seeding → one app)

Paste the block below into Claude / your design tool.

---

Build **one unified dark, cinematic web app** that merges two existing products into a
single platform. **FSOS (View Tracker)** is the host shell and the design authority.
**FS-Seeding** (brand-deal / seeding ops) folds in as one more section inside it — not a
separate site. One login, one sidebar, one visual language.

## Design system (canonical — FSOS "Campaign Intelligence")
- **Canvas:** near-black `#050505` with a faint double-layer grid + 1.5% fractal-noise
  overlay. Never pure black, never flat.
- **Surfaces:** glassmorphic cards `#0b0b0b` with `backdrop-blur-xl`, 1px white-7% borders,
  inset top highlight; hover lifts opacity + soft `0 8px 32px` shadow.
- **Accents:** cyber-green `#00ff94` (primary — CTAs, active nav, chart strokes, focus
  rings) and electric-blue `#00d4ff` (secondary). Use neon glow for emphasis
  (`0 0 15px` green/blue). **No purple. No white-only flat buttons.**
- **Text:** foreground `#ededed`, muted `#808080`.
- **Type:** body/UI **Outfit** (letter-spacing −0.01em); numbers/data **JetBrains Mono**
  (−0.02em); large ghosted uppercase wordmarks for hero titles.
- **Radius:** `rounded-xl` cards, `rounded-lg` buttons/inputs, `rounded-full` badges.
- **Status colors:** success `#34d399`, warning `#fbbf24`, error `#f87171`, info `#60a5fa`
  (10% bg / 20% border pills).
- **Icons:** lucide-react, strokeWidth 1.5. **Motion:** framer-motion, 200–300ms.
- **Charts:** recharts, thin strokes, green primary + blue secondary on transparent,
  muted gridlines.
- **Rule:** spacious — data-heavy views use full page width, never cram.

## App shell
- Left **sidebar** (bg `#060606`, active item bg `#111` + green): FSOS tracker sections at
  top, then a divider, then a **"Seeding"** section grouping its pages. Inactive
  `text-zinc-400`, hover white.
- Single top-right identity chip ("Good afternoon, {name}") + one **"Preview as…"** role
  switcher that governs BOTH tracker and seeding visibility (RBAC-driven).
- One auth: Supabase login, `@owledmedia.com` only.

## Sections to include
**FSOS (existing style, keep):** Dashboard (Total Ecosystem Reach, Monthly Growth card
grid, Leaderboard, The Arena), trackers, FSI Canvas.

**Seeding (redesign INTO the system above):**
- **Overview** — KPI tile grid (revenue closed, deals approved, briefs pending, payments
  pending, views, blocked) + revenue-over-time and views-by-team recharts, styled like the
  FSOS dashboard panels.
- **Approval Queue** — reviewable deal cards/table with approve / needs-info / reject.
- **Create/Submit Brief** — streamlined multi-field form (brand, client, brief, assets,
  price, go-live), FSOS inputs + dialogs.
- **All Deals / Teamwise Deals** — full-width spacious tables, pill status badges, filters.
- **Fulfillment Board** — horizontal **Kanban**, columns `w-80`, cards hover-lift.
- **Deal Detail** — Notion-style `max-w-4xl`, large H1, muted metadata, `border-b` blocks,
  restyled premium (glass, green accents).
- **Users & Roles** and **Monetisable Pages** — admin tables; Monetisable Pages cross-link
  to tracked FSOS Pages.

## Keep from FS-Seeding (patterns, not the flat skin)
Status color system, pill badges, `w-80` kanban columns, `max-w-4xl` Notion deal detail,
spacious `p-6/p-8` layout, kebab-case `data-testid` on interactive elements.

## Do
Make Seeding feel native to FSOS — glass cards, green/blue accents, Outfit + JetBrains
Mono, grid canvas, subtle motion. Reskin premium; keep every function.

## Don't
No flat `#09090b`/`#121212` cards, no white-only buttons, no IBM Plex Sans, no purple, no
second login or second visual language.
