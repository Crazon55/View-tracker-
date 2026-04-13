import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  getTrackerNiches, createTrackerNiche, updateTrackerNiche, deleteTrackerNiche,
  getTrackerIdeas, createTrackerIdea, updateTrackerIdea, deleteTrackerIdea,
  createTrackerPosting, updateTrackerPosting, deleteTrackerPosting,
} from "@/services/api";

const STAGES = ["new","approved","base_edit","testing","batch_edit","scale","kill","done"];
const SL: Record<string,string> = { new:"New ideas", approved:"Approved", base_edit:"Base edit", testing:"Testing", batch_edit:"Batch edit", scale:"Scale", kill:"Killed", done:"Done" };
const SC: Record<string,{bg:string;text:string;dot:string}> = {
  new:{ bg:"rgba(74,127,212,0.15)",text:"#7BB0FF",dot:"#4A7FD4" },
  approved:{ bg:"rgba(45,158,95,0.15)",text:"#5AE0A0",dot:"#2D9E5F" },
  base_edit:{ bg:"rgba(123,97,196,0.15)",text:"#B49EFF",dot:"#7B61C4" },
  testing:{ bg:"rgba(212,149,42,0.15)",text:"#F0C060",dot:"#D4952A" },
  batch_edit:{ bg:"rgba(212,118,42,0.15)",text:"#F0A050",dot:"#D4762A" },
  scale:{ bg:"rgba(29,158,117,0.15)",text:"#50E0B0",dot:"#1D9E75" },
  kill:{ bg:"rgba(201,59,59,0.15)",text:"#FF7070",dot:"#C93B3B" },
  done:{ bg:"rgba(138,138,128,0.15)",text:"#a1a1aa",dot:"#8A8A80" },
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
  return {
    ...raw,
    nicheId: raw.niche_id,
    createdAt: raw.created_at ? new Date(raw.created_at).getTime() : Date.now(),
    hook_variations: raw.hook_variations || [],
    music_ref: raw.music_ref || null,
    yt_url: raw.yt_url || null,
    yt_timestamps: raw.yt_timestamps || null,
    comp_link: raw.comp_link || null,
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

function IdeaCard({idea,niches,onClick}: {idea:any;niches:any[];onClick:()=>void}){
  const niche=niches.find((n: any)=>n.id===idea.nicheId);
  const pc=idea.postings?.length||0;
  const bp=idea.postings?.reduce((b: string|null, p: any)=>{const t=gPerf(p.views,p.baselineViews);const o: Record<string,number>={viral:4,topline:3,baseline:2,below:1};return(o[t||""]||0)>(o[b||""]||0)?t:b;},null);
  return(
    <div onClick={onClick} style={{background:"#18181b",borderRadius:10,padding:"11px 13px",marginBottom:5,border:"1px solid #27272a",cursor:"grab",transition:"box-shadow 0.15s"}}
      onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 3px 12px rgba(0,0,0,0.3)")} onMouseLeave={e=>(e.currentTarget.style.boxShadow="none")}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
        <p style={{margin:0,fontSize:13,fontWeight:500,color:"#fff",lineHeight:1.35,flex:1}}>{idea.title}</p>
        {bp&&<PB tag={bp}/>}
      </div>
      <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:idea.source==="competitor"?"#EEEDFE":"#E8F5EE",color:idea.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{idea.source==="competitor"?"Comp":"Orig"}</span>
        {niche&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:"#27272a",color:"#a1a1aa",fontWeight:500}}>{niche.name}</span>}
        {pc>0&&<span style={{fontSize:10,color:"#52525b",fontWeight:500}}>{pc}pg</span>}
      </div>
    </div>
  );
}

