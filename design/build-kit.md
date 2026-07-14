# FRONTSEAT × Seeding — Build Kit (Framer look + workspace switcher)

Everything to implement the locked shell in the FS-Seeding frontend (CRA + Tailwind +
shadcn + lucide-react + react-router 7). Paste, then tweak.

---

## 1. Font — swap to a tight grotesque (kills 60% of the "AI look")

The Framer look needs **Geist** (Vercel's font — free, exactly this aesthetic) or Inter Tight.

```bash
npm i @fontsource/geist-sans @fontsource/geist-mono
```

```js
// src/index.js (top)
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
```

---

## 2. Tokens — drop into `src/index.css`

```css
:root{
  --bg:#000;               /* app canvas */
  --panel:#0a0a0d;         /* dropdown / card surface */
  --panel-2:#111117;       /* raised */
  --line:rgba(255,255,255,.11);   /* the hairline — everything is bordered with this */
  --ink:#f4f4f7;           /* primary text */
  --dim:#8a8a94;           /* secondary text */
  --faint:#5a5a64;         /* labels, descriptions */

  /* accent switches per workspace (set on <body data-ws="…">) */
  --accent:#8b5cf6;  --accent-2:#a78bfa;         /* Content = purple */

  --radius-card:16px; --radius-ctl:10px; --radius-pill:999px;
}
body[data-ws="seeding"]{ --accent:#ec4899; --accent-2:#f472b6; }  /* Seeding = magenta */

body{ background:var(--bg); color:var(--ink);
  font-family:'Geist Sans',system-ui,sans-serif; letter-spacing:-.011em; }
.font-mono-data{ font-family:'Geist Mono',ui-monospace,monospace; }
```

Tailwind (`tailwind.config.js` → theme.extend):
```js
colors:{
  bg:'#000', panel:'#0a0a0d', 'panel-2':'#111117',
  ink:'#f4f4f7', dim:'#8a8a94', faint:'#5a5a64',
  line:'rgba(255,255,255,0.11)',
  accent:'var(--accent)', 'accent-2':'var(--accent-2)',
},
fontFamily:{ sans:['Geist Sans','system-ui','sans-serif'], mono:['Geist Mono','ui-monospace','monospace'] },
borderRadius:{ card:'16px', ctl:'10px' },
```

**House rules:** black canvas · every panel/card/cell separated by a `1px solid var(--line)`
hairline · numbers in `font-mono` · accent used ONLY inside data-viz + active states · no
gradients on the page background.

---

## 3. Icon map (lucide-react — already installed)

```js
import {
  LayoutDashboard, Clapperboard, Image, Kanban, Lightbulb, Timer, FlaskConical,
  FileText, TrendingUp, Telescope, Newspaper, Trophy, UserCog, Sparkles, Ticket,
  Scissors, ClipboardCheck, FilePlus2, Handshake, Users, IndianRupee, ShieldCheck,
} from "lucide-react";

// CONTENT workspace
Dashboard:LayoutDashboard, "Reel Tracker":Clapperboard, "Post Tracker":Image,
Pipeline:Kanban, "Idea Engine":Lightbulb, "6-Day Tracker":Timer, "Experiment X":FlaskConical,
"IPs / Pages":FileText, Growth:TrendingUp, "Competitor Ideas":Telescope, "News Feed":Newspaper,
"Team Performance":Trophy, "Team Roles":UserCog, "FSI Canvas":Sparkles, Tickets:Ticket, Pintu:Scissors,

// SEEDING workspace
Overview:LayoutDashboard, "Approval Queue":ClipboardCheck, "Create Brief":FilePlus2,
"All Deals":Handshake, "Teamwise Deals":Users, "Fulfillment Board":Clapperboard,
Payments:IndianRupee, "Monetisable Pages":FileText, "Users & Roles":ShieldCheck,
```
(All `strokeWidth={1.75}`, size 16–18 in nav, 14 in dropdown icon tiles.)

---

## 4. Nav config — one array drives everything

```js
// src/nav.config.js
export const WORKSPACES = {
  content: {
    label:"Content", accent:"purple",
    groups:[
      { link:"/", label:"Dashboard" },
      { label:"Content", items:[
        {to:"/content-tracker", label:"Reel Tracker", desc:"336 ideas"},
        {to:"/post-tracker",    label:"Post Tracker", desc:"Statics & carousels"},
        {to:"/pipeline",        label:"Pipeline",     desc:"Content kanban"},
        {to:"/ideas",           label:"Idea Engine",  desc:"Capture & assign"},
        {to:"/six-day-tracker", label:"6-Day Tracker",desc:"369.8M views"},
        {to:"/experiment-bpb",  label:"Experiment X", desc:"BPB · XF · TECH"},
      ]},
      { label:"Growth", items:[
        {to:"/pages",label:"IPs / Pages",desc:"29 pages"},
        {to:"/growth",label:"Growth",desc:"794.9M"},
        {to:"/competitor-ideas",label:"Competitor Ideas",desc:"Swipe file"},
        {to:"/news",label:"News Feed",desc:"Pre-research"},
      ]},
      { label:"Teams", items:[
        {to:"/team-performance",label:"Team Performance",desc:"Leaderboard"},
        {to:"/team-roles",label:"Team Roles",desc:"Assignments"},
      ]},
      { label:"Tools", items:[
        {to:"/fsi-canvas",label:"FSI Canvas",desc:"Strategy board"},
        {to:"/tickets",label:"Tickets",desc:"1 open"},
      ]},
    ],
  },
  seeding: {
    label:"Seeding", accent:"magenta", badge:"4",
    groups:[
      { link:"/seeding",              label:"Overview" },
      { link:"/seeding/approvals",    label:"Approvals" },
      { link:"/seeding/deals",        label:"All Deals" },
      { link:"/seeding/fulfillment",  label:"Fulfillment" },
      { link:"/seeding/payments",     label:"Payments" },
      { link:"/seeding/pages",        label:"Pages" },
      { label:"Teams", items:[
        {to:"/seeding/teamwise",label:"Teamwise Deals",desc:"By BD team"},
        {to:"/seeding/users",label:"Users & Roles",desc:"Access control"},
      ]},
    ],
  },
};

// role → which workspaces the user can see (RBAC). If only one, hide the switcher.
export function workspacesForRole(roles /* string[] */){
  const has = r => roles.includes(r);
  const canContent = roles.some(r => !["bd","fulfillment"].includes(r)); // simplify to your model
  const canSeed    = roles.some(r => ["admin","bd","fulfillment","seeding_admin"].includes(r));
  return { content:canContent, seeding:canSeed };
}
```

---

## 5. TopNav component skeleton

```jsx
// src/components/TopNav.jsx
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, Plus } from "lucide-react";
import { WORKSPACES, workspacesForRole } from "@/nav.config";

export function TopNav({ roles }){
  const access = workspacesForRole(roles);
  const dual = access.content && access.seeding;
  const [ws, setWs] = useState(access.content ? "content" : "seeding");
  // reflect accent on <body> so --accent flips
  document.body.dataset.ws = ws;
  const cfg = WORKSPACES[ws];

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-black/90 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1220px] items-center gap-3 px-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] bg-accent text-[12px] text-white">◆</span>
          frontseat
        </div>

        {dual && (
          <div className="flex gap-[3px] rounded-[11px] border border-line bg-[#0c0c11] p-1">
            {["content","seeding"].map(k => (
              <button key={k} onClick={()=>setWs(k)}
                className={`flex items-center gap-2 rounded-ctl px-[15px] py-2 text-[13px] font-semibold transition
                  ${ws===k ? "text-white" : "text-dim"}`}
                style={ws===k ? {background:"color-mix(in srgb,var(--accent) 16%,transparent)"} : undefined}>
                <span className="h-[14px] w-[14px] rounded-[5px]"
                  style={{background: ws===k ? "linear-gradient(135deg,var(--accent),var(--accent-2))" : "#33333e"}}/>
                {WORKSPACES[k].label}
                {WORKSPACES[k].badge && <span className="rounded-full bg-[#ec4899] px-[5px] py-[1px] font-mono text-[8px] text-white">{WORKSPACES[k].badge}</span>}
              </button>
            ))}
          </div>
        )}

        <nav className="flex items-center gap-[2px]">
          {cfg.groups.map((g,i)=> g.link
            ? <NavLink key={i} to={g.link} end
                className={({isActive})=>`rounded-ctl px-[13px] py-[10px] text-[13.5px] ${isActive?"text-white":"text-dim hover:bg-white/5 hover:text-white"}`}>
                {g.label}
              </NavLink>
            : <Dropdown key={i} group={g} />
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button className="text-[13.5px] text-dim">Preview as…</button>
          <button className="flex items-center gap-1 rounded-ctl bg-white px-[14px] py-2 text-[13px] font-semibold text-black"><Plus size={15}/>New</button>
          <div className="h-[30px] w-[30px] rounded-full bg-gradient-to-br from-[var(--accent)] to-[#ec4899]"/>
        </div>
      </div>
    </header>
  );
}

function Dropdown({ group }){
  return (
    <div className="group relative">
      <button className="flex items-center gap-1.5 rounded-ctl px-[13px] py-[10px] text-[13.5px] text-dim group-hover:bg-white/5 group-hover:text-white">
        {group.label}<ChevronDown size={13} className="opacity-70 transition group-hover:rotate-180"/>
      </button>
      <div className="invisible absolute left-0 top-[calc(100%+8px)] grid min-w-[500px] grid-cols-2 gap-[2px] rounded-card border border-line bg-panel p-2 opacity-0 shadow-2xl transition group-hover:visible group-hover:opacity-100">
        {/* hover bridge */}
        <span className="absolute -top-2 left-0 right-0 h-2"/>
        {group.items.map(it=>(
          <NavLink key={it.to} to={it.to} className="flex items-start gap-3 rounded-ctl p-[9px_11px] hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]">
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] border border-line bg-[#16161c]">{/* <Icon/> from map */}</span>
            <span><b className="block text-[13px] font-semibold text-ink">{it.label}</b>
              <span className="block text-[11.5px] text-faint">{it.desc}</span></span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Framer feature-grid — reusable cell components

The pages are built from a `<Board>` of hairline-bordered `<Cell>`s, each holding a viz.

```jsx
export const Board = ({children}) =>
  <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line max-md:grid-cols-1">{children}</div>;

export const Cell = ({children, className=""}) =>
  <div className={`border-line p-7 [&:nth-child(odd)]:border-r max-md:border-r-0 max-md:border-b ${className}`}>{children}</div>;

// heading + grey desc that sits under every viz
export const CellFoot = ({title, children}) =>
  <div className="mt-5"><h3 className="text-[17px] font-semibold">{title}</h3>
    <p className="mt-2 max-w-[44ch] text-[13.5px] leading-relaxed text-dim">{children}</p></div>;
```

Viz components to build (match the Framer refs):
- **RingStat** — big mono number + a thin `--accent` SVG ring (revenue, reach, collection %).
- **DotGrid** — before/after dot comparison; colour dots by status.
- **ProgressCard** — Core-Web-Vitals style bars + a `GOOD` / `AT RISK` mono badge.
- **NodeTree** — a mark → branch to child nodes (deal→deliverables→payment; pages→niches).
- **GlobeViz / PipelineViz** — wireframe globe (reach) or stage rails (deal pipeline) with glowing `--accent` arcs.
- **ThumbCards** — small image tiles w/ a `● LIVE` chip (top content / live deliverables).
- **RankList** — leaderboard rows (teams / pages) with mono values.

Badges everywhere are mono, uppercase, `text-[9px] tracking-wide`, e.g. `P75`, `GOOD`, `MTD`.

---

## Build order (suggested)
1. Tokens + font (§1–2) → instantly reskins the base.
2. Icon map + nav config (§3–4).
3. TopNav + Dropdown + workspace switch (§5).
4. Board/Cell + RingStat + RankList (§6) → rebuild Seeding **Overview** first (flagship).
5. Roll the same cells across Deals, Fulfillment, Payments.
6. Then apply to the FSOS pages (same components).
