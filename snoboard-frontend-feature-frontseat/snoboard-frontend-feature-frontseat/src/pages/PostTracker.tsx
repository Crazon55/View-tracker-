import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  getTrackerNiches, createTrackerNiche, updateTrackerNiche, deleteTrackerNiche,
  getTrackerIdeas, createTrackerIdea, updateTrackerIdea, deleteTrackerIdea,
  createTrackerPosting, updateTrackerPosting, deleteTrackerPosting,
} from "@/services/api";

const STAGES = ["new","approved","design_approval","scripted","testing","batch_production","scheduled","uploaded"];
const SL: Record<string,string> = { new:"New ideas", approved:"Approved", design_approval:"Design approval", scripted:"Scripted", testing:"Testing", batch_production:"Batch production", scheduled:"Scheduled", uploaded:"Uploaded" };
const SC: Record<string,{bg:string;text:string;dot:string}> = {
  new:{ bg:"rgba(74,127,212,0.15)",text:"#7BB0FF",dot:"#4A7FD4" },
  approved:{ bg:"rgba(45,158,95,0.15)",text:"#5AE0A0",dot:"#2D9E5F" },
  design_approval:{ bg:"rgba(123,97,196,0.15)",text:"#B49EFF",dot:"#7B61C4" },
  scripted:{ bg:"rgba(212,149,42,0.15)",text:"#F0C060",dot:"#D4952A" },
  testing:{ bg:"rgba(212,118,42,0.15)",text:"#F0A050",dot:"#D4762A" },
  batch_production:{ bg:"rgba(29,158,117,0.15)",text:"#50E0B0",dot:"#1D9E75" },
  scheduled:{ bg:"rgba(83,74,183,0.15)",text:"#9B8FFF",dot:"#534AB7" },
  uploaded:{ bg:"rgba(138,138,128,0.15)",text:"#a1a1aa",dot:"#8A8A80" },
};
const PT: Record<string,{label:string;color:string;bg:string}> = {
  below:{ label:"Below",color:"#FF7070",bg:"rgba(201,59,59,0.15)" },
  baseline:{ label:"Baseline",color:"#F0C060",bg:"rgba(212,149,42,0.15)" },
  topline:{ label:"Topline",color:"#50E0B0",bg:"rgba(29,158,117,0.15)" },
  viral:{ label:"Viral",color:"#B49EFF",bg:"rgba(123,97,196,0.15)" },
};
const SOURCES = ["original","competitor"];

const today = () => new Date().toISOString().slice(0,10);
const fmtD = (d: string) => { const dt=new Date(d+"T00:00:00"); return dt.toLocaleDateString("en-US",{month:"short",day:"numeric"}); };
const fmtDFull = (d: string) => { const dt=new Date(d+"T00:00:00"); return dt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); };
const fmtNum = (n: number) => { if(n>=1000000) return (n/1000000).toFixed(1)+"M"; if(n>=1000) return (n/1000).toFixed(1)+"k"; return n.toString(); };
const gPerf = (v: number|null, b: number|null) => { if(!v||!b) return null; const r=v/b; if(r>=20) return "viral"; if(r>=5) return "topline"; if(r>=0.8) return "baseline"; return "below"; };
const getMonday = (d: string) => { const dt=new Date(d+"T00:00:00"); const day=dt.getDay(); dt.setDate(dt.getDate()-day+(day===0?-6:1)); return dt.toISOString().slice(0,10); };
const addD = (s: string, n: number) => { const d=new Date(s+"T00:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const getWD = (m: string) => Array.from({length:7},(_,i)=>addD(m,i));
const monthStart = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10); };

/** Map a raw API idea to the shape the UI expects */
function mapIdea(raw: any): any {
  const nicheIds: string[] = (raw.niche_ids && raw.niche_ids.length > 0) ? raw.niche_ids : (raw.niche_id ? [raw.niche_id] : []);
  return {
    ...raw,
    nicheIds,
    createdAt: raw.created_at ? new Date(raw.created_at).getTime() : Date.now(),
    hook_variations: raw.hook_variations || [],
    music_ref: raw.music_ref || null,
    comp_link: raw.comp_link || null,
    tags: raw.tags || [],
    format: raw.format || null,
    main_page_hook: raw.main_page_hook || null,
    content_pillar: raw.content_pillar || null,
    content_bucket: raw.content_bucket || null,
    postings: (raw.tracker_postings || []).map((p: any) => ({
      id: p.id,
      page: p.page,
      date: p.date,
      baselineViews: p.baseline_views,
      views: p.views,
      perf_tag: p.perf_tag || null,
    })),
  };
}

function PB({tag}: {tag: string|null}){ if(!tag||!PT[tag]) return null; const t=PT[tag]; return <span style={{display:"inline-block",fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:99,background:t.bg,color:t.color}}>{t.label}</span>; }

