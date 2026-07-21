import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { hasPermission } from "@/lib/permissions";
import { PEOPLE_SEED, lookupPerson } from "@/lib/peopleSeed";
import IdeaThread from "@/components/IdeaThread";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getTrackerNiches, createTrackerNiche, updateTrackerNiche, deleteTrackerNiche,
  getTrackerIdeas, createTrackerIdea, updateTrackerIdea, deleteTrackerIdea,
  createTrackerPosting, updateTrackerPosting, deleteTrackerPosting,
} from "@/services/api";
import PostedDateEditor from "@/components/PostedDateEditor";

const STAGES = ["new","approved","base_edit","testing","proven_ideas","scheduled","posted","kill"];
const SL: Record<string,string> = { new:"New ideas", approved:"Approved", base_edit:"Base edit", testing:"Testing", proven_ideas:"Proven ideas/ Batch edit", scheduled:"Scheduled", posted:"Posted", kill:"Killed" };
const SC: Record<string,{bg:string;text:string;dot:string}> = {
  new:{ bg:"rgba(74,127,212,0.15)",text:"#7BB0FF",dot:"#4A7FD4" },
  approved:{ bg:"rgba(45,158,95,0.15)",text:"#5AE0A0",dot:"#2D9E5F" },
  base_edit:{ bg:"rgba(123,97,196,0.15)",text:"#B49EFF",dot:"#7B61C4" },
  testing:{ bg:"rgba(212,149,42,0.15)",text:"#F0C060",dot:"#D4952A" },
  proven_ideas:{ bg:"rgba(29,158,117,0.15)",text:"#50E0B0",dot:"#1D9E75" },
  scheduled:{ bg:"rgba(83,74,183,0.15)",text:"#9B8FFF",dot:"#534AB7" },
  posted:{ bg:"rgba(45,158,95,0.15)",text:"#5AE0A0",dot:"#2D9E5F" },
  kill:{ bg:"rgba(201,59,59,0.15)",text:"#FF7070",dot:"#C93B3B" },
};
const PT: Record<string,{label:string;color:string;bg:string}> = {
  below:{ label:"Below",color:"#FF7070",bg:"rgba(201,59,59,0.15)" },
  baseline:{ label:"Baseline",color:"#F0C060",bg:"rgba(212,149,42,0.15)" },
  above_baseline:{ label:"Above",color:"#7BB0FF",bg:"rgba(74,127,212,0.15)" },
  topline:{ label:"Topline",color:"#50E0B0",bg:"rgba(29,158,117,0.15)" },
  viral:{ label:"Viral",color:"#B49EFF",bg:"rgba(123,97,196,0.15)" },
};
const SOURCES = ["original","competitor"];

/** Normalize API stage strings for boards + stats (handles casing / legacy "killed"). */
function normalizePipelineStage(stage: unknown): string {
  const s = String(stage ?? "").trim().toLowerCase();
  if (s === "killed") return "kill";
  if (STAGES.includes(s)) return s;
  return s || "new";
}

// All date math here is intentionally LOCAL. `toISOString().slice(0,10)` is
// poison on any machine east of UTC (e.g. IST = UTC+5:30) — midnight local
// converts to 18:30 the previous day in UTC, and the slice gives you
// yesterday's date, which is exactly how the old calendar ended up labelling
// Apr 21 (Tue) as Thu. `toLocalISO` formats strictly from local accessors.
const toLocalISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

/** Local calendar YYYY-MM-DD from a DB timestamp (never use raw ISO slice for "today"). */
function toLocalDateKeyFromTimestamp(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw).trim());
    return m ? m[1] : "";
  }
  return toLocalISO(d);
}

function currentBoardMonthDate() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function boardMonthPrefixFromDate(md: { year: number; month: number }) {
  return `${md.year}-${String(md.month + 1).padStart(2, "0")}`;
}