function CalendarView({ideas,niches,nicheFilter,pageFilter,onClickIdea,weekStart,setWeekStart}: any){
  const days=getWD(weekStart); const dl=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const ncm=useMemo(()=>{const p=["#4A7FD4","#1D9E75","#D4952A","#534AB7","#D85A30","#D4537E","#639922","#185FA5"];const m: Record<string,string>={};niches.forEach((n: any,i: number)=>{m[n.id]=p[i%p.length];});return m;},[niches]);
  const entries=useMemo(()=>{const r: any[]=[];ideas.forEach((idea: any)=>{(idea.postings||[]).forEach((p: any)=>{if(!p.date)return;if(nicheFilter!=="all"&&idea.nicheId!==nicheFilter)return;if(pageFilter!=="all"&&p.page!==pageFilter)return;r.push({idea,posting:p});});});return r;},[ideas,nicheFilter,pageFilter]);
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
            <div style={{padding:"3px 3px 6px",flex:1,overflow:"auto"}}>{de.map((e: any,idx: number)=>{const perf=gPerf(e.posting.views,e.posting.baselineViews);const nc=ncm[e.idea.nicheId]||"#888";return(
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
      if(nicheFilter!=="all"&&idea.nicheId!==nicheFilter) return;
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
      if(nicheFilter!=="all"&&idea.nicheId!==nicheFilter) return;
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
  const queryClient = useQueryClient();

  // ---- Data fetching via react-query ----
  const { data: rawNiches = [], isLoading: nichesLoading } = useQuery({
    queryKey: ["tracker-niches"],
    queryFn: getTrackerNiches,
  });
  const { data: rawIdeas = [], isLoading: ideasLoading } = useQuery({
    queryKey: ["tracker-ideas"],
    queryFn: getTrackerIdeas,
  });

  const niches = rawNiches as any[];
  const ideas = useMemo(() => (rawIdeas as any[]).map(mapIdea), [rawIdeas]);
  const isLoading = nichesLoading || ideasLoading;

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
    onSuccess: () => { invalidate(); },
    onError: () => toast.error("Failed to update posting"),
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
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [addNicheOpen,setAddNicheOpen]=useState(false);
  const [editNiche,setEditNiche]=useState<any>(null);
  const [newNiche,setNewNiche]=useState({name:"",pages:""});
  const [newIdea,setNewIdea]=useState({title:"",source:"original",nicheId:"",hook_variations:"",music_ref:"",yt_url:"",yt_timestamps:"",comp_link:""});
  const [viewMode,setViewMode]=useState("board");
  const [nicheFilter,setNicheFilter]=useState("all");
  const [pageFilter,setPageFilter]=useState("all");
  const [weekStart,setWeekStart]=useState(getMonday(today()));
  const [scheduleDate,setScheduleDate]=useState<Record<string,any>>({});
  const [dateFrom,setDateFrom]=useState(monthStart());
  const [dateTo,setDateTo]=useState(today());

  const filteredIdeas=nicheFilter==="all"?ideas:ideas.filter(i=>i.nicheId===nicheFilter);
  const allPagesForFilter=nicheFilter==="all"?niches.flatMap(n=>n.pages):(niches.find(n=>n.id===nicheFilter)?.pages||[]);

  // ---- Actions wired to mutations ----
  function addIdeaFn(){
    if(!newIdea.title.trim()||!newIdea.nicheId)return;
    const hookLines = newIdea.hook_variations.split("\n").map(l=>l.trim()).filter(Boolean);
    createIdeaMut.mutate({
      title: newIdea.title.trim(),
      source: newIdea.source,
      niche_id: newIdea.nicheId,
      hook_variations: hookLines.length > 0 ? hookLines : null,
      music_ref: newIdea.music_ref.trim() || null,
      yt_url: newIdea.yt_url.trim() || null,
      yt_timestamps: newIdea.yt_timestamps.trim() || null,
      comp_link: newIdea.source === "competitor" ? (newIdea.comp_link.trim() || null) : null,
      stage: "new",
      created_by: user?.email || null,
    });
    setNewIdea({title:"",source:"original",nicheId:"",hook_variations:"",music_ref:"",yt_url:"",yt_timestamps:"",comp_link:""});
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
  const dn=cd?niches.find(n=>n.id===cd.nicheId):null;

  const sa: Record<string, {label:string;stage:string;style:React.CSSProperties}[]>={
    new:[{label:"Approve",stage:"approved",style:bp},{label:"Reject",stage:"kill",style:{...bs,color:"#C93B3B"}}],
    approved:[{label:"Start base edit",stage:"base_edit",style:bp}],
    base_edit:[{label:"Start testing",stage:"testing",style:bp}],
    testing:[{label:"Move to batch edit",stage:"batch_edit",style:bp},{label:"Kill it",stage:"kill",style:{...bs,color:"#C93B3B"}}],
    batch_edit:[{label:"Scale it",stage:"scale",style:{...bp,background:"#1D9E75"}}],
    scale:[{label:"Mark done",stage:"done",style:bp}],
    kill:[],done:[],
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
          <p style={{fontSize:13,color:"#71717a"}}>Loading content tracker...</p>
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
            <h1 style={{margin:0,fontSize:20,fontWeight:700,letterSpacing:"-0.03em"}}>Content tracker</h1>
            <p style={{margin:"3px 0 0",fontSize:12,color:"#71717a"}}>{ideas.length} ideas · {niches.length} niches · {niches.reduce((a: number,n: any)=>a+n.pages.length,0)} pages</p>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
          <select value={nicheFilter} onChange={e=>{setNicheFilter(e.target.value);setPageFilter("all");}} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#09090b",cursor:"pointer"}}>
            <option value="all">All niches</option>
            {niches.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
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
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
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
          {STAGES.filter(s=>counts[s]>0).map(stage=>(
            <div key={stage} style={{marginBottom:18}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:SC[stage].dot}}/>
                <span style={{fontSize:13,fontWeight:600,color:SC[stage].text}}>{SL[stage]}</span>
                <span style={{fontSize:11,color:"#52525b"}}>{counts[stage]}</span>
              </div>
              {filteredIdeas.filter(i=>i.stage===stage).map(idea=>{const niche=niches.find(n=>n.id===idea.nicheId);return(
                <div key={idea.id} onClick={()=>openDetail(idea)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#18181b",borderRadius:8,marginBottom:3,border:"1px solid #27272a",cursor:"pointer",fontSize:13}}>
                  <span style={{flex:1,fontWeight:500}}>{idea.title}</span>
                  <span style={{fontSize:11,color:"#52525b"}}>{niche?.name}</span>
                  <span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:idea.source==="competitor"?"#EEEDFE":"#E8F5EE",color:idea.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{idea.source==="competitor"?"Comp":"Orig"}</span>
                  {idea.postings?.length>0&&<span style={{fontSize:10,color:"#52525b"}}>{idea.postings.length}pg</span>}
                </div>);})}
            </div>
          ))}
          {filteredIdeas.length===0&&<p style={{textAlign:"center",color:"#52525b",padding:40,fontSize:13}}>No ideas yet.</p>}
        </div>
      )}

      {/* Calendar */}
      {viewMode==="calendar"&&<CalendarView ideas={ideas} niches={niches} nicheFilter={nicheFilter} pageFilter={pageFilter} onClickIdea={openDetail} weekStart={weekStart} setWeekStart={setWeekStart}/>}

      {/* Analytics */}
      {viewMode==="analytics"&&<AnalyticsView ideas={ideas} niches={niches} nicheFilter={nicheFilter} pageFilter={pageFilter} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} setPageFilter={setPageFilter} onClickIdea={openDetail}/>}

      {/* Add Idea */}
      <Modal open={addOpen} onClose={()=>setAddOpen(false)} title="Add new idea">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><label style={ls}>Title / description *</label><input value={newIdea.title} onChange={e=>setNewIdea(p=>({...p,title:e.target.value}))} placeholder="e.g. Morning routine montage with dramatic voiceover" style={is}/></div>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><label style={ls}>Source</label><div style={{display:"flex",gap:6}}>{SOURCES.map(s=><button key={s} onClick={()=>setNewIdea(p=>({...p,source:s}))} style={{flex:1,padding:"8px 10px",borderRadius:8,border:newIdea.source===s?"2px solid #7c3aed":"1.5px solid #3f3f46",background:newIdea.source===s?"#27272a":"#18181b",fontSize:12,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{s}</button>)}</div></div>
            <div style={{flex:1}}><label style={ls}>Niche *</label><select value={newIdea.nicheId} onChange={e=>setNewIdea(p=>({...p,nicheId:e.target.value}))} style={{...is,cursor:"pointer"}}><option value="">Select niche</option>{niches.map(n=><option key={n.id} value={n.id}>{n.name} ({n.pages.length} pages)</option>)}</select></div>
          </div>
          <div><label style={ls}>Hook variations (one per line)</label><textarea value={newIdea.hook_variations} onChange={e=>setNewIdea(p=>({...p,hook_variations:e.target.value}))} rows={4} placeholder={"Hook variation 1\nHook variation 2\nHook variation 3"} style={{...is,resize:"vertical",minHeight:80}}/></div>
          <div><label style={ls}>Music reference / suggestions</label><input value={newIdea.music_ref} onChange={e=>setNewIdea(p=>({...p,music_ref:e.target.value}))} placeholder="e.g. Dark cinematic, trending audio XYZ" style={is}/></div>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><label style={ls}>YT link</label><input value={newIdea.yt_url} onChange={e=>setNewIdea(p=>({...p,yt_url:e.target.value}))} placeholder="https://youtube.com/watch?v=..." style={is}/></div>
            <div style={{flex:"0 0 140px"}}><label style={ls}>YT timestamps</label><input value={newIdea.yt_timestamps} onChange={e=>setNewIdea(p=>({...p,yt_timestamps:e.target.value}))} placeholder="0:30-1:45" style={is}/></div>
          </div>
          {newIdea.source==="competitor"&&(
            <div><label style={ls}>Comp link</label><input value={newIdea.comp_link} onChange={e=>setNewIdea(p=>({...p,comp_link:e.target.value}))} placeholder="Competitor reel / post URL" style={is}/></div>
          )}
          <button onClick={addIdeaFn} disabled={!newIdea.title.trim()||!newIdea.nicheId} style={{...bp,opacity:(!newIdea.title.trim()||!newIdea.nicheId)?0.4:1,marginTop:2}}>Add idea</button>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!cd} onClose={()=>setDetailIdea(null)} title={cd?.title||""} wide>
        {cd&&(()=>{const pp=(cd.postings||[]).map((p: any)=>p.page);return(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:99,background:SC[cd.stage].bg,color:SC[cd.stage].text}}>{SL[cd.stage]}</span>
              <span style={{fontSize:11,padding:"3px 9px",borderRadius:99,background:cd.source==="competitor"?"#EEEDFE":"#E8F5EE",color:cd.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{cd.source==="competitor"?"Competitor":"Original"}</span>
              {dn&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:99,background:"#27272a",color:"#a1a1aa",fontWeight:500}}>{dn.name}</span>}
            </div>
            {sa[cd.stage]?.length>0&&<div style={{display:"flex",gap:6}}>{sa[cd.stage].map(a=><button key={a.stage} onClick={()=>moveIdea(cd.id,a.stage)} style={a.style}>{a.label}</button>)}</div>}

            {/* Editable fields */}
            <div><label style={ls}>Hook variations</label><textarea defaultValue={(cd.hook_variations||[]).join("\n")} key={cd.id+"_hooks"} onBlur={e=>{const lines=e.target.value.split("\n").map((l: string)=>l.trim()).filter(Boolean);updateIdeaMut.mutate({id:cd.id,data:{hook_variations:lines.length>0?lines:null}});}} rows={3} placeholder="One hook per line" style={{...is,resize:"vertical",minHeight:60}}/></div>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}><label style={ls}>Music reference / suggestions</label><input defaultValue={cd.music_ref||""} key={cd.id+"_music"} onBlur={e=>updateIdeaMut.mutate({id:cd.id,data:{music_ref:e.target.value.trim()||null}})} placeholder="e.g. Dark cinematic, trending audio" style={is}/></div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}><label style={ls}>YT link</label><input defaultValue={cd.yt_url||""} key={cd.id+"_yturl"} onBlur={e=>updateIdeaMut.mutate({id:cd.id,data:{yt_url:e.target.value.trim()||null}})} placeholder="https://youtube.com/watch?v=..." style={is}/></div>
              <div style={{flex:"0 0 140px"}}><label style={ls}>YT timestamps</label><input defaultValue={cd.yt_timestamps||""} key={cd.id+"_ytts"} onBlur={e=>updateIdeaMut.mutate({id:cd.id,data:{yt_timestamps:e.target.value.trim()||null}})} placeholder="0:30-1:45" style={is}/></div>
            </div>
            {cd.source==="competitor"&&(
              <div><label style={ls}>Comp link</label><input defaultValue={cd.comp_link||""} key={cd.id+"_comp"} onBlur={e=>updateIdeaMut.mutate({id:cd.id,data:{comp_link:e.target.value.trim()||null}})} placeholder="Competitor reel / post URL" style={is}/></div>
            )}
            {cd.yt_url&&<a href={cd.yt_url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#4A7FD4",wordBreak:"break-all"}}>{cd.yt_url}</a>}

            {/* Page checklist */}
            {["testing","scale","done"].includes(cd.stage)&&dn&&(
              <div>
                <label style={{...ls,marginBottom:8}}>Pages in {dn.name} — pick date & schedule</label>
                {dn.pages.map((page: string)=>{const isP=pp.includes(page);const pi=(cd.postings||[]).findIndex((p: any)=>p.page===page);const po=pi>=0?cd.postings[pi]:null;const perf=po?gPerf(po.views,po.baselineViews):null;const dk=`${cd.id}_${page}`;return(
                  <div key={page} style={{padding:"10px 12px",background:isP?"#1a1a2e":"#18181b",borderRadius:8,marginBottom:4,border:isP?"1.5px solid #3f3f46":"1px solid #27272a"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    {isP?(
                      <>
                        <div onClick={()=>togglePage(cd.id,page,0,"")} style={{width:20,height:20,borderRadius:5,background:"#1a1a1a",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                        <span style={{fontSize:13,fontWeight:600,color:"#fff",minWidth:100}}>{page}</span>
                        <span style={{fontSize:11,color:"#52525b",whiteSpace:"nowrap"}}>{fmtD(po.date)}</span>
                        <div style={{display:"flex",alignItems:"center",gap:5,flex:1,minWidth:130}}>
                          <input type="number" value={po.views??""} placeholder="Views" onClick={e=>e.stopPropagation()} onChange={e=>updateViews(cd.id,pi,e.target.value)} style={{width:80,padding:"5px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:12,background:"#18181b"}}/>
                          <span style={{fontSize:10,color:"#52525b"}}>/ {(po.baselineViews||0).toLocaleString()}</span>
                        </div>
                        {perf&&<PB tag={perf}/>}
                      </>
                    ):(
                      <>
                        <div style={{width:20,height:20,borderRadius:5,border:"1.5px solid #d0cec6",background:"#18181b",flexShrink:0}}/>
                        <span style={{fontSize:13,fontWeight:500,color:"#71717a",minWidth:100}}>{page}</span>
                        <input type="date" value={scheduleDate[dk]?.date||""} onChange={e=>setScheduleDate(p=>({...p,[dk]:{...p[dk],date:e.target.value}}))} style={{padding:"4px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:11,background:"#18181b",color:"#a1a1aa"}}/>
                        <input type="number" value={scheduleDate[dk]?.baseline||""} placeholder="Baseline" onChange={e=>setScheduleDate(p=>({...p,[dk]:{...p[dk],baseline:e.target.value}}))} style={{width:75,padding:"4px 8px",borderRadius:7,border:"1.5px solid #3f3f46",fontSize:11,background:"#18181b"}}/>
                        <button onClick={()=>{const sd=scheduleDate[dk];if(!sd?.date)return;togglePage(cd.id,page,sd?.baseline||0,sd.date);setScheduleDate(p=>{const n={...p};delete n[dk];return n;});}} disabled={!scheduleDate[dk]?.date} style={{padding:"4px 12px",borderRadius:7,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:scheduleDate[dk]?.date?"#7c3aed":"#3f3f46",color:scheduleDate[dk]?.date?"#fff":"#52525b"}}>Schedule</button>
                      </>
                    )}
                    </div>
                    {/* Performance tag selector for assigned pages */}
                    {isP&&po&&(
                      <div style={{display:"flex",gap:4,marginTop:8,marginLeft:30}}>
                        {(["below","baseline","topline","viral"] as const).map(tag=>{const t=PT[tag];const active=po.perf_tag===tag;return(
                          <button key={tag} onClick={()=>updatePostingMut.mutate({id:po.id,data:{perf_tag:tag}})} style={{padding:"3px 10px",borderRadius:6,border:active?`2px solid ${t.color}`:"1.5px solid #3f3f46",background:active?t.bg:"transparent",color:active?t.color:"#71717a",fontSize:10,fontWeight:600,cursor:"pointer",transition:"all 0.15s"}}>{t.label}</button>
                        );})}
                      </div>
                    )}
                  </div>);})}
                <div style={{marginTop:8,fontSize:11,color:"#52525b"}}>{pp.length}/{dn.pages.length} pages assigned</div>
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