function Modal({open,onClose,title,children,wide}: {open:boolean;onClose:()=>void;title:string;children:React.ReactNode;wide?:boolean}){
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)"}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:"relative",background:"#18181b",borderRadius:16,padding:"24px 28px",maxWidth:wide?720:520,width:"94%",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.5)",border:"1px solid #27272a"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:600,color:"#fff",letterSpacing:"-0.02em"}}>{title}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#71717a",padding:"4px 8px",borderRadius:6}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PostingCard({po,page,fmtD,PT,updatePostingMut,onRemove}: {po:any;page:string;fmtD:(d:string)=>string;PT:any;updatePostingMut:any;onRemove:()=>void}){
  const hasSaved = po.views !== null && po.views !== undefined;
  const [editing,setEditing]=useState(!hasSaved);
  const [views,setViews]=useState(po.views?.toString()||"");
  const [perfTag,setPerfTag]=useState(po.perf_tag||"");
  const [postDate,setPostDate]=useState(po.date||"");
  const fmtNum = (n: number) => { if(n>=1000000) return (n/1000000).toFixed(1)+"M"; if(n>=1000) return (n/1000).toFixed(1)+"k"; return n.toString(); };

  if(!editing && hasSaved){
    // Compact saved view
    const t = perfTag && PT[perfTag] ? PT[perfTag] : null;
    return(
      <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setEditing(true)}>
        <div style={{width:20,height:20,borderRadius:5,background:"#22c55e",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        <span style={{fontSize:13,fontWeight:600,color:"#fff"}}>@{page}</span>
        <span style={{fontSize:12,fontWeight:700,color:"#fff",fontFamily:"monospace"}}>{fmtNum(po.views)}</span>
        {t&&<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:99,background:t.bg,color:t.color}}>{t.label}</span>}
        <span style={{fontSize:11,color:"#52525b",marginLeft:"auto",whiteSpace:"nowrap"}}>{po.date ? fmtD(po.date) : ""}</span>
        <span style={{fontSize:10,color:"#3f3f46"}}>click to edit</span>
      </div>
    );
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:20,height:20,borderRadius:5,background:"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        <span style={{fontSize:13,fontWeight:600,color:"#fff",flex:1}}>@{page}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:30}}>
        <span style={{fontSize:10,color:"#71717a",fontWeight:600}}>Date</span>
        <input type="date" value={postDate} onChange={e=>setPostDate(e.target.value)} style={{padding:"5px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b",color:"#fff",cursor:"pointer"}}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:30}}>
        <span style={{fontSize:10,color:"#71717a",fontWeight:600}}>Views</span>
        <input type="number" value={views} onChange={e=>setViews(e.target.value)} placeholder="Enter views" style={{width:100,padding:"5px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b",color:"#fff"}}/>
      </div>
      <div style={{display:"flex",gap:4,marginLeft:30}}>
        {(["below","baseline","topline","viral"] as const).map(tag=>{const t=PT[tag];const active=perfTag===tag;return(
          <button key={tag} onClick={()=>setPerfTag(tag)} style={{padding:"4px 10px",borderRadius:6,border:active?`2px solid ${t.color}`:"1px solid #3f3f46",background:active?t.bg:"transparent",color:active?t.color:"#52525b",fontSize:10,fontWeight:600,cursor:"pointer",transition:"all 0.15s"}}>{t.label}</button>
        );})}
      </div>
      <div style={{display:"flex",gap:6,marginLeft:30,marginTop:2}}>
        <button onClick={()=>{updatePostingMut.mutate({id:po.id,data:{views:Number(views)||null,perf_tag:perfTag||null,date:postDate||null}},{onSuccess:()=>setEditing(false)});}} disabled={updatePostingMut.isPending} style={{padding:"5px 16px",borderRadius:7,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:updatePostingMut.isPending?"#52525b":"#7c3aed",color:"#fff"}}>{updatePostingMut.isPending?"Saving...":"Save"}</button>
        {hasSaved&&<button onClick={()=>setEditing(false)} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #3f3f46",fontSize:11,fontWeight:500,cursor:"pointer",background:"transparent",color:"#a1a1aa"}}>Cancel</button>}
        <button onClick={onRemove} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #3f3f46",fontSize:11,fontWeight:500,cursor:"pointer",background:"transparent",color:"#FF7070",marginLeft:"auto"}}>Remove</button>
      </div>
    </div>
  );
}

