# FSOS (View Tracker) — Design System

> **This is the TARGET look.** When redesigning the Seeding pages, prompt toward *this*
> system. FSOS is the host platform; Seeding evolves into it.

## Identity
- **Name:** SnoBoard / FSOS — "Campaign Intelligence" design system
- **Mood:** Dark, cinematic, high-tech, gamified. Near-black canvas, neon accents,
  glassmorphism, subtle grid + noise texture. Data-forward and spacious — never cram.
- **Stack:** React 18 + Vite, Tailwind, Radix/shadcn, framer-motion, recharts.

## Color tokens (HSL vars → hex)
| Token | HSL | Hex | Use |
|---|---|---|---|
| `--background` | `0 0% 2%` | `#050505` | app canvas |
| `--foreground` | `0 0% 93%` | `#ededed` | primary text |
| `--card` / `--popover` | `0 0% 4.5%` | `#0b0b0b` | card/panel surface |
| `--primary` (Cyber Green) | `155 100% 50%` | `#00ff94` | primary accent, CTAs, active |
| `--secondary` / `--accent` (Electric Blue) | `192 100% 50%` | `#00d4ff` | secondary accent |
| `--muted` | `0 0% 11%` | `#1c1c1c` | muted surface |
| `--muted-foreground` | `0 0% 50%` | `#808080` | secondary text |
| `--destructive` | `0 84% 60%` | `#ef4444` | errors/danger |
| `--border` | `0 0% 14%` | `#242424` | borders |
| `--input` | `0 0% 11%` | `#1c1c1c` | input bg |
| `--ring` | `155 100% 50%` | `#00ff94` | focus ring |

**Sidebar:** bg `0 0% 2.5%` (#060606), fg `0 0% 65%`, active item bg `0 0% 7%` with
green primary, border `0 0% 9%`.

**Radius:** `--radius: 0.75rem` (cards `rounded-xl`, buttons/inputs `rounded-lg`).

## Signature effects (the "cinematic" feel)
- **Glassmorphism cards** (`.glass-card`): `backdrop-blur-xl`, gradient
  `rgba(255,255,255,0.03)→0.015`, 1px `rgba(255,255,255,0.07)` border, inset highlight.
  Hover lifts opacity + `0 8px 32px` shadow.
- **Neon glows:** green `0 0 15px rgba(0,255,148,.4), 0 0 45px rgba(0,255,148,.15)`;
  blue equivalent. Text variants `.text-glow-green/blue`.
- **Animated gradient border:** green→blue→green, `gradient-rotate 4s` loop.
- **Grid background** (`.bg-grid`): double-layer lines `rgba(255,255,255,0.018)` at
  40px + 120px. **Noise overlay:** fractal SVG at 1.5% opacity, fixed.
- **Live pulse** dot (`animate-ping` green) for realtime/active states.

## Typography
- **Body / UI:** `Outfit` (system-ui fallback), letter-spacing `-0.01em`. Weights 300–700.
- **Headings:** Outfit, tight tracking. Hero titles are large, uppercase, faded/ghosted
  (e.g. giant "FRONTSEAT" wordmark).
- **Numbers / data:** `JetBrains Mono` (`.font-mono-data`), letter-spacing `-0.02em`.
- `Inter` is also loaded (300–700) for finer UI text.

## Layout & patterns
- **Spacious.** Data-heavy views use full-page width — never cram (house rule).
- **Dashboard = card grid.** Large stat panels (e.g. Total Ecosystem Reach, Monthly
  Growth) with recharts line/area charts themed to green/blue on transparent.
- **Gamified surfaces:** Leaderboard (medals), The Arena, monthly Wrap — playful,
  emoji avatars, confetti (`canvas-confetti`).
- **Charts:** recharts, thin strokes, green primary + blue secondary + green dashed
  for splits; muted gridlines; minimal axes.
- **Icons:** `lucide-react`.
- **Motion:** framer-motion, smooth 200–300ms transitions.

## Prompt seed (paste into claude design)
> Dark cinematic analytics dashboard. Near-black `#050505` canvas with a faint grid and
> noise texture. Glassmorphic cards (`#0b0b0b`, subtle white 7% borders, backdrop blur).
> Accents: cyber-green `#00ff94` (primary) and electric-blue `#00d4ff` (secondary), used
> for CTAs, active states, chart strokes, and neon glows. Body font Outfit (tight
> tracking); numbers in JetBrains Mono. Rounded-xl cards, generous spacing, full-width
> data tables. lucide icons, framer-motion transitions, recharts charts. Gamified,
> premium, high-contrast — like a command center.