function boardMonthLabelFromDate(md: { year: number; month: number }) {
  return new Date(md.year, md.month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function prevBoardMonth(md: { year: number; month: number }) {
  return md.month === 0 ? { year: md.year - 1, month: 11 } : { ...md, month: md.month - 1 };
}

function nextBoardMonth(md: { year: number; month: number }) {
  return md.month === 11 ? { year: md.year + 1, month: 0 } : { ...md, month: md.month + 1 };
}

const today = () => toLocalISO(new Date());
const fmtD = (d: string) => { const dt=new Date(d+"T00:00:00"); return dt.toLocaleDateString("en-US",{month:"short",day:"numeric"}); };
const fmtDFull = (d: string) => { const dt=new Date(d+"T00:00:00"); return dt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); };
const fmtNum = (n: number) => { if(n>=1000000) return (n/1000000).toFixed(1)+"M"; if(n>=1000) return (n/1000).toFixed(1)+"k"; return n.toString(); };
/** Match niche page handle strings (with or without @) */
const normH = (s: string) => String(s).replace(/^@/,"").trim().toLowerCase();
function sortStrArr(a: string[]) { return [...a].map(String).sort(); }
function nicheIdsEqual(a: string[] | undefined, b: string[] | undefined) {
  return JSON.stringify(sortStrArr(a || [])) === JSON.stringify(sortStrArr(b || []));
}
function approvedPagesEqual(a: string[] | undefined, b: string[] | undefined) {
  return JSON.stringify(sortStrArr((a || []).map(normH))) === JSON.stringify(sortStrArr((b || []).map(normH)));
}
/** Persists in `tags` when the DB has no `approved_for_pages` column (see migration). */
const AFP_TAG_PREFIX = "__apfp1:";
function parseApprovedForPagesFromRaw(raw: any): string[] {
  const c = raw?.approved_for_pages;
  if (Array.isArray(c) && c.length > 0) return c.map(String);
  if (typeof c === "string" && c.trim().startsWith("[")) {
    try { const p = JSON.parse(c); if (Array.isArray(p) && p.length) return p.map(String); } catch { /* */ }
  }
  const t = (raw?.tags || []).find((x: any) => String(x).startsWith(AFP_TAG_PREFIX));
  if (t) {
    try {
      const a = JSON.parse(decodeURIComponent(String(t).slice(AFP_TAG_PREFIX.length)));
      if (Array.isArray(a) && a.length) return a.map(String);
    } catch { /* */ }
  }
  return Array.isArray(c) ? c.map(String) : [];
}
function mergeAfpIntoTags(tags: string[] | undefined, pages: string[]): string[] {
  const rest = (tags || []).filter((t) => !String(t).startsWith(AFP_TAG_PREFIX));
  if (pages && pages.length > 0) {
    return [...rest, `${AFP_TAG_PREFIX}${encodeURIComponent(JSON.stringify(pages))}`];
  }
  return rest;
}
const gPerf = (v: number|null, b: number|null) => {
  if(!v||!b) return null;
  const r=v/b;
  if(r>=20) return "viral";
  if(r>=5) return "topline";
  if(r>=1.2) return "above_baseline";
  if(r>=0.8) return "baseline";
  return "below";
};
const getMonday = (d: string) => { const dt=new Date(d+"T00:00:00"); const day=dt.getDay(); dt.setDate(dt.getDate()-day+(day===0?-6:1)); return toLocalISO(dt); };
const addD = (s: string, n: number) => { const d=new Date(s+"T00:00:00"); d.setDate(d.getDate()+n); return toLocalISO(d); };
const getWD = (m: string) => Array.from({length:7},(_,i)=>addD(m,i));
const monthStart = () => { const d=new Date(); return toLocalISO(new Date(d.getFullYear(),d.getMonth(),1)); };

/** Map a raw API idea to the shape the UI expects */
function mapIdea(raw: any): any {
  const nicheIds: string[] = (raw.niche_ids && raw.niche_ids.length > 0) ? raw.niche_ids : (raw.niche_id ? [raw.niche_id] : []);
  return {
    ...raw,
    nicheIds,
    createdAt: raw.created_at ? new Date(raw.created_at).getTime() : Date.now(),
    hook_variations: raw.hook_variations || [],
    music_ref: raw.music_ref || null,
    yt_url: raw.yt_url || null,
    yt_timestamps: raw.yt_timestamps || null,
    comp_link: raw.comp_link || raw.link || null,
    frame_link: raw.frame_link || null,
    kalakar_link: raw.kalakar_link ?? null,
    tags: raw.tags || [],
    postings: (raw.tracker_postings || []).map((p: any) => ({
      id: p.id,
      page: p.page,
      date: p.date,
      baselineViews: p.baseline_views,
      views: p.views,
      perf_tag: p.perf_tag || null,
    })),
    approvedForPages: parseApprovedForPagesFromRaw(raw),
    killed_at: raw.killed_at ?? null,
  };
}

/** Stages that count as “past testing” for the Scaled header (current board state). */
const SCALED_STAGES = new Set(["proven_ideas", "scheduled", "posted"]);

/** Filter ideas for header stats by `created_at` (YYYY-MM-DD, local). */
function filterIdeasByCreatedDateRange(ideas: any[], from: string, to: string): any[] {
  if (!from || !to) return ideas;
  const lo = from <= to ? from : to;
  const hi = from <= to ? to : from;
  return ideas.filter((i) => {
    const d = toLocalDateKeyFromTimestamp(i.created_at);
    if (!d) return false;
    return d >= lo && d <= hi;
  });
}

function killCountsForStatWindow(fullBoardIdeas: any[], mode: "today" | "all" | "custom", statFrom: string, statTo: string): number {
  if (mode === "all") return fullBoardIdeas.filter((i) => normalizePipelineStage(i.stage) === "kill").length;
  const lo = statFrom <= statTo ? statFrom : statTo;
  const hi = statFrom <= statTo ? statTo : statFrom;
  return fullBoardIdeas.filter((i) => {
    if (normalizePipelineStage(i.stage) !== "kill") return false;
    const kd = toLocalDateKeyFromTimestamp(i.killed_at);
    if (kd && kd >= lo && kd <= hi) return true;
    if (!i.killed_at && !kd) {
      const cd = toLocalDateKeyFromTimestamp(i.created_at);
      return !!(cd && cd >= lo && cd <= hi);
    }
    return false;
  }).length;
}

/** Header stats — Source/Scaled stay tied to creation-date scope; Killed counts current kill-column rows landed in window (via killed_at, else legacy created date). */
function contentTrackerLifecycleStats(
  scopedByCreatedAt: any[],
  fullBoardIdeas: any[],
  statMode: "today" | "all" | "custom",
  statFrom: string,
  statTo: string,
) {
  let nComp = 0;
  let nOrig = 0;
  let nOther = 0;
  let scaled = 0;
  for (const i of scopedByCreatedAt) {
    const src = (i.source || "original") as string;
    if (src === "competitor") nComp += 1;
    else if (src === "original") nOrig += 1;
    else nOther += 1;
    const st = normalizePipelineStage(i.stage);
    if (SCALED_STAGES.has(st)) scaled += 1;
  }
  const killed = killCountsForStatWindow(fullBoardIdeas, statMode, statFrom, statTo);
  const denom = scopedByCreatedAt.length;
  const pct = (c: number) => (denom > 0 ? (100 * c) / denom : 0);
  return {
    nComp,
    nOrig,
    nOther,
    compPct: pct(nComp),
    origPct: pct(nOrig),
    otherPct: pct(nOther),
    scaled,
    killed,
  };
}

/** Small bounded Levenshtein for typo-tolerant suggestion ranking. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        (dp[i - 1]?.[j] ?? 0) + 1,
        (dp[i]?.[j - 1] ?? 0) + 1,
        (dp[i - 1]?.[j - 1] ?? 0) + cost,
      );
    }
  }
  return dp[m]?.[n] ?? n;
}

function fuzzyScoreForIdea(query: string, idea: any): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = String(idea.title || "").toLowerCase();
  const notes = String(idea.notes || "").toLowerCase();
  const hooks = (Array.isArray(idea.hook_variations) ? idea.hook_variations : [])
    .map((x: string) => String(x).toLowerCase())
    .join(" ");
  const hay = `${title} ${notes} ${hooks}`.trim();
  if (!hay) return 0;
  if (hay.includes(q)) return 1200;
  const toks = q.split(/\s+/).filter(Boolean);
  if (toks.length >= 2 && toks.every((t) => hay.includes(t))) return 950;
  let pi = 0;
  let matched = 0;
  for (let i = 0; i < hay.length && pi < q.length; i++) {
    if (hay[i] === q[pi]) {
      matched++;
      pi++;
    }
  }
  if (pi === q.length && q.length >= 2) return 500 + matched;
  if (q.length <= 22 && title.length <= 160) {
    const slice = title.slice(0, Math.min(title.length, 96));
    const d = levenshtein(q, slice);
    const maxDist = Math.max(2, Math.floor(q.length / 5));
    if (d <= maxDist) return 380 - d * 35;
  }
  return 0;
}

function fuzzyMatchesIdea(query: string, idea: any): boolean {
  return fuzzyScoreForIdea(query, idea) > 0;
}

function PB({tag}: {tag: string|null}){ if(!tag||!PT[tag]) return null; const t=PT[tag]; return <span style={{display:"inline-block",fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:99,background:t.bg,color:t.color}}>{t.label}</span>; }

// Controlled text field that syncs from props but ONLY saves when the user actually
// changes the value. Prevents the "stale defaultValue on re-render -> blur wipes link"
// bug that was nuking yt_url / comp_link / frame_link in the idea modal.
function SafeTextInput({value, onSave, style, placeholder, type}: {value: string|null; onSave: (v: string|null) => void; style?: React.CSSProperties; placeholder?: string; type?: string}){
  const [local, setLocal] = useState(value || "");
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setLocal(value || ""); }, [value]);
  return (
    <input
      type={type || "text"}
      className="fglass-input"
      value={local}
      onChange={e => { dirty.current = true; setLocal(e.target.value); }}
      onBlur={() => {
        const next = local.trim() || null;
        const current = (value || "").trim() || null;
        dirty.current = false;
        if (next !== current) onSave(next);
      }}
      placeholder={placeholder}
      style={style}
    />
  );
}

function SafeTextArea({value, onSave, style, placeholder, rows}: {value: string; onSave: (v: string) => void; style?: React.CSSProperties; placeholder?: string; rows?: number}){
  const [local, setLocal] = useState(value || "");
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setLocal(value || ""); }, [value]);
  return (
    <textarea
      className="fglass-input"
      value={local}
      onChange={e => { dirty.current = true; setLocal(e.target.value); }}
      onBlur={() => {
        dirty.current = false;
        if ((local || "") !== (value || "")) onSave(local);
      }}
      placeholder={placeholder}
      rows={rows}
      style={style}
    />
  );
}

function Modal({open,onClose,title,children,wide}: {open:boolean;onClose:()=>void;title:string;children:React.ReactNode;wide?:boolean}){
  if(!open) return null;
  return (
    <div className="fglass-modal-overlay" onClick={onClose}>
      <div className="fglass-modal-scrim"/>
      <div onClick={e=>e.stopPropagation()} className="fglass-sheet fglass-modal" style={{maxWidth:wide?720:520}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:600,color:"#fff",letterSpacing:"-0.02em"}}>{title}</h2>
          <button onClick={onClose} className="fglass-muted" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",padding:"4px 8px",borderRadius:6}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PostingCard({po,page,fmtD,PT,updatePostingMut,onRemove,stage}: {po:any;page:string;fmtD:(d:string)=>string;PT:any;updatePostingMut:any;onRemove:()=>void;stage?:string}){
  const hasViews = po.views !== null && po.views !== undefined;
  const [editing,setEditing]=useState(!hasViews);
  const [postDate,setPostDate]=useState(po.date||"");
  const [views,setViews]=useState((po.views ?? "").toString());
  const [perfTag,setPerfTag]=useState<string>(po.perf_tag || "");

  
  const stageColor = stage==="testing"?"#D4952A":stage==="proven_ideas"?"#1D9E75":stage==="kill"?"#C93B3B":stage==="scheduled"?"#534AB7":stage==="posted"?"#2D9E5F":"#7c3aed";

  if(!editing){
    const effectiveTag = (po.perf_tag && PT[po.perf_tag]) ? po.perf_tag : gPerf(po.views ?? null, po.baselineViews ?? null);
    return(
      <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setEditing(true)}>
        <div onClick={e=>{e.stopPropagation();onRemove();}} title="Remove page" style={{width:20,height:20,borderRadius:5,background:stageColor,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        <span style={{fontSize:13,fontWeight:600,color:"#fff"}}>@{page}</span>
        {hasViews && (
          <span style={{fontSize:12,fontWeight:700,color:"#fff",fontFamily:"monospace"}}>
            {Number(po.views).toLocaleString()}
          </span>
        )}
        {!!effectiveTag && <PB tag={effectiveTag} />}
        <span style={{fontSize:11,color:"#52525b",marginLeft:"auto",whiteSpace:"nowrap"}}>{po.date ? fmtD(po.date) : ""}</span>
        <span style={{fontSize:10,color:"#3f3f46"}}>click to edit</span>
      </div>
    );
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:20,height:20,borderRadius:5,background:stageColor,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        <span style={{fontSize:13,fontWeight:600,color:"#fff",flex:1}}>@{page}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:30}}>
        <span style={{fontSize:10,color:"#71717a",fontWeight:600}}>Date</span>
        <input type="date" value={postDate} onChange={e=>setPostDate(e.target.value)} style={{padding:"5px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b",color:"#fff",cursor:"pointer"}}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:30}}>
        <span style={{fontSize:10,color:"#71717a",fontWeight:600}}>Views</span>
        <input
          type="number"
          value={views}
          onChange={(e)=>setViews(e.target.value)}
          placeholder="Enter views"
          style={{width:120,padding:"5px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b",color:"#fff"}}
        />
      </div>
      <div style={{display:"flex",gap:6,marginLeft:30,flexWrap:"wrap"}}>
        {(["below","baseline","above_baseline","topline","viral"] as const).map((tag)=>{const t=PT[tag];const active=perfTag===tag;return(
          <button
            key={tag}
            type="button"
            onClick={()=>setPerfTag(tag)}
            style={{
              padding:"4px 10px",
              borderRadius:6,
              border:active?`2px solid ${t.color}`:"1px solid #3f3f46",
              background:active?t.bg:"transparent",
              color:active?t.color:"#52525b",
              fontSize:10,
              fontWeight:600,
              cursor:"pointer",
              transition:"all 0.15s",
            }}
            title={t.label}
          >
            {t.label === "Below" ? "Below baseline" : t.label === "Above" ? "Above baseline" : t.label}
          </button>
        );})}
      </div>
      <div style={{display:"flex",gap:6,marginLeft:30,marginTop:2}}>
        <button
          onClick={()=>{
            updatePostingMut.mutate(
              {id:po.id,data:{date:postDate||null,views: views==="" ? null : Number(views)||null,perf_tag: perfTag || null}},
              {onSuccess:()=>setEditing(false)}
            );
          }}
          disabled={updatePostingMut.isPending}
          style={{padding:"5px 16px",borderRadius:7,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:updatePostingMut.isPending?"#52525b":"#7c3aed",color:"#fff"}}
        >
          {updatePostingMut.isPending?"Saving...":"Save"}
        </button>
        <button onClick={()=>setEditing(false)} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #3f3f46",fontSize:11,fontWeight:500,cursor:"pointer",background:"transparent",color:"#a1a1aa"}}>Cancel</button>
        <button onClick={onRemove} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #3f3f46",fontSize:11,fontWeight:500,cursor:"pointer",background:"transparent",color:"#FF7070",marginLeft:"auto"}}>Remove</button>
      </div>
    </div>
  );
}

function IdeaCard({idea,niches,onClick,isSelected}: {idea:any;niches:any[];onClick:()=>void;isSelected?:boolean}){
  const ideaNiches=niches.filter((n: any)=>(idea.nicheIds||[]).includes(n.id));
  const pc=idea.postings?.length||0;
  const bp=idea.postings?.reduce((b: string|null, p: any)=>{const t=gPerf(p.views,p.baselineViews);const o: Record<string,number>={viral:4,topline:3,baseline:2,below:1};return(o[t||""]||0)>(o[b||""]||0)?t:b;},null);
  const hv=idea.hook_variations?.length||0;
  const shareUrl = `${window.location.origin}/content-tracker?idea=${idea.id}`;
  return(
    <div onClick={onClick} className={`fglass-card fglass-purple-shadow${isSelected ? " is-selected" : ""}`} style={{borderRadius:12,padding:"11px 13px",marginBottom:6,cursor:"grab"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
        <p style={{margin:0,fontSize:13,fontWeight:500,color:"#fff",lineHeight:1.35,flex:1}}>{idea.title}</p>
        <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
          <button
            onClick={async (e)=>{e.stopPropagation();try{await navigator.clipboard.writeText(shareUrl);toast.success("Link copied");}catch{toast.error("Failed to copy link");}}}
            title="Copy share link"
            style={{width:22,height:22,borderRadius:6,border:"1px solid #3f3f46",background:"transparent",color:"#a1a1aa",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {bp&&<PB tag={bp}/>}
        </div>
      </div>
      {/* Tags row */}
      <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:idea.source==="competitor"?"#EEEDFE":"#E8F5EE",color:idea.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{idea.source==="competitor"?"Comp":"Orig"}</span>
        {ideaNiches.map((n: any)=><span key={n.id} style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:"#27272a",color:"#a1a1aa",fontWeight:500}}>{n.name}</span>)}
        {pc>0&&<span className="fglass-muted" style={{fontSize:10,fontWeight:500}}>{pc}pg</span>}
      </div>
      {/* Info row */}
      <div style={{marginTop:5,display:"flex",flexDirection:"column",gap:2}}>
        {idea.tags?.includes("comp_research")&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:99,background:"rgba(212,118,42,0.15)",color:"#F0A050",fontWeight:600,alignSelf:"flex-start"}}>COMP RESEARCH</span>}
        {idea.created_by&&<span className="fglass-muted" style={{fontSize:10}}>by {idea.created_by}</span>}
        {hv>0&&<span className="fglass-muted" style={{fontSize:10}}>{hv} hook{hv>1?"s":""}</span>}
        {idea.music_ref&&<span className="fglass-muted" style={{fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:.75}}>♪ {idea.music_ref}</span>}
        {((idea.comp_link || idea.link) || idea.yt_url || idea.frame_link || idea.kalakar_link) && (
          <div
            style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}
            onClick={(e) => e.stopPropagation()}
          >
            {!!idea.link && idea.link !== idea.comp_link && (
              <a
                href={idea.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{fontSize:10,color:"#4A7FD4",fontWeight:500}}
              >
                Source ↗
              </a>
            )}
            {idea.comp_link && (
              <a
                href={idea.comp_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{fontSize:10,color:"#4A7FD4",fontWeight:500}}
              >
                {idea.source === "competitor" ? "Comp" : "Ref"} ↗
              </a>
            )}
            {idea.yt_url && (
              <a
                href={idea.yt_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{fontSize:10,color:"#4A7FD4",fontWeight:500}}
              >
                YT ↗
              </a>
            )}
            {idea.frame_link && (
              <a
                href={idea.frame_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{fontSize:10,color:"#F0A050",fontWeight:500}}
              >
                Drive ↗
              </a>
            )}
            {idea.kalakar_link && (
              <a
                href={idea.kalakar_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{fontSize:10,color:"#7BB0FF",fontWeight:500}}
              >
                Kalakar ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarView({ideas,niches,nicheFilter,pageFilter,onClickIdea,weekStart,setWeekStart}: any){
  const days=getWD(weekStart); const dl=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const ncm=useMemo(()=>{const p=["#4A7FD4","#1D9E75","#D4952A","#534AB7","#D85A30","#D4537E","#639922","#185FA5"];const m: Record<string,string>={};niches.forEach((n: any,i: number)=>{m[n.id]=p[i%p.length];});return m;},[niches]);
  const entries=useMemo(()=>{const r: any[]=[];ideas.forEach((idea: any)=>{(idea.postings||[]).forEach((p: any)=>{if(!p.date)return;if(nicheFilter!=="all"&&!(idea.nicheIds||[]).includes(nicheFilter))return;if(pageFilter!=="all"&&p.page!==pageFilter)return;r.push({idea,posting:p});});});return r;},[ideas,nicheFilter,pageFilter]);
  return(
    <div style={{padding:"16px 24px 24px 70px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button onClick={()=>setWeekStart(addD(weekStart,-7))} style={{background:"none",border:"1px solid #3f3f46",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:12,fontWeight:500}}>←</button>
        <button onClick={()=>setWeekStart(getMonday(today()))} style={{background:"none",border:"1px solid #3f3f46",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:12,fontWeight:500}}>Today</button>
        <button onClick={()=>setWeekStart(addD(weekStart,7))} style={{background:"none",border:"1px solid #3f3f46",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:12,fontWeight:500}}>→</button>
        <span style={{fontSize:13,fontWeight:600,color:"#fff",marginLeft:6}}>{fmtD(days[0])} – {fmtD(days[6])}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,background:"#27272a",borderRadius:12,overflow:"hidden",border:"1px solid #27272a"}}>
        {days.map((day: string,i: number)=>{const isT=day===today();const de=entries.filter((e: any)=>e.posting.date===day);return(
          <div key={day} style={{background:isT?"#1a1a14":"#18181b",minHeight:120,display:"flex",flexDirection:"column"}}>
            <div style={{padding:"6px 6px 3px",borderBottom:"1px solid #27272a"}}><span style={{fontSize:10,fontWeight:600,color:isT?"#D4952A":"#999"}}>{dl[i]}</span><span style={{fontSize:12,fontWeight:isT?700:500,color:isT?"#1a1a1a":"#666",marginLeft:5}}>{new Date(day+"T00:00:00").getDate()}</span></div>
            <div style={{padding:"3px 3px 6px",flex:1,overflow:"auto"}}>{de.map((e: any,idx: number)=>{const perf=gPerf(e.posting.views,e.posting.baselineViews);const nc=ncm[(e.idea.nicheIds||[])[0]]||"#888";return(
              <div key={idx} onClick={()=>onClickIdea(e.idea)} style={{padding:"4px 6px",marginBottom:2,borderRadius:5,fontSize:10,background:`${nc}11`,borderLeft:`3px solid ${nc}`,cursor:"pointer"}}>
                <div style={{fontWeight:600,color:"#fff",lineHeight:1.3,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.idea.title}</div>
                <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap"}}><span style={{color:"#71717a",fontWeight:500}}>{e.posting.page}</span>{e.posting.views&&<span style={{color:"#52525b"}}>· {fmtNum(e.posting.views)}</span>}{perf&&<PB tag={perf}/>}</div>
              </div>);})}</div>
          </div>);})}
      </div>
      <div style={{display:"flex",gap:12,marginTop:10,flexWrap:"wrap"}}>{niches.filter((n: any)=>nicheFilter==="all"||n.id===nicheFilter).map((n: any)=><div key={n.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#71717a"}}><span style={{width:10,height:10,borderRadius:3,background:ncm[n.id]}}/>{n.name}</div>)}</div>
    </div>
  );
}

function AnalyticsView({ideas,niches,nicheFilter,pageFilter,dateFrom,dateTo,setDateFrom,setDateTo,setPageFilter,onClickIdea}: any){
  const allPagesForFilter = nicheFilter==="all" ? niches.flatMap((n: any)=>n.pages) : (niches.find((n: any)=>n.id===nicheFilter)?.pages||[]);

  const data = useMemo(()=>{
    let totalViews=0, totalPosts=0;
    const perfCounts: Record<string,number>={below:0,baseline:0,above_baseline:0,topline:0,viral:0};
    const pageMap: Record<string,{views:number;posts:number;best:string|null}>={};
    const dailyMap: Record<string,number>={};
    ideas.forEach((idea: any)=>{
      if(nicheFilter!=="all"&&!(idea.nicheIds||[]).includes(nicheFilter)) return;
      (idea.postings||[]).forEach((p: any)=>{
        if(!p.date||!p.views) return;
        if(p.date<dateFrom||p.date>dateTo) return;
        if(pageFilter!=="all"&&p.page!==pageFilter) return;
        totalViews+=p.views; totalPosts++;
        const perf=gPerf(p.views,p.baselineViews);
        if(perf) perfCounts[perf]++;
        if(!pageMap[p.page]) pageMap[p.page]={views:0,posts:0,best:null};
        pageMap[p.page].views+=p.views; pageMap[p.page].posts++;
        const order: Record<string,number>={viral:5,topline:4,above_baseline:3,baseline:2,below:1};
        if((order[perf||""]||0)>(order[pageMap[p.page].best||""]||0)) pageMap[p.page].best=perf;
        if(!dailyMap[p.date]) dailyMap[p.date]=0;
        dailyMap[p.date]+=p.views;
      });
    });
    const pages=Object.entries(pageMap).map(([page,d])=>({page,...d})).sort((a,b)=>b.views-a.views);
    const dailySorted=Object.entries(dailyMap).sort((a,b)=>a[0].localeCompare(b[0]));
    return {totalViews,totalPosts,perfCounts,pages,dailySorted};
  },[ideas,niches,nicheFilter,pageFilter,dateFrom,dateTo]);

  const maxDaily = Math.max(...data.dailySorted.map((d: any)=>d[1]),1);

  const topIdeas = useMemo(()=>{
    const map: Record<string,{idea:any;totalViews:number;bestPerf:string|null}>={};
    ideas.forEach((idea: any)=>{
      if(nicheFilter!=="all"&&!(idea.nicheIds||[]).includes(nicheFilter)) return;
      (idea.postings||[]).forEach((p: any)=>{
        if(!p.date||!p.views) return;
        if(p.date<dateFrom||p.date>dateTo) return;
        if(pageFilter!=="all"&&p.page!==pageFilter) return;
        if(!map[idea.id]) map[idea.id]={idea,totalViews:0,bestPerf:null};
        map[idea.id].totalViews+=p.views;
        const perf=gPerf(p.views,p.baselineViews);
        const order: Record<string,number>={viral:4,topline:3,baseline:2,below:1};
        if((order[perf||""]||0)>(order[map[idea.id].bestPerf||""]||0)) map[idea.id].bestPerf=perf;
      });
    });
    return Object.values(map).sort((a,b)=>b.totalViews-a.totalViews).slice(0,10);
  },[ideas,nicheFilter,pageFilter,dateFrom,dateTo]);

  // Top contributors: who made how many ideas + their total views + done/scale count
  const contributors = useMemo(()=>{
    const map: Record<string,{name:string;total:number;done:number;totalViews:number;winners:number}> = {};
    ideas.forEach((idea: any)=>{
      if(nicheFilter!=="all"&&!(idea.nicheIds||[]).includes(nicheFilter)) return;
      const name = (idea.created_by||"Unknown").trim() || "Unknown";
      if(!map[name]) map[name]={name,total:0,done:0,totalViews:0,winners:0};
      map[name].total++;
      if(idea.stage==="posted"||idea.stage==="scheduled") map[name].done++;
      (idea.postings||[]).forEach((p: any)=>{
        if(!p.date||!p.views) return;
        if(p.date<dateFrom||p.date>dateTo) return;
        if(pageFilter!=="all"&&p.page!==pageFilter) return;
        map[name].totalViews+=p.views;
        const perf=gPerf(p.views,p.baselineViews);
        if(perf==="topline"||perf==="viral") map[name].winners++;
      });
    });
    return Object.values(map).sort((a,b)=>b.totalViews-a.totalViews||b.done-a.done);
  },[ideas,nicheFilter,pageFilter,dateFrom,dateTo]);

  const cardS={background:"#18181b",borderRadius:12,padding:"16px 18px",border:"1px solid #27272a"};

  return(
    <div style={{padding:"16px 24px 24px 70px",maxWidth:900}}>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:600,color:"#71717a",textTransform:"uppercase",letterSpacing:"0.04em"}}>Period</span>
        <input type="date" value={dateFrom} onChange={(e: any)=>setDateFrom(e.target.value)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b"}}/>
        <span style={{fontSize:12,color:"#52525b"}}>to</span>
        <input type="date" value={dateTo} onChange={(e: any)=>setDateTo(e.target.value)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b"}}/>
        {pageFilter!=="all"&&<span style={{fontSize:12,fontWeight:600,color:"#4A7FD4",padding:"4px 10px",background:"#EAF0FA",borderRadius:99}}>{pageFilter}</span>}
        <select value={pageFilter} onChange={(e: any)=>setPageFilter(e.target.value)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b",cursor:"pointer",marginLeft:"auto"}}>
          <option value="all">All pages</option>
          {allPagesForFilter.map((p: string)=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:18}}>
        <div style={cardS}><div style={{fontSize:11,color:"#71717a",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Total views</div><div style={{fontSize:24,fontWeight:700,letterSpacing:"-0.03em"}}>{fmtNum(data.totalViews)}</div></div>
        <div style={cardS}><div style={{fontSize:11,color:"#71717a",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Posts tracked</div><div style={{fontSize:24,fontWeight:700,letterSpacing:"-0.03em"}}>{data.totalPosts}</div></div>
        <div style={cardS}><div style={{fontSize:11,color:"#71717a",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Avg views/post</div><div style={{fontSize:24,fontWeight:700,letterSpacing:"-0.03em"}}>{data.totalPosts?fmtNum(Math.round(data.totalViews/data.totalPosts)):"-"}</div></div>
        <div style={cardS}>
          <div style={{fontSize:11,color:"#71717a",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:6}}>Performance</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {(["viral","topline","above_baseline","baseline","below"] as const).map(k=>data.perfCounts[k]>0&&<span key={k} style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:99,background:PT[k].bg,color:PT[k].color}}>{data.perfCounts[k]} {PT[k].label === "Above" ? "Above baseline" : PT[k].label === "Below" ? "Below baseline" : PT[k].label}</span>)}
          </div>
        </div>
      </div>

      {data.dailySorted.length>0&&(
        <div style={{...cardS,marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:600,color:"#fff",marginBottom:12}}>Daily views</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:2,height:100}}>
            {data.dailySorted.map(([date,views]: [string,number])=>(
              <div key={date} title={`${fmtDFull(date)}: ${fmtNum(views)}`} style={{flex:1,minWidth:4,maxWidth:28,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{width:"100%",background:"linear-gradient(180deg,#4A7FD4,#6B9BE0)",borderRadius:"3px 3px 0 0",height:`${Math.max((views/maxDaily)*80,2)}px`,transition:"height 0.2s"}}/>
                <span style={{fontSize:8,color:"#52525b",whiteSpace:"nowrap",transform:"rotate(-45deg)",transformOrigin:"top left",marginTop:2}}>{new Date(date+"T00:00:00").getDate()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{...cardS,marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:600,color:"#fff",marginBottom:10}}>Views by page</div>
        {data.pages.length===0&&<p style={{fontSize:12,color:"#52525b",margin:0}}>No view data in this range.</p>}
        {data.pages.map((p: any)=>{
          const pct=data.totalViews?(p.views/data.totalViews*100):0;
          return(
            <div key={p.page} onClick={()=>setPageFilter(p.page===pageFilter?"all":p.page)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #27272a",cursor:"pointer"}}>
              <span style={{fontSize:13,fontWeight:600,color:"#fff",minWidth:120}}>{p.page}</span>
              <div style={{flex:1,background:"#27272a",borderRadius:4,height:14,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:4,background:pageFilter===p.page?"#7c3aed":"#3f3f46",width:`${pct}%`,transition:"width 0.3s"}}/>
              </div>
              <span style={{fontSize:12,fontWeight:600,color:"#fff",minWidth:60,textAlign:"right"}}>{fmtNum(p.views)}</span>
              <span style={{fontSize:10,color:"#52525b",minWidth:30}}>{p.posts}p</span>
              {p.best&&<PB tag={p.best}/>}
            </div>
          );
        })}
      </div>

      {contributors.length>0&&(
        <div style={{...cardS,marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:600,color:"#fff",marginBottom:10}}>Top contributors</div>
          <div style={{display:"grid",gridTemplateColumns:"minmax(140px,2fr) 1fr 1fr 1fr 1fr",gap:10,padding:"6px 0",borderBottom:"1px solid #27272a",fontSize:10,color:"#71717a",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>
            <span>Name</span>
            <span style={{textAlign:"right"}}>Ideas</span>
            <span style={{textAlign:"right"}}>Done</span>
            <span style={{textAlign:"right"}}>Winners</span>
            <span style={{textAlign:"right"}}>Views</span>
          </div>
          {contributors.map((c: any,i: number)=>(
            <div key={c.name} style={{display:"grid",gridTemplateColumns:"minmax(140px,2fr) 1fr 1fr 1fr 1fr",gap:10,padding:"8px 0",borderBottom:"1px solid #27272a",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,fontWeight:700,color:i===0?"#F0C060":i===1?"#a1a1aa":i===2?"#D4762A":"#52525b",minWidth:18}}>#{i+1}</span>
                <span style={{fontSize:13,fontWeight:600,color:"#fff"}}>{c.name}</span>
              </div>
              <span style={{fontSize:13,fontWeight:600,color:"#fff",textAlign:"right",fontFamily:"monospace"}}>{c.total}</span>
              <span style={{fontSize:13,fontWeight:600,color:"#50E0B0",textAlign:"right",fontFamily:"monospace"}}>{c.done}</span>
              <span style={{fontSize:13,fontWeight:600,color:"#B49EFF",textAlign:"right",fontFamily:"monospace"}}>{c.winners}</span>
              <span style={{fontSize:13,fontWeight:600,color:"#fff",textAlign:"right",fontFamily:"monospace"}}>{fmtNum(c.totalViews)}</span>
            </div>
          ))}
        </div>
      )}

      {topIdeas.length>0&&(
        <div style={cardS}>
          <div style={{fontSize:12,fontWeight:600,color:"#fff",marginBottom:10}}>Top ideas</div>
          {topIdeas.map((t: any,i: number)=>(
            <div key={t.idea.id} onClick={()=>onClickIdea(t.idea)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #27272a",cursor:"pointer"}}>
              <span style={{fontSize:11,fontWeight:700,color:"#52525b",minWidth:20}}>{i+1}</span>
              <span style={{flex:1,fontSize:13,fontWeight:500,color:"#fff"}}>{t.idea.title}</span>
              <span style={{fontSize:12,fontWeight:600,color:"#fff"}}>{fmtNum(t.totalViews)}</span>
              {t.bestPerf&&<PB tag={t.bestPerf}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContentTracker(){
  const { user } = useAuth();
  const { can, canDeleteThisIdea, userName, role } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ---- Data fetching via react-query ----
  const { data: rawNiches = [], isLoading: nichesLoading } = useQuery({
    queryKey: ["tracker-niches"],
    queryFn: getTrackerNiches,
  });
  const { data: rawIdeas = [], isLoading: ideasLoading } = useQuery({
    queryKey: ["tracker-ideas"],
    queryFn: () => getTrackerIdeas("reel"),
  });

  const niches = rawNiches as any[];
  const ideas = useMemo(() => (rawIdeas as any[]).map(mapIdea), [rawIdeas]);
  /** Header Source / Scaled / Killed: default today; optional all-time or custom created-date range. */
  const [statFilterMode, setStatFilterMode] = useState<"today" | "all" | "custom">("today");
  const [statFrom, setStatFrom] = useState(() => today());
  const [statTo, setStatTo] = useState(() => today());
  const isLoading = nichesLoading || ideasLoading;
  const ideasRef = useRef(ideas);
  ideasRef.current = ideas;

  // ---- Mutations ----
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tracker-ideas"] });
    queryClient.invalidateQueries({ queryKey: ["tracker-niches"] });
  };

  const createIdeaMut = useMutation({
    mutationFn: (data: any) => createTrackerIdea(data),
    onSuccess: () => { invalidate(); toast.success("Idea created"); },
    onError: () => toast.error("Failed to create idea"),
  });
  const updateIdeaMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateTrackerIdea(id, data),
    onSuccess: () => { invalidate(); },
    onError: () => toast.error("Failed to update idea"),
  });
  const deleteIdeaMut = useMutation({
    mutationFn: (id: string) => deleteTrackerIdea(id),
    onSuccess: () => { invalidate(); toast.success("Idea deleted"); },
    onError: () => toast.error("Failed to delete idea"),
  });
  const createPostingMut = useMutation({
    mutationFn: ({ ideaId, data }: { ideaId: string; data: any }) => createTrackerPosting(ideaId, data),
    onSuccess: () => { invalidate(); toast.success("Posting added"); },
    onError: () => toast.error("Failed to add posting"),
  });
  const updatePostingMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateTrackerPosting(id, data),
    onSuccess: () => { invalidate(); toast.success("Saved!"); },
    onError: () => toast.error("Failed to save"),
  });
  const deletePostingMut = useMutation({
    mutationFn: (id: string) => deleteTrackerPosting(id),
    onSuccess: () => { invalidate(); toast.success("Posting removed"); },
    onError: () => toast.error("Failed to remove posting"),
  });
  const createNicheMut = useMutation({
    mutationFn: (data: { name: string; pages: string[] }) => createTrackerNiche(data),
    onSuccess: () => { invalidate(); toast.success("Niche created"); },
    onError: () => toast.error("Failed to create niche"),
  });
  const updateNicheMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; pages?: string[] } }) => updateTrackerNiche(id, data),
    onSuccess: () => { invalidate(); toast.success("Niche updated"); },
    onError: () => toast.error("Failed to update niche"),
  });
  const deleteNicheMut = useMutation({
    mutationFn: (id: string) => deleteTrackerNiche(id),
    onSuccess: () => { invalidate(); toast.success("Niche deleted"); },
    onError: () => toast.error("Failed to delete niche"),
  });

  // ---- Drag-and-drop state ----
  const [draggingId,setDraggingId]=useState<string|null>(null);
  const [dropStage,setDropStage]=useState<string|null>(null);

  // ---- Local UI state (unchanged) ----
  const [addOpen,setAddOpen]=useState(false);
  const [detailIdea,setDetailIdea]=useState<any>(null);
  const [detailNicheIds,setDetailNicheIds]=useState<string[]>([]);
  const [detailApprovedPages,setDetailApprovedPages]=useState<string[]>([]);
  const nicheSaveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const nicheSaveRef=useRef<string[]>([]);
  const saveNiches=useCallback((ideaId: string, next: string[])=>{
    nicheSaveRef.current=next;
    if(nicheSaveTimer.current) clearTimeout(nicheSaveTimer.current);
    nicheSaveTimer.current=setTimeout(()=>{
      updateIdeaMut.mutate({id:ideaId,data:{niche_ids:nicheSaveRef.current}});
      nicheSaveTimer.current=null;
    },400);
  },[]);
  const approvedSaveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const approvedSaveRef=useRef<string[]>([]);
  const saveApprovedPages=useCallback((ideaId: string, next: string[])=>{
    approvedSaveRef.current=next;
    if(approvedSaveTimer.current) clearTimeout(approvedSaveTimer.current);
    approvedSaveTimer.current=setTimeout(()=>{
      const ap = approvedSaveRef.current;
      const idea = ideasRef.current.find((i: any) => i.id === ideaId);
      updateIdeaMut.mutate({
        id: ideaId,
        data: { approved_for_pages: ap, tags: mergeAfpIntoTags(idea?.tags, ap) },
      });
      approvedSaveTimer.current=null;
    },400);
  },[]);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [addNicheOpen,setAddNicheOpen]=useState(false);
  const [editNiche,setEditNiche]=useState<any>(null);
  const [newNiche,setNewNiche]=useState({name:"",pages:""});
  const [newIdea,setNewIdea]=useState({title:"",source:"original",nicheIds:[] as string[],hook_variations:"",music_ref:"",yt_url:"",yt_timestamps:"",comp_link:"",frame_link:""});
  const [viewMode,setViewMode]=useState("board");
  const [nicheFilter,setNicheFilter]=useState("all");
  const [personFilter,setPersonFilter]=useState("all");
  const [pageFilter,setPageFilter]=useState("all");
  const [weekStart,setWeekStart]=useState(getMonday(today()));
  const [scheduleDate,setScheduleDate]=useState<Record<string,any>>({});
  const [dateFrom,setDateFrom]=useState(monthStart());
  const [dateTo,setDateTo]=useState(today());
  const [sourceFilter,setSourceFilter]=useState<"all"|"original"|"competitor">("all");
  const [boardMonthMode,setBoardMonthMode]=useState<"month"|"all">("all");
  const [boardMonthDate,setBoardMonthDate]=useState(currentBoardMonthDate);
  const boardMonthPrefix = boardMonthPrefixFromDate(boardMonthDate);
  const boardMonthLabel = boardMonthLabelFromDate(boardMonthDate);
  const [collapsedStages,setCollapsedStages]=useState<Record<string,boolean>>({});

  const ideasAfterBoardFilters = useMemo(() => {
    let x = nicheFilter === "all" ? ideas : ideas.filter((i) => (i.nicheIds || []).includes(nicheFilter));
    x = sourceFilter === "all" ? x : x.filter((i) => i.source === sourceFilter);
    return x;
  }, [ideas, nicheFilter, sourceFilter]);

  const filteredIdeas = useMemo(() => {
    if (boardMonthMode === "all") return ideasAfterBoardFilters;
    return ideasAfterBoardFilters.filter((i) => {
      const d = toLocalDateKeyFromTimestamp(i.created_at);
      if (!d) return true;
      return d.slice(0, 7) === boardMonthPrefix;
    });
  }, [ideasAfterBoardFilters, boardMonthMode, boardMonthPrefix]);

  /** Reel-tracker toolbar search — fuzzy-match titles/notes/hooks among ideas matching niche/source/comp chips. */
  const [ideaSearchQuery, setIdeaSearchQuery] = useState("");
  const [ideaSearchDebounced, setIdeaSearchDebounced] = useState("");
  const [ideaSearchFocused, setIdeaSearchFocused] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setIdeaSearchDebounced(ideaSearchQuery), 220);
    return () => window.clearTimeout(t);
  }, [ideaSearchQuery]);

  const searchFilteredIdeas = useMemo(() => {
    const q = ideaSearchDebounced.trim();
    if (!q) return filteredIdeas;
    return filteredIdeas.filter((i) => fuzzyMatchesIdea(q, i));
  }, [filteredIdeas, ideaSearchDebounced]);

  // RBAC: scope visible ideas based on the current user's role
  const rbacFilteredIdeas = useMemo(() => {
    let base: any[];
    if (hasPermission(role, 'view_all_ideas')) base = searchFilteredIdeas;
    else if (hasPermission(role, 'view_own_ideas')) base = searchFilteredIdeas.filter((i: any) => i.created_by === userName);
    else if (hasPermission(role, 'view_assigned_ideas')) base = searchFilteredIdeas.filter((i: any) => i.executor_name === userName);
    else if (hasPermission(role, 'view_scheduled_any')) base = searchFilteredIdeas.filter((i: any) => ['scheduled', 'posted'].includes(normalizePipelineStage(i.stage)));
    else base = [];
    // Admin person filter — normalize against PEOPLE_SEED so "Kaavya" matches "Kaavya Mahajan"
    if (personFilter !== "all") {
      base = base.filter((i: any) => {
        const person = lookupPerson(i.created_by);
        return i.created_by === personFilter || person?.name === personFilter;
      });
    }
    return base;
  }, [searchFilteredIdeas, role, userName, personFilter]);

  const ideaSearchSuggestions = useMemo(() => {
    const q = ideaSearchQuery.trim().toLowerCase();
    if (q.length < 1 || !ideaSearchFocused) return [] as any[];
    return ideasAfterBoardFilters
      .map((idea: any) => ({ idea, score: fuzzyScoreForIdea(q, idea) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || Number(b.idea.createdAt || 0) - Number(a.idea.createdAt || 0))
      .slice(0, 14)
      .map((x) => x.idea);
  }, [ideaSearchQuery, ideaSearchFocused, ideasAfterBoardFilters]);

  const ideaStageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGES.forEach((s) => {
      counts[s] = 0;
    });
    rbacFilteredIdeas.forEach((i: any) => {
      const st = normalizePipelineStage(i.stage);
      if (st in counts) counts[st] = (counts[st] ?? 0) + 1;
    });
    return counts;
  }, [rbacFilteredIdeas]);

  const ideasForHeaderStats = useMemo(() => {
    if (statFilterMode === "all") return ideasAfterBoardFilters;
    if (statFilterMode === "today") {
      const t = today();
      return filterIdeasByCreatedDateRange(ideasAfterBoardFilters, t, t);
    }
    if (statFilterMode === "custom" && statFrom && statTo) {
      return filterIdeasByCreatedDateRange(ideasAfterBoardFilters, statFrom, statTo);
    }
    return [];
  }, [ideasAfterBoardFilters, statFilterMode, statFrom, statTo]);
  const lifecycleStats = useMemo(
    () => contentTrackerLifecycleStats(ideasForHeaderStats, ideasAfterBoardFilters, statFilterMode, statFrom, statTo),
    [ideasAfterBoardFilters, ideasForHeaderStats, statFilterMode, statFrom, statTo],
  );

  const allPagesForFilter=nicheFilter==="all"?niches.flatMap((n: any)=>n.pages):(niches.find((n: any)=>n.id===nicheFilter)?.pages||[]);

  // ---- Actions wired to mutations ----
  function addIdeaFn(){
    if(!newIdea.title.trim()||newIdea.nicheIds.length===0)return;
    const hookLines = newIdea.hook_variations.split("\n").map(l=>l.trim()).filter(Boolean);
    createIdeaMut.mutate({
      title: newIdea.title.trim(),
      source: newIdea.source,
      niche_ids: newIdea.nicheIds,
      hook_variations: hookLines.length > 0 ? hookLines : null,
      music_ref: newIdea.music_ref.trim() || null,
      yt_url: newIdea.yt_url.trim() || null,
      yt_timestamps: newIdea.yt_timestamps.trim() || null,
      comp_link: newIdea.comp_link.trim() || null,
      frame_link: newIdea.frame_link.trim() || null,
      stage: "new",
      type: "reel",
      created_by: user?.user_metadata?.full_name || user?.email?.split("@")[0] || user?.email || null,
    });
    setNewIdea({title:"",source:"original",nicheIds:[],hook_variations:"",music_ref:"",yt_url:"",yt_timestamps:"",comp_link:"",frame_link:""});
    setAddOpen(false);
  }
  function moveIdea(id: string, ns: string){
    if(approvedSaveTimer.current){ clearTimeout(approvedSaveTimer.current); approvedSaveTimer.current=null; }
    if(nicheSaveTimer.current){ clearTimeout(nicheSaveTimer.current); nicheSaveTimer.current=null; }
    const data: Record<string, unknown> = { stage: ns, actor: user?.user_metadata?.full_name || user?.email?.split("@")[0] || user?.email || null };
    // Always push latest modal state for the open idea so page/niche picks persist
    // when moving stage (timer may have already fired and nulled itself).
    if(detailIdea && detailIdea.id===id){
      (data as any).niche_ids = detailNicheIds;
      (data as any).approved_for_pages = detailApprovedPages;
      (data as any).tags = mergeAfpIntoTags(ideasRef.current.find((i: any) => i.id === id)?.tags, detailApprovedPages);
    }
    updateIdeaMut.mutate({ id, data: data as any });
  }
  function deleteIdea(id: string){
    deleteIdeaMut.mutate(id);
    closeDetail();
  }

  function setIdeaInUrl(ideaId: string | null){
    const sp = new URLSearchParams(location.search);
    if(ideaId) sp.set("idea", ideaId);
    else sp.delete("idea");
    const nextSearch = sp.toString();
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" },
      { replace: true }
    );
  }

  function openDetail(idea: any, opts?: { pushUrl?: boolean }){
    setDetailIdea(idea);
    const nids = idea.nicheIds||[];
    const ap = Array.isArray(idea.approvedForPages) ? idea.approvedForPages : [];
    setDetailNicheIds(nids);
    setDetailApprovedPages(ap);
    nicheSaveRef.current = nids;
    approvedSaveRef.current = ap;
    setScheduleDate({});
    if(opts?.pushUrl !== false) setIdeaInUrl(idea.id);
  }

  function closeDetail(){
    setDetailIdea(null);
    setIdeaInUrl(null);
  }

  // Deep-link: /content-tracker?idea=<id> opens the idea modal
  useEffect(()=>{
    const sp = new URLSearchParams(location.search);
    const id = sp.get("idea");
    if(!id) return;
    if(detailIdea?.id === id) return;
    const found = ideas.find((i: any) => i.id === id);
    if(found) openDetail(found, { pushUrl: false });
  },[location.search, ideas, detailIdea?.id]);

  function togglePage(iid: string, page: string, bv: any, date: string){
    const idea = ideas.find(i => i.id === iid);
    if (!idea) return;
    const existing = (idea.postings || []).find((pp: any) => pp.page === page);
    if (existing) {
      // Remove posting
      deletePostingMut.mutate(existing.id);
    } else {
      // Create posting
      createPostingMut.mutate({
        ideaId: iid,
        data: { page, baseline_views: Number(bv) || 0, date: date || today() },
      });
    }
  }
  function updateViews(iid: string, pi: number, v: string){
    const idea = ideas.find(i => i.id === iid);
    if (!idea) return;
    const posting = idea.postings?.[pi];
    if (!posting?.id) return;
    updatePostingMut.mutate({ id: posting.id, data: { views: Number(v) || null } });
  }

  function addNiche(){
    if(!newNiche.name.trim())return;
    const pages=newNiche.pages.split(",").map(p=>p.trim()).filter(Boolean);
    createNicheMut.mutate({ name: newNiche.name.trim(), pages });
    setNewNiche({name:"",pages:""});
    setAddNicheOpen(false);
  }
  function deleteNiche(id: string){
    deleteNicheMut.mutate(id);
  }
  function saveEditNiche(){
    if(!editNiche||!editNiche.name.trim())return;
    const pages=editNiche.pagesStr.split(",").map((p: string)=>p.trim()).filter(Boolean);
    updateNicheMut.mutate({ id: editNiche.id, data: { name: editNiche.name.trim(), pages } });
    setEditNiche(null);
  }

  const is: React.CSSProperties={width:"100%",padding:"9px 13px",borderRadius:9,fontSize:13,outline:"none",boxSizing:"border-box",color:"rgba(244,244,247,.95)"};
  const ls: React.CSSProperties={};
  const bp: React.CSSProperties={padding:"9px 20px",background:"#7c3aed",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"};
  const bs: React.CSSProperties={padding:"9px 20px",background:"#27272a",color:"#e4e4e7",border:"1px solid #3f3f46",borderRadius:9,fontSize:13,fontWeight:500,cursor:"pointer"};

  const cd=detailIdea?ideas.find(i=>i.id===detailIdea.id)||detailIdea:null;
  const cdNiches=cd?niches.filter((n: any)=>detailNicheIds.includes(n.id)):[];
  const cdPages=cdNiches.flatMap((n: any)=>n.pages||[]).filter((v: string,i: number,a: string[])=>a.indexOf(v)===i);
  /** If any handles are stored on the idea, testing+ checklists use only those; else all niche pages. */
  const effectiveCdPages=useMemo(()=>{
    if(!cd) return [];
    const ap=cd.approvedForPages;
    if(!Array.isArray(ap)||!ap.length) return cdPages;
    return cdPages.filter((p: string)=>ap.some((af: string)=>normH(String(af))===normH(String(p))));
  },[cd,cdPages]);

  const sa: Record<string, {label:string;stage:string;style:React.CSSProperties}[]>={
    new:[{label:"Approve",stage:"approved",style:bp},{label:"Reject",stage:"kill",style:{...bs,color:"#C93B3B"}}],
    approved:[{label:"Start base edit",stage:"base_edit",style:bp}],
    base_edit:[{label:"Start testing",stage:"testing",style:bp}],
    testing:[{label:"Proven / Batch edit",stage:"proven_ideas",style:{...bp,background:"#1D9E75"}},{label:"Kill it",stage:"kill",style:{...bs,color:"#C93B3B"}}],
    proven_ideas:[{label:"Schedule",stage:"scheduled",style:{...bp,background:"#534AB7"}}],
    scheduled:[{label:"Mark posted",stage:"posted",style:{...bp,background:"#2D9E5F"}}],
    posted:[],    kill:[],
  };

  // openDetail / closeDetail are defined above to keep URL in sync

  // ---- Loading spinner ----
  if(isLoading){
    return(
      <div style={{fontFamily:"'DM Sans','Helvetica Neue',sans-serif",minHeight:"100vh",background:"#09090b",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <div style={{textAlign:"center"}}>
          <div style={{width:36,height:36,border:"3px solid #27272a",borderTopColor:"#7c3aed",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 14px"}}/>
          <p style={{fontSize:13,color:"#71717a"}}>Loading content tracker...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return(
    <div className="fglass-page" style={{fontFamily:"'DM Sans','Helvetica Neue',sans-serif",minHeight:"100vh",color:"#fff"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Header — left padded to clear hamburger menu */}
      <div className="fglass-divider" style={{padding:"20px 24px 12px 70px",borderBottomWidth:1,borderBottomStyle:"solid",background:"transparent"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:700,letterSpacing:"-0.03em"}}>Content tracker</h1>
            <p style={{margin:"3px 0 0",fontSize:12,color:"#71717a"}}>{ideas.length} ideas · {niches.length} niches · {niches.reduce((a: number,n: any)=>a+n.pages.length,0)} pages</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 10, color: "#71717a", fontWeight: 600, letterSpacing: "0.04em" }}>STATS SCOPE</span>
              <button
                type="button"
                onClick={() => setStatFilterMode("today")}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: statFilterMode === "today" ? "1px solid #7c3aed" : "1px solid #3f3f46",
                  background: statFilterMode === "today" ? "rgba(124,58,237,0.2)" : "transparent",
                  color: statFilterMode === "today" ? "#fff" : "#a1a1aa",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setStatFilterMode("all")}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: statFilterMode === "all" ? "1px solid #7c3aed" : "1px solid #3f3f46",
                  background: statFilterMode === "all" ? "rgba(124,58,237,0.2)" : "transparent",
                  color: statFilterMode === "all" ? "#fff" : "#a1a1aa",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                All time
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatFilterMode("custom");
                  setStatFrom((f) => f || today());
                  setStatTo((t) => t || today());
                }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: statFilterMode === "custom" ? "1px solid #7c3aed" : "1px solid #3f3f46",
                  background: statFilterMode === "custom" ? "rgba(124,58,237,0.2)" : "transparent",
                  color: statFilterMode === "custom" ? "#fff" : "#a1a1aa",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Custom
              </button>
              {statFilterMode === "custom" && (
                <>
                  <input
                    type="date"
                    value={statFrom}
                    onChange={(e) => setStatFrom(e.target.value)}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #3f3f46", fontSize: 11, background: "#09090b", color: "#e4e4e7" }}
                    title="Created on or after"
                  />
                  <span style={{ fontSize: 10, color: "#52525b" }}>to</span>
                  <input
                    type="date"
                    value={statTo}
                    onChange={(e) => setStatTo(e.target.value)}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #3f3f46", fontSize: 11, background: "#09090b", color: "#e4e4e7" }}
                    title="Created on or before"
                  />
                </>
              )}
            </div>
            {/* stats-scope source/scaled/killed summary removed per request (unused) */}
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
          {can('filter_by_person') && (
            <select value={personFilter} onChange={e=>setPersonFilter(e.target.value)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #534AB7",fontSize:12,background:"#09090b",cursor:"pointer",color:"#B49EFF",fontWeight:600}}>
              <option value="all">👥 Everyone</option>
              {PEOPLE_SEED.map(p=><option key={p.name} value={p.name}>{p.emoji} {p.name}</option>)}
            </select>
          )}
          <select value={nicheFilter} onChange={e=>{setNicheFilter(e.target.value);setPageFilter("all");}} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b",cursor:"pointer"}}>
            <option value="all">All niches</option>
            {niches.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <div style={{display:"flex",background:"#27272a",borderRadius:7,overflow:"hidden",border:"1px solid #3f3f46"}}>
            {([["all","All"],["original","Original"],["competitor","Comp"]] as const).map(([val,label])=>(
              <button key={val} onClick={()=>setSourceFilter(val)} style={{padding:"5px 12px",border:"none",fontSize:12,fontWeight:500,cursor:"pointer",background:sourceFilter===val?(val==="original"?"#1A5E3A":val==="competitor"?"#534AB7":"#3f3f46"):"transparent",color:sourceFilter===val?"#fff":"#71717a"}}>{label}</button>
            ))}
          </div>
          {(viewMode==="calendar"||viewMode==="analytics")&&(
            <select value={pageFilter} onChange={e=>setPageFilter(e.target.value)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b",cursor:"pointer"}}>
              <option value="all">All pages</option>
              {allPagesForFilter.map((p: string)=><option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {/* View mode switch removed (List/Calendar not used) */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", minWidth: 160, maxWidth: 280, flex: "1 1 160px" }}>
              <input
                type="search"
                value={ideaSearchQuery}
                onChange={(e) => setIdeaSearchQuery(e.target.value)}
                onFocus={() => setIdeaSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setIdeaSearchFocused(false), 200)}
                placeholder="Search ideas…"
                aria-autocomplete="list"
                aria-expanded={ideaSearchSuggestions.length > 0}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "6px 10px",
                  borderRadius: 7,
                  border: "1.5px solid #3f3f46",
                  fontSize: 12,
                  background: "#09090b",
                  color: "#e4e4e7",
                }}
              />
              {ideaSearchSuggestions.length > 0 && (
                <ul
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "100%",
                    margin: "4px 0 0",
                    padding: 4,
                    listStyle: "none",
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 8,
                    maxHeight: 280,
                    overflowY: "auto",
                    zIndex: 50,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
                  }}
                  role="listbox"
                >
                  {ideaSearchSuggestions.map((idea: any) => (
                    <li key={idea.id} role="option">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIdeaSearchFocused(false);
                          openDetail(idea);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          margin: 0,
                          border: "none",
                          borderRadius: 6,
                          background: "transparent",
                          color: "#e4e4e7",
                          fontSize: 12,
                          cursor: "pointer",
                          lineHeight: 1.35,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{idea.title || "(untitled)"}</span>
                        <span style={{ display: "block", fontSize: 10, color: "#71717a", marginTop: 2 }}>
                          {SL[normalizePipelineStage(idea.stage)] || idea.stage}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4,background:"#27272a",borderRadius:7,border:"1px solid #3f3f46",padding:"2px 4px"}}>
              <button
                type="button"
                onClick={() => setBoardMonthDate((m) => prevBoardMonth(m))}
                disabled={boardMonthMode === "all"}
                title="Previous month"
                style={{padding:"4px 8px",borderRadius:5,border:"none",background:"transparent",color:boardMonthMode==="all"?"#3f3f46":"#a1a1aa",fontSize:12,cursor:boardMonthMode==="all"?"default":"pointer"}}
              >
                ←
              </button>
              <span style={{fontSize:11,fontWeight:600,color:boardMonthMode==="all"?"#71717a":"#e4e4e7",minWidth:110,textAlign:"center"}}>
                {boardMonthMode === "all" ? "All months" : boardMonthLabel}
              </span>
              <button
                type="button"
                onClick={() => setBoardMonthDate((m) => nextBoardMonth(m))}
                disabled={boardMonthMode === "all"}
                title="Next month"
                style={{padding:"4px 8px",borderRadius:5,border:"none",background:"transparent",color:boardMonthMode==="all"?"#3f3f46":"#a1a1aa",fontSize:12,cursor:boardMonthMode==="all"?"default":"pointer"}}
              >
                →
              </button>
              <button
                type="button"
                onClick={() => {
                  if (boardMonthMode === "all") {
                    setBoardMonthMode("month");
                    setBoardMonthDate(currentBoardMonthDate());
                  } else {
                    setBoardMonthMode("all");
                  }
                }}
                style={{
                  padding:"4px 10px",
                  borderRadius:5,
                  border:boardMonthMode==="all"?"1px solid #7c3aed":"1px solid #3f3f46",
                  background:boardMonthMode==="all"?"rgba(124,58,237,0.2)":"transparent",
                  color:boardMonthMode==="all"?"#fff":"#71717a",
                  fontSize:10,
                  fontWeight:600,
                  cursor:"pointer",
                  marginLeft:2,
                }}
              >
                {boardMonthMode === "all" ? "This month" : "All"}
              </button>
            </div>
            <button onClick={()=>setSettingsOpen(true)} style={bs}>Niches</button>
            {can('create_idea') && <button onClick={()=>setAddOpen(true)} style={bp}>+ New idea</button>}
          </div>
        </div>
      </div>

      {/* Board — drag-and-drop */}
      {viewMode==="board"&&(
        <div style={{display:"flex",gap:10,padding:"16px 24px 24px 70px",overflowX:"auto",minHeight:"calc(100vh - 130px)"}}>
          {STAGES.map(stage=>(
            <div key={stage} style={{minWidth:200,maxWidth:240,flex:"1 0 200px"}}
              onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";setDropStage(stage);}}
              onDragLeave={()=>setDropStage(null)}
              onDrop={e=>{e.preventDefault();const ideaId=e.dataTransfer.getData("text/plain");if(ideaId&&ideaId!==""){moveIdea(ideaId,stage);}setDraggingId(null);setDropStage(null);}}
            >
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 4px 8px"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:SC[stage].dot}}/>
                <span style={{fontSize:11,fontWeight:600,color:SC[stage].text}}>{SL[stage]}</span>
                <span style={{fontSize:10,color:"#52525b",fontWeight:500}}>{ideaStageCounts[stage] ?? 0}</span>
              </div>
              <div className={`fglass-lane${dropStage===stage?" is-drop-target":""}`} style={{transition:"all 0.15s"}}>
                {rbacFilteredIdeas.filter((i: any)=>normalizePipelineStage(i.stage)===stage).sort((a: any,b: any)=>b.createdAt-a.createdAt).map((idea: any)=>(
                  <div key={idea.id} draggable onDragStart={e=>{setDraggingId(idea.id);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",idea.id);}} onDragEnd={()=>{setDraggingId(null);setDropStage(null);}} style={{opacity:draggingId===idea.id?0.4:1,transition:"opacity 0.15s"}}>
                    <IdeaCard idea={idea} niches={niches} isSelected={detailIdea?.id===idea.id} onClick={()=>openDetail(idea)}/>
                  </div>
                ))}
                {(ideaStageCounts[stage] ?? 0)===0&&<div style={{padding:"24px 12px",textAlign:"center",color:"#3f3f46",fontSize:11,border:"1.5px dashed #3f3f46",borderRadius:9}}>Empty</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List/Calendar/Analytics views removed */}

      {/* Add Idea */}
      <Modal open={addOpen} onClose={()=>setAddOpen(false)} title="Add new idea">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><label style={ls}>Title / description *</label><input value={newIdea.title} onChange={e=>setNewIdea(p=>({...p,title:e.target.value}))} placeholder="e.g. Morning routine montage with dramatic voiceover" style={is}/></div>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><label style={ls}>Source</label><div style={{display:"flex",gap:6}}>{SOURCES.map(s=><button key={s} onClick={()=>setNewIdea(p=>({...p,source:s}))} style={{flex:1,padding:"8px 10px",borderRadius:8,border:newIdea.source===s?"2px solid #7c3aed":"1.5px solid #3f3f46",background:newIdea.source===s?"#27272a":"#18181b",fontSize:12,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{s}</button>)}</div></div>
            <div style={{flex:1}}><label style={ls}>Niches *</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{niches.map((n: any)=>{const sel=newIdea.nicheIds.includes(n.id);return <button key={n.id} type="button" onClick={()=>setNewIdea(p=>({...p,nicheIds:sel?p.nicheIds.filter(x=>x!==n.id):[...p.nicheIds,n.id]}))} style={{padding:"6px 12px",borderRadius:8,border:sel?"2px solid #7c3aed":"1.5px solid #3f3f46",background:sel?"#27272a":"#18181b",fontSize:12,fontWeight:600,cursor:"pointer",color:sel?"#fff":"#71717a"}}>{n.name}</button>;})}</div></div>
          </div>
          <div><label style={ls}>Created by</label><div style={{...is,background:"#27272a",color:"#a1a1aa"}}>{user?.user_metadata?.full_name || user?.email?.split("@")[0] || "—"}</div></div>
          <div><label style={ls}>Hook variations (one per line)</label><textarea className="fglass-input" value={newIdea.hook_variations} onChange={e=>setNewIdea(p=>({...p,hook_variations:e.target.value}))} rows={4} placeholder={"Hook variation 1\nHook variation 2\nHook variation 3"} style={{...is,resize:"vertical",minHeight:80}}/></div>
          <div><label style={ls}>Music reference / suggestions</label><input value={newIdea.music_ref} onChange={e=>setNewIdea(p=>({...p,music_ref:e.target.value}))} placeholder="e.g. Dark cinematic, trending audio XYZ" style={is}/></div>
          <div><label style={ls}>Drive link (base edit link)</label><input value={newIdea.frame_link} onChange={e=>setNewIdea(p=>({...p,frame_link:e.target.value}))} placeholder="Google Drive base edit link" style={is}/></div>
          {newIdea.source==="original"&&(
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}><label style={ls}>YT link (original source)</label><input value={newIdea.yt_url} onChange={e=>setNewIdea(p=>({...p,yt_url:e.target.value}))} placeholder="https://youtube.com/watch?v=..." style={is}/></div>
              <div style={{flex:"0 0 140px"}}><label style={ls}>YT timestamps</label><input value={newIdea.yt_timestamps} onChange={e=>setNewIdea(p=>({...p,yt_timestamps:e.target.value}))} placeholder="0:30-1:45" style={is}/></div>
            </div>
          )}
          {newIdea.source==="competitor"&&(
            <div><label style={ls}>Comp link</label><input value={newIdea.comp_link} onChange={e=>setNewIdea(p=>({...p,comp_link:e.target.value}))} placeholder="Competitor reel / post URL" style={is}/></div>
          )}
          <button onClick={addIdeaFn} disabled={!newIdea.title.trim()||newIdea.nicheIds.length===0} style={{...bp,opacity:(!newIdea.title.trim()||newIdea.nicheIds.length===0)?0.4:1,marginTop:2}}>Add idea</button>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!cd} onClose={()=>{
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if(approvedSaveTimer.current){ clearTimeout(approvedSaveTimer.current); approvedSaveTimer.current=null; }
        if(nicheSaveTimer.current){ clearTimeout(nicheSaveTimer.current); nicheSaveTimer.current=null; }
        if(cd){
          const d: Record<string, unknown> = {};
          if(!nicheIdsEqual(detailNicheIds, cd.nicheIds)) d.niche_ids = detailNicheIds;
          if(!approvedPagesEqual(detailApprovedPages, cd.approvedForPages)) {
            d.approved_for_pages = detailApprovedPages;
            d.tags = mergeAfpIntoTags(cd.tags, detailApprovedPages);
          }
          if(Object.keys(d).length) updateIdeaMut.mutate({ id: cd.id, data: d as any });
        }
        closeDetail();
      }} title={cd?.title||""} wide>
        {cd&&(()=>{const cdStage=normalizePipelineStage(cd.stage);const pp=(cd.postings||[]).map((p: any)=>p.page);return(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:99,background:(SC[cdStage]||SC.new).bg,color:(SC[cdStage]||SC.new).text}}>{SL[cdStage]||cdStage}</span>
              <span style={{fontSize:11,padding:"3px 9px",borderRadius:99,background:cd.source==="competitor"?"#EEEDFE":"#E8F5EE",color:cd.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{cd.source==="competitor"?"Competitor":"Original"}</span>
              {cdNiches.map((n: any)=><span key={n.id} style={{fontSize:11,padding:"3px 9px",borderRadius:99,background:"#27272a",color:"#a1a1aa",fontWeight:500}}>{n.name}</span>)}
            </div>
            {(sa[cdStage]??[]).length>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {sa[cdStage]?.map(a=><button key={a.stage} onClick={()=>moveIdea(cd.id,a.stage)} style={a.style}>{a.label}</button>)}
              </div>
            )}
            {["testing","proven_ideas","scheduled","posted"].includes(cdStage) && Array.isArray(cd.approvedForPages) && cd.approvedForPages.length > 0 && (
              <p style={{fontSize:11,color:"#71717a",margin:0,lineHeight:1.5}}>
                <span style={{fontWeight:600,color:"#52525b"}}>Scoped to </span>
                {cd.approvedForPages.map((h: string) => "@" + String(h).replace(/^@/,"")).join(" · ")}
              </p>
            )}

            {cdStage==="posted"&&(
              <PostedDateEditor
                ideaId={cd.id}
                label="Posted date"
                value={cd.posted_at}
                onSave={(iso)=>updateIdeaMut.mutateAsync({id:cd.id,data:{posted_at:iso}})}
              />
            )}

            {/* Editable fields */}
            <div><label style={ls}>Niches</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{niches.map((n: any)=>{const sel=detailNicheIds.includes(n.id);return <button key={n.id} type="button" onClick={()=>{const next=sel?detailNicheIds.filter((x: string)=>x!==n.id):[...detailNicheIds,n.id];setDetailNicheIds(next);saveNiches(cd.id,next);const newCdPages=niches.filter((nn: any)=>next.includes(nn.id)).flatMap((nn: any)=>nn.pages||[]).filter((v: string,i: number,a: string[])=>a.indexOf(v)===i);setDetailApprovedPages((prev: string[])=>{const pr=prev.filter(p=>newCdPages.some((np: string)=>normH(np)===normH(p)));if(pr.length!==prev.length) saveApprovedPages(cd.id,pr);return pr;});}} className={`fglass-pill${sel?" is-on":""}`}>{n.name}</button>;})}</div></div>
            {cdPages.length>0 && (cdStage==="approved" || cdStage==="base_edit") && (
              <div>
                <label style={ls}>Approved for pages</label>
                <p style={{fontSize:11,color:"#52525b",margin:"0 0 8px",lineHeight:1.45}}>Pick which @handles this idea is approved to run on (under the niches above). Leave <strong style={{color:"#a1a1aa"}}>none</strong> selected to use <strong style={{color:"#a1a1aa"}}>all</strong> of those pages when you start testing.</p>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {cdPages.map((page: string) => {
                    const sel = detailApprovedPages.some((af: string) => normH(af) === normH(page));
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => {
                          const next = sel ? detailApprovedPages.filter((af: string) => normH(af) !== normH(page)) : [...detailApprovedPages, page];
                          setDetailApprovedPages(next);
                          saveApprovedPages(cd.id, next);
                        }}
                        className={`fglass-pill${sel?" is-on-green":""}`}
                      >@{String(page).replace(/^@/,"")}</button>
                    );
                  })}
                </div>
                <p style={{fontSize:10,color:"#3f3f46",margin:"6px 0 0"}}>{detailApprovedPages.length ? `${detailApprovedPages.length} of ${cdPages.length} selected` : `All ${cdPages.length} page${cdPages.length === 1 ? "" : "s"} available in testing`}</p>
              </div>
            )}
            <div><label style={ls}>Hook variations</label><SafeTextArea value={(cd.hook_variations||[]).join("\n")} onSave={v=>{const lines=v.split("\n").map((l: string)=>l.trim()).filter(Boolean);updateIdeaMut.mutate({id:cd.id,data:{hook_variations:lines.length>0?lines:null}});}} rows={3} placeholder="One hook per line" style={{...is,resize:"vertical",minHeight:60}}/></div>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}><label style={ls}>Music reference / suggestions</label><SafeTextInput value={cd.music_ref} onSave={v=>updateIdeaMut.mutate({id:cd.id,data:{music_ref:v}})} placeholder="e.g. Dark cinematic, trending audio" style={is}/></div>
            </div>
            <div><label style={ls}>Drive link (base edit link)</label><SafeTextInput value={cd.frame_link} onSave={v=>updateIdeaMut.mutate({id:cd.id,data:{frame_link:v}})} placeholder="Google Drive base edit link" style={is}/></div>
            {cd.frame_link&&<a href={cd.frame_link} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#4A7FD4",wordBreak:"break-all"}}>{cd.frame_link}</a>}
            {cdStage==="base_edit"&&(
              <div>
                <label style={ls}>Kalakar link</label>
                <SafeTextInput value={cd.kalakar_link} onSave={v=>updateIdeaMut.mutate({id:cd.id,data:{kalakar_link:v}})} placeholder="Paste Kalakar project or edit link" style={is}/>
                {!!cd.kalakar_link && <a href={cd.kalakar_link} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#4A7FD4",wordBreak:"break-all",display:"block",marginTop:4}}>{cd.kalakar_link}</a>}
              </div>
            )}
            {cdStage!=="base_edit" && cd.kalakar_link && (
              <div>
                <label style={ls}>Kalakar link</label>
                <a href={cd.kalakar_link} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#4A7FD4",wordBreak:"break-all"}}>{cd.kalakar_link}</a>
              </div>
            )}
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}><label style={ls}>YT link (original source)</label><SafeTextInput value={cd.yt_url} onSave={v=>updateIdeaMut.mutate({id:cd.id,data:{yt_url:v}})} placeholder="https://youtube.com/watch?v=..." style={is}/></div>
              <div style={{flex:"0 0 140px"}}><label style={ls}>YT timestamps</label><SafeTextInput value={cd.yt_timestamps} onSave={v=>updateIdeaMut.mutate({id:cd.id,data:{yt_timestamps:v}})} placeholder="0:30-1:45" style={is}/></div>
            </div>
            {cd.yt_url&&<a href={cd.yt_url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#4A7FD4",wordBreak:"break-all"}}>{cd.yt_url}</a>}
            <div><label style={ls}>Comp link</label><SafeTextInput value={cd.comp_link} onSave={v=>updateIdeaMut.mutate({id:cd.id,data:{comp_link:v}})} placeholder="Competitor reel / post URL" style={is}/></div>
            {cd.comp_link&&<a href={cd.comp_link} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#4A7FD4",wordBreak:"break-all"}}>{cd.comp_link}</a>}

            {/* Page checklist — from testing stage onwards */}
            {effectiveCdPages.length>0&&!["new","approved","base_edit"].includes(cdStage)&&(
              <div>
                <label style={{...ls,marginBottom:8}}>Pages ({cdNiches.map((n: any)=>n.name).join(", ")}) — select, schedule & track</label>
                {effectiveCdPages.map((page: string)=>{const isP=pp.includes(page);const pi=(cd.postings||[]).findIndex((p: any)=>p.page===page);const po=pi>=0?cd.postings[pi]:null;const dk=`${cd.id}_${page}`;
                  const sBorder=isP?(cdStage==="testing"?"1.5px solid rgba(212,149,42,0.4)":cdStage==="proven_ideas"?"1.5px solid rgba(29,158,117,0.4)":cdStage==="kill"?"1.5px solid rgba(201,59,59,0.4)":(cdStage==="scheduled"||cdStage==="posted")?"1.5px solid rgba(34,197,94,0.4)":"1.5px solid #3f3f46"):"1px solid #27272a";
                  const sBg=isP?(cdStage==="testing"?"rgba(212,149,42,0.04)":cdStage==="proven_ideas"?"rgba(29,158,117,0.04)":cdStage==="kill"?"rgba(201,59,59,0.04)":(cdStage==="scheduled"||cdStage==="posted")?"rgba(34,197,94,0.04)":"#1a1a2e"):"#18181b";
                  return(
                  <div key={page} style={{padding:"10px 12px",background:sBg,borderRadius:8,marginBottom:4,border:sBorder}}>
                    {isP&&po?(
                      <PostingCard key={po.id} po={po} page={page} fmtD={fmtD} PT={PT} updatePostingMut={updatePostingMut} onRemove={()=>togglePage(cd.id,page,0,"")} stage={cdStage}/>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <div onClick={()=>{const sd=scheduleDate[dk];togglePage(cd.id,page,sd?.baseline||0,sd?.date||today());setScheduleDate(p=>{const n={...p};delete n[dk];return n;});}} style={{width:20,height:20,borderRadius:5,border:"1.5px solid #3f3f46",background:"#18181b",cursor:"pointer",flexShrink:0}}/>
                        <span style={{fontSize:13,fontWeight:500,color:"#71717a",minWidth:80}}>@{page}</span>
                        <input type="date" value={scheduleDate[dk]?.date||""} onChange={e=>setScheduleDate(p=>({...p,[dk]:{...p[dk],date:e.target.value}}))} style={{padding:"4px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:11,background:"#09090b",color:"#a1a1aa"}}/>
                        <input type="number" value={scheduleDate[dk]?.baseline||""} placeholder="Baseline" onChange={e=>setScheduleDate(p=>({...p,[dk]:{...p[dk],baseline:e.target.value}}))} style={{width:75,padding:"4px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:11,background:"#09090b"}}/>
                      </div>
                    )}
                  </div>);})}
                <div style={{marginTop:8,fontSize:11,color:"#52525b"}}>{pp.length}/{effectiveCdPages.length} pages selected</div>
              </div>
            )}
            <IdeaThread
              ideaId={cd.id}
              active={cdStage !== "new"}
              trackerType="reel"
            />
            {canDeleteThisIdea(cd) && <button onClick={()=>deleteIdea(cd.id)} style={{...bs,color:"#FF7070",borderColor:"#3f3f46",marginTop:6,fontSize:12}}>Delete idea</button>}
          </div>);})()}
      </Modal>

      {/* Manage Niches */}
      <Modal open={settingsOpen} onClose={()=>setSettingsOpen(false)} title="Manage niches">
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {niches.map(n=>(
            <div key={n.id} style={{padding:"10px 12px",background:"#09090b",borderRadius:9,border:"1px solid #27272a"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:600,color:"#fff"}}>{n.name}</span>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setEditNiche({id:n.id,name:n.name,pagesStr:n.pages.join(", ")})} style={{background:"none",border:"none",fontSize:11,color:"#4A7FD4",cursor:"pointer",fontWeight:500}}>Edit</button>
                  <button onClick={()=>deleteNiche(n.id)} style={{background:"none",border:"none",fontSize:11,color:"#C93B3B",cursor:"pointer",fontWeight:500}}>Remove</button>
                </div>
              </div>
              <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                {n.pages.length > 0
                  ? n.pages.map((p: string)=><span key={p} style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:"#27272a",color:"#a1a1aa"}}>@{p.replace(/^@/,"")}</span>)
                  : <span style={{fontSize:11,color:"#52525b",fontStyle:"italic"}}>No pages — click Edit to add</span>
                }
              </div>
              <div style={{marginTop:4,fontSize:10,color:"#3f3f46"}}>{n.pages.length} pages</div>
            </div>
          ))}
          <button onClick={()=>setAddNicheOpen(true)} style={bs}>+ Add niche</button>
        </div>
      </Modal>

      {/* Edit Niche */}
      <Modal open={!!editNiche} onClose={()=>setEditNiche(null)} title="Edit niche">
        {editNiche&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div><label style={ls}>Niche name</label><input value={editNiche.name} onChange={e=>setEditNiche((p: any)=>({...p,name:e.target.value}))} style={is}/></div>
            <div><label style={ls}>Pages (comma-separated)</label><input value={editNiche.pagesStr} onChange={e=>setEditNiche((p: any)=>({...p,pagesStr:e.target.value}))} style={is}/></div>
            <button onClick={saveEditNiche} disabled={!editNiche.name.trim()} style={{...bp,opacity:!editNiche.name.trim()?0.4:1}}>Save changes</button>
          </div>
        )}
      </Modal>

      {/* Add Niche */}
      <Modal open={addNicheOpen} onClose={()=>setAddNicheOpen(false)} title="Add niche">
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div><label style={ls}>Niche name</label><input value={newNiche.name} onChange={e=>setNewNiche(p=>({...p,name:e.target.value}))} placeholder="e.g. Stoicism" style={is}/></div>
          <div><label style={ls}>Pages (comma-separated)</label><input value={newNiche.pages} onChange={e=>setNewNiche(p=>({...p,pages:e.target.value}))} placeholder="@page1, @page2, @page3" style={is}/></div>
          <button onClick={addNiche} disabled={!newNiche.name.trim()} style={{...bp,opacity:!newNiche.name.trim()?0.4:1}}>Add niche</button>
        </div>
      </Modal>
    </div>
  );
}