function IdeaCard({idea,niches,onClick}: {idea:any;niches:any[];onClick:()=>void}){
  const ideaNiches=niches.filter((n: any)=>(idea.nicheIds||[]).includes(n.id));
  const pc=idea.postings?.length||0;
  const bp=idea.postings?.reduce((b: string|null, p: any)=>{const t=gPerf(p.views,p.baselineViews);const o: Record<string,number>={viral:4,topline:3,baseline:2,below:1};return(o[t||""]||0)>(o[b||""]||0)?t:b;},null);
  return(
    <div onClick={onClick} style={{background:"#18181b",borderRadius:10,padding:"11px 13px",marginBottom:5,border:"1px solid #27272a",cursor:"grab",transition:"box-shadow 0.15s"}}
      onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 3px 12px rgba(0,0,0,0.3)")} onMouseLeave={e=>(e.currentTarget.style.boxShadow="none")}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
        <p style={{margin:0,fontSize:13,fontWeight:500,color:"#fff",lineHeight:1.35,flex:1}}>{idea.title}</p>
        {bp&&<PB tag={bp}/>}
      </div>
      <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:idea.source==="competitor"?"#EEEDFE":"#E8F5EE",color:idea.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{idea.source==="competitor"?"Comp":"Orig"}</span>
        {idea.format&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:"#18181b",color:"#a1a1aa",fontWeight:500,textTransform:"capitalize",border:"1px solid #3f3f46"}}>{idea.format}</span>}
        {ideaNiches.map((n: any)=><span key={n.id} style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:"#27272a",color:"#a1a1aa",fontWeight:500}}>{n.name}</span>)}
        {idea.content_pillar&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:99,background:"rgba(124,58,237,0.15)",color:"#B49EFF",fontWeight:500}}>{idea.content_pillar}</span>}
        {pc>0&&<span style={{fontSize:10,color:"#52525b",fontWeight:500}}>{pc}pg</span>}
      </div>
      {/* Info row */}
      <div style={{marginTop:5,display:"flex",flexDirection:"column",gap:2}}>
        {idea.tags?.includes("comp_research")&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:99,background:"rgba(212,118,42,0.15)",color:"#F0A050",fontWeight:600,alignSelf:"flex-start"}}>COMP RESEARCH</span>}
        {idea.created_by&&<span style={{fontSize:10,color:"#52525b"}}>by {idea.created_by}</span>}
        {idea.main_page_hook&&<span style={{fontSize:10,color:"#71717a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{idea.main_page_hook}</span>}
        {idea.content_bucket&&<span style={{fontSize:9,color:"#3f3f46"}}>{idea.content_bucket}</span>}
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
    const perfCounts: Record<string,number>={below:0,baseline:0,topline:0,viral:0};
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
        const order: Record<string,number>={viral:4,topline:3,baseline:2,below:1};
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

  const contributors = useMemo(()=>{
    const map: Record<string,{name:string;total:number;done:number;totalViews:number;winners:number}> = {};
    ideas.forEach((idea: any)=>{
      if(nicheFilter!=="all"&&!(idea.nicheIds||[]).includes(nicheFilter)) return;
      const name = (idea.created_by||"Unknown").trim() || "Unknown";
      if(!map[name]) map[name]={name,total:0,done:0,totalViews:0,winners:0};
      map[name].total++;
      if(idea.stage==="uploaded"||idea.stage==="scheduled") map[name].done++;
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
            {(["viral","topline","baseline","below"] as const).map(k=>data.perfCounts[k]>0&&<span key={k} style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:99,background:PT[k].bg,color:PT[k].color}}>{data.perfCounts[k]} {PT[k].label}</span>)}
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

export default function PostTracker(){
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ---- Data fetching via react-query ----
  const { data: rawNiches = [], isLoading: nichesLoading } = useQuery({
    queryKey: ["tracker-niches"],
    queryFn: getTrackerNiches,
  });
  const { data: rawIdeas = [], isLoading: ideasLoading } = useQuery({
    queryKey: ["tracker-ideas-post"],
    queryFn: () => getTrackerIdeas("post"),
  });

  const niches = rawNiches as any[];
  const ideas = useMemo(() => (rawIdeas as any[]).map(mapIdea), [rawIdeas]);
  const isLoading = nichesLoading || ideasLoading;

  // ---- Mutations ----
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tracker-ideas-post"] });
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

  // ---- Local UI state ----
  const [addOpen,setAddOpen]=useState(false);
  const [detailIdea,setDetailIdea]=useState<any>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [addNicheOpen,setAddNicheOpen]=useState(false);
  const [editNiche,setEditNiche]=useState<any>(null);
  const [newNiche,setNewNiche]=useState({name:"",pages:""});
  const [newIdea,setNewIdea]=useState({title:"",source:"original",nicheIds:[] as string[],format:"static",main_page_hook:"",content_pillar:"",content_bucket:"",hook_variations:"",comp_link:""});
  const [viewMode,setViewMode]=useState("board");
  const [nicheFilter,setNicheFilter]=useState("all");
  const [pageFilter,setPageFilter]=useState("all");
  const [weekStart,setWeekStart]=useState(getMonday(today()));
  const [scheduleDate,setScheduleDate]=useState<Record<string,any>>({});
  const [dateFrom,setDateFrom]=useState(monthStart());
  const [dateTo,setDateTo]=useState(today());
  const [compResearchFilter,setCompResearchFilter]=useState(false);
  const [sourceFilter,setSourceFilter]=useState("all");
  const [filterDateFrom,setFilterDateFrom]=useState("");
  const [filterDateTo,setFilterDateTo]=useState("");
  const [collapsedStages,setCollapsedStages]=useState<Record<string,boolean>>({});

  const nicheFiltered=nicheFilter==="all"?ideas:ideas.filter(i=>(i.nicheIds||[]).includes(nicheFilter));
  const sourceFiltered=sourceFilter==="all"?nicheFiltered:nicheFiltered.filter(i=>i.source===sourceFilter);
  const compFiltered=compResearchFilter?sourceFiltered.filter(i=>i.tags?.includes("comp_research")):sourceFiltered;
  const filteredIdeas=(filterDateFrom||filterDateTo)?compFiltered.filter(i=>{
    const d=i.created_at ? i.created_at.slice(0,10) : "";
    if(!d) return false;
    if(filterDateFrom && d<filterDateFrom) return false;
    if(filterDateTo && d>filterDateTo) return false;
    return true;
  }):compFiltered;
  const allPagesForFilter=nicheFilter==="all"?niches.flatMap((n: any)=>n.pages):(niches.find((n: any)=>n.id===nicheFilter)?.pages||[]);

  // ---- Actions wired to mutations ----
  function addIdeaFn(){
    if(!newIdea.title.trim()||newIdea.nicheIds.length===0)return;
    const hookLines = newIdea.hook_variations.split("\n").map(l=>l.trim()).filter(Boolean);
    createIdeaMut.mutate({
      title: newIdea.title.trim(),
      source: newIdea.source,
      niche_ids: newIdea.nicheIds,
      format: newIdea.format,
      main_page_hook: newIdea.main_page_hook.trim() || null,
      content_pillar: newIdea.content_pillar || null,
      content_bucket: newIdea.content_bucket || null,
      hook_variations: hookLines.length > 0 ? hookLines : null,
      comp_link: newIdea.source === "competitor" ? (newIdea.comp_link.trim() || null) : null,
      stage: "new",
      type: "post",
      created_by: user?.user_metadata?.full_name || user?.email?.split("@")[0] || user?.email || null,
    });
    setNewIdea({title:"",source:"original",nicheIds:[],format:"static",main_page_hook:"",content_pillar:"",content_bucket:"",hook_variations:"",comp_link:""});
    setAddOpen(false);
  }
  function moveIdea(id: string, ns: string){
    updateIdeaMut.mutate({ id, data: { stage: ns } });
  }
  function deleteIdea(id: string){
    deleteIdeaMut.mutate(id);
    setDetailIdea(null);
  }

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

  const is: React.CSSProperties={width:"100%",padding:"9px 13px",border:"1.5px solid #3f3f46",borderRadius:9,fontSize:13,outline:"none",background:"#09090b",boxSizing:"border-box"};
  const ls: React.CSSProperties={display:"block",fontSize:11,fontWeight:600,color:"#71717a",marginBottom:4,letterSpacing:"0.04em",textTransform:"uppercase"};
  const bp: React.CSSProperties={padding:"9px 20px",background:"#7c3aed",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"};
  const bs: React.CSSProperties={padding:"9px 20px",background:"#27272a",color:"#e4e4e7",border:"1px solid #3f3f46",borderRadius:9,fontSize:13,fontWeight:500,cursor:"pointer"};

  const cd=detailIdea?ideas.find(i=>i.id===detailIdea.id)||detailIdea:null;
  const cdNiches=cd?niches.filter((n: any)=>(cd.nicheIds||[]).includes(n.id)):[];
  const cdPages=cdNiches.flatMap((n: any)=>n.pages||[]).filter((v: string,i: number,a: string[])=>a.indexOf(v)===i);

  const sa: Record<string, {label:string;stage:string;style:React.CSSProperties}[]>={
    new:[{label:"Approve",stage:"approved",style:bp}],
    approved:[{label:"Approve design",stage:"design_approval",style:bp}],
    design_approval:[{label:"Mark scripted",stage:"scripted",style:bp}],
    scripted:[{label:"Start testing",stage:"testing",style:bp}],
    testing:[{label:"Move to batch",stage:"batch_production",style:bp}],
    batch_production:[{label:"Schedule",stage:"scheduled",style:{...bp,background:"#534AB7"}}],
    scheduled:[{label:"Mark uploaded",stage:"uploaded",style:{...bp,background:"#1D9E75"}}],
    uploaded:[],
  };

  const counts: Record<string,number>={};STAGES.forEach(s=>{counts[s]=filteredIdeas.filter(i=>i.stage===s).length;});
  function openDetail(idea: any){setDetailIdea(idea);setScheduleDate({});}

  // ---- Loading spinner ----
  if(isLoading){
    return(
      <div style={{fontFamily:"'DM Sans','Helvetica Neue',sans-serif",minHeight:"100vh",background:"#09090b",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <div style={{textAlign:"center"}}>
          <div style={{width:36,height:36,border:"3px solid #27272a",borderTopColor:"#7c3aed",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 14px"}}/>
          <p style={{fontSize:13,color:"#71717a"}}>Loading post tracker...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return(
    <div style={{fontFamily:"'DM Sans','Helvetica Neue',sans-serif",minHeight:"100vh",background:"#09090b",color:"#fff"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Header — left padded to clear hamburger menu */}
      <div style={{padding:"20px 24px 12px 70px",borderBottom:"1px solid #27272a",background:"#09090b"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:700,letterSpacing:"-0.03em"}}>Post tracker</h1>
            <p style={{margin:"3px 0 0",fontSize:12,color:"#71717a"}}>{ideas.length} ideas · {niches.length} niches · {niches.reduce((a: number,n: any)=>a+n.pages.length,0)} pages</p>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
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
          <div style={{display:"flex",background:"#27272a",borderRadius:7,overflow:"hidden",border:"1px solid #3f3f46"}}>
            {["board","list","calendar","analytics"].map(v=>(
              <button key={v} onClick={()=>setViewMode(v)} style={{padding:"5px 12px",border:"none",fontSize:12,fontWeight:500,cursor:"pointer",background:viewMode===v?"#3f3f46":"transparent",color:viewMode===v?"#fff":"#71717a",boxShadow:viewMode===v?"0 1px 3px rgba(0,0,0,0.06)":"none",textTransform:"capitalize"}}>{v}</button>
            ))}
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <input type="date" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)} title="From" style={{padding:"5px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:11,background:"#09090b",color:"#a1a1aa",cursor:"pointer"}}/>
              <span style={{fontSize:10,color:"#52525b"}}>→</span>
              <input type="date" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)} title="To" style={{padding:"5px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:11,background:"#09090b",color:"#a1a1aa",cursor:"pointer"}}/>
              {(filterDateFrom||filterDateTo)&&<button onClick={()=>{setFilterDateFrom("");setFilterDateTo("");}} style={{padding:"3px 7px",borderRadius:5,border:"none",fontSize:11,cursor:"pointer",background:"transparent",color:"#71717a"}}>✕</button>}
            </div>
            <button onClick={()=>setCompResearchFilter(!compResearchFilter)} style={{padding:"5px 12px",borderRadius:7,border:compResearchFilter?"2px solid #F0A050":"1px solid #3f3f46",background:compResearchFilter?"rgba(212,118,42,0.15)":"transparent",color:compResearchFilter?"#F0A050":"#71717a",fontSize:11,fontWeight:600,cursor:"pointer"}}>Comp Research</button>
            <button onClick={()=>setSettingsOpen(true)} style={bs}>Niches</button>
            <button onClick={()=>setAddOpen(true)} style={bp}>+ New idea</button>
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
                <span style={{fontSize:10,color:"#52525b",fontWeight:500}}>{counts[stage]}</span>
              </div>
              <div style={{minHeight:50,padding:1,borderRadius:9,transition:"all 0.15s",border:dropStage===stage?"2px solid #7c3aed":"2px solid transparent",background:dropStage===stage?"rgba(124,58,237,0.05)":"transparent"}}>
                {filteredIdeas.filter(i=>i.stage===stage).sort((a,b)=>b.createdAt-a.createdAt).map(idea=>(
                  <div key={idea.id} draggable onDragStart={e=>{setDraggingId(idea.id);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",idea.id);}} onDragEnd={()=>{setDraggingId(null);setDropStage(null);}} style={{opacity:draggingId===idea.id?0.4:1,transition:"opacity 0.15s"}}>
                    <IdeaCard idea={idea} niches={niches} onClick={()=>openDetail(idea)}/>
                  </div>
                ))}
                {counts[stage]===0&&<div style={{padding:"24px 12px",textAlign:"center",color:"#3f3f46",fontSize:11,border:"1.5px dashed #3f3f46",borderRadius:9}}>Empty</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {viewMode==="list"&&(
        <div style={{padding:"14px 24px 14px 70px",maxWidth:960}}>
          {STAGES.filter(s=>counts[s]>0).map(stage=>{const collapsed=collapsedStages[stage];return(
            <div key={stage} style={{marginBottom:18}}>
              <div onClick={()=>setCollapsedStages(p=>({...p,[stage]:!p[stage]}))} style={{display:"flex",alignItems:"center",gap:7,marginBottom:7,cursor:"pointer",userSelect:"none"}}>
                <span style={{fontSize:10,color:"#71717a",transform:collapsed?"rotate(-90deg)":"rotate(0deg)",transition:"transform 0.15s",display:"inline-block"}}>▼</span>
                <span style={{width:7,height:7,borderRadius:"50%",background:SC[stage].dot}}/>
                <span style={{fontSize:13,fontWeight:600,color:SC[stage].text}}>{SL[stage]}</span>
                <span style={{fontSize:11,color:"#52525b"}}>{counts[stage]}</span>
              </div>
              {!collapsed&&filteredIdeas.filter(i=>i.stage===stage).map(idea=>{const ideaNiches=niches.filter((n: any)=>(idea.nicheIds||[]).includes(n.id));return(
                <div key={idea.id} onClick={()=>openDetail(idea)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#18181b",borderRadius:8,marginBottom:3,border:"1px solid #27272a",cursor:"pointer",fontSize:13}}>
                  <span style={{flex:1,fontWeight:500}}>{idea.title}</span>
                  <span style={{fontSize:11,color:"#52525b"}}>{ideaNiches.map((n: any)=>n.name).join(", ")}</span>
                  <span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:idea.source==="competitor"?"#EEEDFE":"#E8F5EE",color:idea.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{idea.source==="competitor"?"Comp":"Orig"}</span>
                  {idea.postings?.length>0&&<span style={{fontSize:10,color:"#52525b"}}>{idea.postings.length}pg</span>}
                </div>);})}
            </div>);})}
          {filteredIdeas.length===0&&<p style={{textAlign:"center",color:"#52525b",padding:40,fontSize:13}}>No ideas yet.</p>}
        </div>
      )}

      {/* Calendar */}
      {viewMode==="calendar"&&<CalendarView ideas={ideas} niches={niches} nicheFilter={nicheFilter} pageFilter={pageFilter} onClickIdea={openDetail} weekStart={weekStart} setWeekStart={setWeekStart}/>}

      {/* Analytics */}
      {viewMode==="analytics"&&<AnalyticsView ideas={ideas} niches={niches} nicheFilter={nicheFilter} pageFilter={pageFilter} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} setPageFilter={setPageFilter} onClickIdea={openDetail}/>}

      {/* Add Idea */}
      <Modal open={addOpen} onClose={()=>setAddOpen(false)} title="Add new post idea">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><label style={ls}>Idea name *</label><input value={newIdea.title} onChange={e=>setNewIdea(p=>({...p,title:e.target.value}))} placeholder="e.g. Top 10 startups that failed in 2026" style={is}/></div>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><label style={ls}>Source</label><div style={{display:"flex",gap:6}}>{SOURCES.map(s=><button key={s} onClick={()=>setNewIdea(p=>({...p,source:s}))} style={{flex:1,padding:"8px 10px",borderRadius:8,border:newIdea.source===s?"2px solid #7c3aed":"1.5px solid #3f3f46",background:newIdea.source===s?"#27272a":"#18181b",fontSize:12,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{s}</button>)}</div></div>
            <div style={{flex:1}}><label style={ls}>Format</label><div style={{display:"flex",gap:6}}>{["static","carousel"].map(f=><button key={f} onClick={()=>setNewIdea(p=>({...p,format:f}))} style={{flex:1,padding:"8px 10px",borderRadius:8,border:newIdea.format===f?"2px solid #7c3aed":"1.5px solid #3f3f46",background:newIdea.format===f?"#27272a":"#18181b",fontSize:12,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{f}</button>)}</div></div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><label style={ls}>Niches *</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{niches.map((n: any)=>{const sel=newIdea.nicheIds.includes(n.id);return <button key={n.id} type="button" onClick={()=>setNewIdea(p=>({...p,nicheIds:sel?p.nicheIds.filter(x=>x!==n.id):[...p.nicheIds,n.id]}))} style={{padding:"6px 12px",borderRadius:8,border:sel?"2px solid #7c3aed":"1.5px solid #3f3f46",background:sel?"#27272a":"#18181b",fontSize:12,fontWeight:600,cursor:"pointer",color:sel?"#fff":"#71717a"}}>{n.name}</button>;})}</div></div>
            <div style={{flex:1}}><label style={ls}>Created by</label><div style={{...is,background:"#27272a",color:"#a1a1aa"}}>{user?.user_metadata?.full_name || user?.email?.split("@")[0] || "—"}</div></div>
          </div>
          <div><label style={ls}>Main page hook</label><input value={newIdea.main_page_hook} onChange={e=>setNewIdea(p=>({...p,main_page_hook:e.target.value}))} placeholder="The main hook for the lead page" style={is}/></div>
          <div><label style={ls}>Hook variations (one per line)</label><textarea value={newIdea.hook_variations} onChange={e=>setNewIdea(p=>({...p,hook_variations:e.target.value}))} rows={3} placeholder={"Hook variation 1\nHook variation 2\nHook variation 3"} style={{...is,resize:"vertical",minHeight:60}}/></div>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}>
              <label style={ls}>Content pillar</label>
              <select value={newIdea.content_pillar} onChange={e=>setNewIdea(p=>({...p,content_pillar:e.target.value}))} style={{...is,cursor:"pointer"}}>
                <option value="">Select pillar</option>
                {["News","Static - Quote","Memes","Informational","Case Study","MM","Blue Ocean"].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{flex:1}}>
              <label style={ls}>Content bucket</label>
              <select value={newIdea.content_bucket} onChange={e=>setNewIdea(p=>({...p,content_bucket:e.target.value}))} style={{...is,cursor:"pointer"}}>
                <option value="">Select bucket</option>
                {["Events in India","Stories","Merger","Before & After Comparison","Charts/Tables/Stats","Tips/Business Ideas","Net Worth","Case Studies","Quotes","Local News","Govt Policies","Stock Market","Startup News","Tech/AI News"].map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          {newIdea.source==="original"&&(
            <div><label style={ls}>Original source / references</label><input value={newIdea.comp_link} onChange={e=>setNewIdea(p=>({...p,comp_link:e.target.value}))} placeholder="Reference links, articles, sources..." style={is}/></div>
          )}
          {newIdea.source==="competitor"&&(
            <div><label style={ls}>Comp link</label><input value={newIdea.comp_link} onChange={e=>setNewIdea(p=>({...p,comp_link:e.target.value}))} placeholder="Competitor post URL" style={is}/></div>
          )}
          <button onClick={addIdeaFn} disabled={!newIdea.title.trim()||newIdea.nicheIds.length===0} style={{...bp,opacity:(!newIdea.title.trim()||newIdea.nicheIds.length===0)?0.4:1,marginTop:2}}>Add idea</button>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!cd} onClose={()=>setDetailIdea(null)} title={cd?.title||""} wide>
        {cd&&(()=>{const pp=(cd.postings||[]).map((p: any)=>p.page);return(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:99,background:SC[cd.stage].bg,color:SC[cd.stage].text}}>{SL[cd.stage]}</span>
              <span style={{fontSize:11,padding:"3px 9px",borderRadius:99,background:cd.source==="competitor"?"#EEEDFE":"#E8F5EE",color:cd.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{cd.source==="competitor"?"Competitor":"Original"}</span>
              {cd.format&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:99,background:"#18181b",color:"#a1a1aa",fontWeight:500,textTransform:"capitalize",border:"1px solid #3f3f46"}}>{cd.format}</span>}
              {cdNiches.map((n: any)=><span key={n.id} style={{fontSize:11,padding:"3px 9px",borderRadius:99,background:"#27272a",color:"#a1a1aa",fontWeight:500}}>{n.name}</span>)}
              {cd.content_pillar&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:99,background:"rgba(124,58,237,0.15)",color:"#B49EFF",fontWeight:500}}>{cd.content_pillar}</span>}
              {cd.content_bucket&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:99,background:"rgba(212,149,42,0.15)",color:"#F0C060",fontWeight:500}}>{cd.content_bucket}</span>}
            </div>
            {sa[cd.stage]?.length>0&&<div style={{display:"flex",gap:6}}>{sa[cd.stage].map(a=><button key={a.stage} onClick={()=>moveIdea(cd.id,a.stage)} style={a.style}>{a.label}</button>)}</div>}

            {/* Editable fields */}
            <div><label style={ls}>Niches</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{niches.map((n: any)=>{const sel=(cd.nicheIds||[]).includes(n.id);return <button key={n.id} onClick={()=>{const cur=cd.nicheIds||[];const next=sel?cur.filter((x: string)=>x!==n.id):[...cur,n.id];updateIdeaMut.mutate({id:cd.id,data:{niche_ids:next}});}} style={{padding:"6px 12px",borderRadius:8,border:sel?"2px solid #7c3aed":"1.5px solid #3f3f46",background:sel?"#27272a":"#18181b",fontSize:12,fontWeight:600,cursor:"pointer",color:sel?"#fff":"#71717a"}}>{n.name}</button>;})}</div></div>
            <div><label style={ls}>Main page hook</label><input defaultValue={cd.main_page_hook||""} key={cd.id+"_hook"} onBlur={e=>updateIdeaMut.mutate({id:cd.id,data:{main_page_hook:e.target.value.trim()||null}})} placeholder="The main hook for the lead page" style={is}/></div>
            <div><label style={ls}>Hook variations</label><textarea defaultValue={(cd.hook_variations||[]).join("\n")} key={cd.id+"_hooks"} onBlur={e=>{const lines=e.target.value.split("\n").map((l: string)=>l.trim()).filter(Boolean);updateIdeaMut.mutate({id:cd.id,data:{hook_variations:lines.length>0?lines:null}});}} rows={3} placeholder="One hook per line" style={{...is,resize:"vertical",minHeight:60}}/></div>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}>
                <label style={ls}>Content pillar</label>
                <select defaultValue={cd.content_pillar||""} key={cd.id+"_pillar"} onChange={e=>updateIdeaMut.mutate({id:cd.id,data:{content_pillar:e.target.value||null}})} style={{...is,cursor:"pointer"}}>
                  <option value="">Select pillar</option>
                  {["News","Static - Quote","Memes","Informational","Case Study","MM","Blue Ocean"].map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{flex:1}}>
                <label style={ls}>Content bucket</label>
                <select defaultValue={cd.content_bucket||""} key={cd.id+"_bucket"} onChange={e=>updateIdeaMut.mutate({id:cd.id,data:{content_bucket:e.target.value||null}})} style={{...is,cursor:"pointer"}}>
                  <option value="">Select bucket</option>
                  {["Events in India","Stories","Merger","Before & After Comparison","Charts/Tables/Stats","Tips/Business Ideas","Net Worth","Case Studies","Quotes","Local News","Govt Policies","Stock Market","Startup News","Tech/AI News"].map(b=><option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            {cd.source==="original"&&(
              <div><label style={ls}>Original source / references</label><input defaultValue={cd.comp_link||""} key={cd.id+"_source"} onBlur={e=>updateIdeaMut.mutate({id:cd.id,data:{comp_link:e.target.value.trim()||null}})} placeholder="Reference links, articles, sources..." style={is}/></div>
            )}
            {cd.source==="competitor"&&(
              <div><label style={ls}>Comp link</label><input defaultValue={cd.comp_link||""} key={cd.id+"_comp"} onBlur={e=>updateIdeaMut.mutate({id:cd.id,data:{comp_link:e.target.value.trim()||null}})} placeholder="Competitor post URL" style={is}/></div>
            )}
            {cd.comp_link&&<a href={cd.comp_link} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#4A7FD4",wordBreak:"break-all"}}>{cd.comp_link}</a>}

            {/* Page checklist — from testing stage onwards */}
            {cdPages.length>0&&!["new","approved","design_approval","scripted"].includes(cd.stage)&&(
              <div>
                <label style={{...ls,marginBottom:8}}>Pages ({cdNiches.map((n: any)=>n.name).join(", ")}) — select, schedule & track</label>
                {cdPages.map((page: string)=>{const isP=pp.includes(page);const pi=(cd.postings||[]).findIndex((p: any)=>p.page===page);const po=pi>=0?cd.postings[pi]:null;const dk=`${cd.id}_${page}`;
                  const sBorder=isP?(cd.stage==="testing"?"1.5px solid rgba(212,149,42,0.4)":(cd.stage==="scheduled"||cd.stage==="uploaded")?"1.5px solid rgba(34,197,94,0.4)":"1.5px solid #3f3f46"):"1px solid #27272a";
                  const sBg=isP?(cd.stage==="testing"?"rgba(212,149,42,0.04)":(cd.stage==="scheduled"||cd.stage==="uploaded")?"rgba(34,197,94,0.04)":"#1a1a2e"):"#18181b";
                  return(
                  <div key={page} style={{padding:"10px 12px",background:sBg,borderRadius:8,marginBottom:4,border:sBorder}}>
                    {isP&&po?(
                      <PostingCard key={po.id} po={po} page={page} fmtD={fmtD} PT={PT} updatePostingMut={updatePostingMut} onRemove={()=>togglePage(cd.id,page,0,"")} stage={cd.stage}/>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <div onClick={()=>{const sd=scheduleDate[dk];togglePage(cd.id,page,sd?.baseline||0,sd?.date||today());setScheduleDate(p=>{const n={...p};delete n[dk];return n;});}} style={{width:20,height:20,borderRadius:5,border:"1.5px solid #3f3f46",background:"#18181b",cursor:"pointer",flexShrink:0}}/>
                        <span style={{fontSize:13,fontWeight:500,color:"#71717a",minWidth:80}}>@{page}</span>
                        <input type="date" value={scheduleDate[dk]?.date||""} onChange={e=>setScheduleDate(p=>({...p,[dk]:{...p[dk],date:e.target.value}}))} style={{padding:"4px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:11,background:"#09090b",color:"#a1a1aa"}}/>
                        <input type="number" value={scheduleDate[dk]?.baseline||""} placeholder="Baseline" onChange={e=>setScheduleDate(p=>({...p,[dk]:{...p[dk],baseline:e.target.value}}))} style={{width:75,padding:"4px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:11,background:"#09090b"}}/>
                      </div>
                    )}
                  </div>);})}
                <div style={{marginTop:8,fontSize:11,color:"#52525b"}}>{pp.length}/{cdPages.length} pages selected</div>
              </div>
            )}
            <button onClick={()=>deleteIdea(cd.id)} style={{...bs,color:"#FF7070",borderColor:"#3f3f46",marginTop:6,fontSize:12}}>Delete idea</button>
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
