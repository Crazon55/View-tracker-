# FS-Seeding — Design System (CURRENT / incoming)

> **This is the look we are REPLACING.** FS-Seeding currently ships a flat Swiss/Linear
> aesthetic. During the merge it gets redesigned into the FSOS cinematic system
> (see `fsos-design.md`). This doc captures its current state + component inventory so
> nothing is lost in translation.

## Identity
- **Archetype:** "Swiss & High-Contrast — Linear style." Minimal, flat, editorial.
- **Mood:** Dark, clean, low-chrome. No gradients, no glow, minimal borders, no shadows.
- **Stack:** React 19 + CRA, Tailwind, Radix/shadcn, framer-motion, recharts.
- **Explicit rules:** dark mode only; **no purple gradients**; do NOT use Inter/Roboto.

## Color tokens (hex)
| Token | Hex | Use |
|---|---|---|
| background | `#09090b` | app canvas + sidebar |
| surface | `#121212` | cards |
| surfaceHover | `#18181b` | hover |
| border | `#27272a` (zinc-800) | borders (kept minimal) |
| primary | `#ffffff` | buttons, emphasis |
| primaryForeground | `#000000` | text on primary |
| secondaryText | `#a1a1aa` (zinc-400) | muted text |

**Status (subtle, 10% bg / 20% border):**
- success `#34d399` · warning `#fbbf24` · error `#f87171` · info `#60a5fa`

## Typography
- **Headings:** `Outfit` 400/500/600, `tracking-tight`.
- **Body:** `IBM Plex Sans` 400/500, `tracking-normal`.
- (Shares Outfit with FSOS — headings translate cleanly. Body swaps IBM Plex → Outfit.)

## Layout & components (current)
- **Spacing:** page `p-6`/`p-8`, card `p-5`. Generous but functional.
- **Radius:** `rounded-xl` cards, `rounded-lg` buttons/inputs, `rounded-full` badges.
- **Grid:** dense "Control Room" — `grid-cols-1 md:grid-cols-3 lg:grid-cols-4`, gap 4–6.
- **Sidebar:** fixed, solid `#09090b`; active `bg-zinc-900 text-white`; inactive `text-zinc-400 hover:text-white`.
- **Cards:** `bg-[#121212] border border-zinc-800/60 shadow-sm`, no gradients.
- **Badges:** pill, 1px border, status colors, `text-xs font-medium`.
- **Buttons:** primary `bg-white text-black hover:bg-zinc-200`; secondary `bg-zinc-900 border-zinc-800`.
- **Inputs:** `bg-zinc-900 border-zinc-800 focus:ring-1 focus:ring-zinc-500 text-sm`.
- **Deal Detail:** Notion-style — `max-w-4xl mx-auto`, large H1, muted metadata, blocks divided by `border-b`.
- **Kanban (Fulfillment):** `flex overflow-x-auto`, columns `w-80 shrink-0`, cards hover `translate-y-[-2px]`.
- **Icons:** lucide-react, `strokeWidth={1.5}`.
- **Motion:** subtle, `transition-all duration-200`.
- **Testing:** every interactive element has kebab-case `data-testid`.

## Page inventory (12 — what gets redesigned)
Overview (admin KPIs + revenue/views charts) · Approval Queue · Submit/Create Brief
(streamlined form) · All Deals · Teamwise Deals · Fulfillment Dashboard (Kanban) ·
Deal Detail (Notion-style) · Users & Roles · Monetisable Pages · BD Dashboard (gallery
grid) · Login · Pending Approval.

## Redesign direction (current → target)
| Aspect | Current (FS-Seeding) | Target (FSOS) |
|---|---|---|
| Canvas | flat `#09090b` | `#050505` + grid + noise |
| Cards | flat `#121212`, no gradient | glassmorphic, subtle blur + 7% border |
| Accent | white only | cyber-green `#00ff94` + electric-blue `#00d4ff` |
| Body font | IBM Plex Sans | Outfit |
| Numbers | default | JetBrains Mono |
| Feel | minimal Swiss | cinematic command-center |
| Keep | status colors, badge/kanban/Notion-detail patterns, spacious layout, lucide 1.5 | — |

## Prompt seed (paste into claude design)
> Redesign these brand-deal ops pages (Overview, Deals table, Kanban fulfillment board,
> Notion-style deal detail, streamlined brief form, users & roles) FROM a flat Linear
> look INTO the FSOS cinematic dark system: `#050505` canvas with faint grid, glassmorphic
> `#0b0b0b` cards, cyber-green `#00ff94` + electric-blue `#00d4ff` accents, Outfit body +
> JetBrains Mono numbers, rounded-xl, full-width spacious tables, lucide 1.5 icons, subtle
> framer-motion. Keep the status color system, pill badges, w-80 kanban columns, and
> max-w-4xl Notion deal detail — just reskin them premium.
