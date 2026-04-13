import { useState, useMemo } from "react";

const STAGES = ["new","approved","base_edit","testing","batch_edit","scale","kill","done"];
const SL: Record<string,string> = { new:"New ideas", approved:"Approved", base_edit:"Base edit", testing:"Testing", batch_edit:"Batch edit", scale:"Scale", kill:"Killed", done:"Done" };
const SC: Record<string,{bg:string;text:string;dot:string}> = {
  new:{ bg:"#EAF0FA",text:"#2B4A7F",dot:"#4A7FD4" },
  approved:{ bg:"#E8F5EE",text:"#1A5E3A",dot:"#2D9E5F" },
  base_edit:{ bg:"#F3EEFA",text:"#4A3A8A",dot:"#7B61C4" },
  testing:{ bg:"#FFF4E0",text:"#7A5A1A",dot:"#D4952A" },
  batch_edit:{ bg:"#FFF0E6",text:"#8A4A1A",dot:"#D4762A" },
  scale:{ bg:"#E1F5EE",text:"#0F6E56",dot:"#1D9E75" },
  kill:{ bg:"#FCE8E8",text:"#7A1F1F",dot:"#C93B3B" },
  done:{ bg:"#F0EFE8",text:"#4A4A44",dot:"#8A8A80" },
};
const PT: Record<string,{label:string;color:string;bg:string}> = {
  below:{ label:"Below",color:"#C93B3B",bg:"#FCE8E8" },
  baseline:{ label:"Baseline",color:"#7A5A1A",bg:"#FFF4E0" },
  topline:{ label:"Topline",color:"#1D9E75",bg:"#E1F5EE" },
  viral:{ label:"Viral",color:"#534AB7",bg:"#EEEDFE" },
};
const SOURCES = ["original","competitor"];
const DEFAULT_NICHES = [
  { id:"n1", name:"Motivation", pages:["@motivate.daily","@grindset.hub","@mindset.wins","@rise.repeat","@boss.quotes"] },
  { id:"n2", name:"Finance", pages:["@cash.plays","@money.brain","@invest.101","@wealth.path"] },
  { id:"n3", name:"Fitness", pages:["@gym.clips","@fitlife.co","@gains.daily"] },
];

const gid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const today = () => new Date().toISOString().slice(0,10);
const fmtD = (d: string) => { const dt=new Date(d+"T00:00:00"); return dt.toLocaleDateString("en-US",{month:"short",day:"numeric"}); };
const fmtDFull = (d: string) => { const dt=new Date(d+"T00:00:00"); return dt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); };
const fmtNum = (n: number) => { if(n>=1000000) return (n/1000000).toFixed(1)+"M"; if(n>=1000) return (n/1000).toFixed(1)+"k"; return n.toString(); };
const gPerf = (v: number|null, b: number|null) => { if(!v||!b) return null; const r=v/b; if(r>=20) return "viral"; if(r>=5) return "topline"; if(r>=0.8) return "baseline"; return "below"; };
const getMonday = (d: string) => { const dt=new Date(d+"T00:00:00"); const day=dt.getDay(); dt.setDate(dt.getDate()-day+(day===0?-6:1)); return dt.toISOString().slice(0,10); };
const addD = (s: string, n: number) => { const d=new Date(s+"T00:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const getWD = (m: string) => Array.from({length:7},(_,i)=>addD(m,i));
const monthStart = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10); };

function PB({tag}: {tag: string|null}){ if(!tag||!PT[tag]) return null; const t=PT[tag]; return <span style={{display:"inline-block",fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:99,background:t.bg,color:t.color}}>{t.label}</span>; }

function Modal({open,onClose,title,children,wide}: {open:boolean;onClose:()=>void;title:string;children:React.ReactNode;wide?:boolean}){
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.35)",backdropFilter:"blur(4px)"}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:"relative",background:"#fff",borderRadius:16,padding:"24px 28px",maxWidth:wide?720:520,width:"94%",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:600,color:"#1a1a1a",letterSpacing:"-0.02em"}}>{title}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#999",padding:"4px 8px",borderRadius:6}}>✕</button>
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
    <div onClick={onClick} style={{background:"#fff",borderRadius:10,padding:"11px 13px",marginBottom:5,border:"1px solid #e8e6e0",cursor:"pointer",transition:"box-shadow 0.15s"}}
      onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 3px 12px rgba(0,0,0,0.07)")} onMouseLeave={e=>(e.currentTarget.style.boxShadow="none")}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
        <p style={{margin:0,fontSize:13,fontWeight:500,color:"#1a1a1a",lineHeight:1.35,flex:1}}>{idea.title}</p>
        {bp&&<PB tag={bp}/>}
      </div>
      <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:idea.source==="competitor"?"#EEEDFE":"#E8F5EE",color:idea.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{idea.source==="competitor"?"Comp":"Orig"}</span>
        {niche&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:"#f5f4f0",color:"#666",fontWeight:500}}>{niche.name}</span>}
        {pc>0&&<span style={{fontSize:10,color:"#bbb",fontWeight:500}}>{pc}pg</span>}
      </div>
    </div>
  );
}

function CalendarView({ideas,niches,nicheFilter,pageFilter,onClickIdea,weekStart,setWeekStart}: any){
  const days=getWD(weekStart); const dl=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const ncm=useMemo(()=>{const p=["#4A7FD4","#1D9E75","#D4952A","#534AB7","#D85A30","#D4537E","#639922","#185FA5"];const m: Record<string,string>={};niches.forEach((n: any,i: number)=>{m[n.id]=p[i%p.length];});return m;},[niches]);
  const entries=useMemo(()=>{const r: any[]=[];ideas.forEach((idea: any)=>{(idea.postings||[]).forEach((p: any)=>{if(!p.date)return;if(nicheFilter!=="all"&&idea.nicheId!==nicheFilter)return;if(pageFilter!=="all"&&p.page!==pageFilter)return;r.push({idea,posting:p});});});return r;},[ideas,nicheFilter,pageFilter]);
  return(
    <div style={{padding:"16px 20px 24px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button onClick={()=>setWeekStart(addD(weekStart,-7))} style={{background:"none",border:"1px solid #e0ded6",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:12,fontWeight:500}}>←</button>
        <button onClick={()=>setWeekStart(getMonday(today()))} style={{background:"none",border:"1px solid #e0ded6",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:12,fontWeight:500}}>Today</button>
        <button onClick={()=>setWeekStart(addD(weekStart,7))} style={{background:"none",border:"1px solid #e0ded6",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:12,fontWeight:500}}>→</button>
        <span style={{fontSize:13,fontWeight:600,color:"#1a1a1a",marginLeft:6}}>{fmtD(days[0])} – {fmtD(days[6])}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,background:"#e8e6e0",borderRadius:12,overflow:"hidden",border:"1px solid #e8e6e0"}}>
        {days.map((day: string,i: number)=>{const isT=day===today();const de=entries.filter((e: any)=>e.posting.date===day);return(
          <div key={day} style={{background:isT?"#fffdf5":"#fff",minHeight:120,display:"flex",flexDirection:"column"}}>
            <div style={{padding:"6px 6px 3px",borderBottom:"1px solid #f0efe8"}}><span style={{fontSize:10,fontWeight:600,color:isT?"#D4952A":"#999"}}>{dl[i]}</span><span style={{fontSize:12,fontWeight:isT?700:500,color:isT?"#1a1a1a":"#666",marginLeft:5}}>{new Date(day+"T00:00:00").getDate()}</span></div>
            <div style={{padding:"3px 3px 6px",flex:1,overflow:"auto"}}>{de.map((e: any,idx: number)=>{const perf=gPerf(e.posting.views,e.posting.baselineViews);const nc=ncm[e.idea.nicheId]||"#888";return(
              <div key={idx} onClick={()=>onClickIdea(e.idea)} style={{padding:"4px 6px",marginBottom:2,borderRadius:5,fontSize:10,background:`${nc}11`,borderLeft:`3px solid ${nc}`,cursor:"pointer"}}>
                <div style={{fontWeight:600,color:"#1a1a1a",lineHeight:1.3,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.idea.title}</div>
                <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap"}}><span style={{color:"#888",fontWeight:500}}>{e.posting.page}</span>{e.posting.views&&<span style={{color:"#bbb"}}>· {fmtNum(e.posting.views)}</span>}{perf&&<PB tag={perf}/>}</div>
              </div>);})}</div>
          </div>);})}
      </div>
      <div style={{display:"flex",gap:12,marginTop:10,flexWrap:"wrap"}}>{niches.filter((n: any)=>nicheFilter==="all"||n.id===nicheFilter).map((n: any)=><div key={n.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#888"}}><span style={{width:10,height:10,borderRadius:3,background:ncm[n.id]}}/>{n.name}</div>)}</div>
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

  const cardS={background:"#fff",borderRadius:12,padding:"16px 18px",border:"1px solid #e8e6e0"};

  return(
    <div style={{padding:"16px 20px 24px",maxWidth:900}}>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.04em"}}>Period</span>
        <input type="date" value={dateFrom} onChange={(e: any)=>setDateFrom(e.target.value)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #e0ded6",fontSize:12,background:"#fafaf8"}}/>
        <span style={{fontSize:12,color:"#ccc"}}>to</span>
        <input type="date" value={dateTo} onChange={(e: any)=>setDateTo(e.target.value)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #e0ded6",fontSize:12,background:"#fafaf8"}}/>
        {pageFilter!=="all"&&<span style={{fontSize:12,fontWeight:600,color:"#4A7FD4",padding:"4px 10px",background:"#EAF0FA",borderRadius:99}}>{pageFilter}</span>}
        <select value={pageFilter} onChange={(e: any)=>setPageFilter(e.target.value)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #e0ded6",fontSize:12,background:"#fafaf8",cursor:"pointer",marginLeft:"auto"}}>
          <option value="all">All pages</option>
          {allPagesForFilter.map((p: string)=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:18}}>
        <div style={cardS}><div style={{fontSize:11,color:"#999",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Total views</div><div style={{fontSize:24,fontWeight:700,letterSpacing:"-0.03em"}}>{fmtNum(data.totalViews)}</div></div>
        <div style={cardS}><div style={{fontSize:11,color:"#999",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Posts tracked</div><div style={{fontSize:24,fontWeight:700,letterSpacing:"-0.03em"}}>{data.totalPosts}</div></div>
        <div style={cardS}><div style={{fontSize:11,color:"#999",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Avg views/post</div><div style={{fontSize:24,fontWeight:700,letterSpacing:"-0.03em"}}>{data.totalPosts?fmtNum(Math.round(data.totalViews/data.totalPosts)):"-"}</div></div>
        <div style={cardS}>
          <div style={{fontSize:11,color:"#999",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:6}}>Performance</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {(["viral","topline","baseline","below"] as const).map(k=>data.perfCounts[k]>0&&<span key={k} style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:99,background:PT[k].bg,color:PT[k].color}}>{data.perfCounts[k]} {PT[k].label}</span>)}
          </div>
        </div>
      </div>

      {data.dailySorted.length>0&&(
        <div style={{...cardS,marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:600,color:"#1a1a1a",marginBottom:12}}>Daily views</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:2,height:100}}>
            {data.dailySorted.map(([date,views]: [string,number])=>(
              <div key={date} title={`${fmtDFull(date)}: ${fmtNum(views)}`} style={{flex:1,minWidth:4,maxWidth:28,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{width:"100%",background:"linear-gradient(180deg,#4A7FD4,#6B9BE0)",borderRadius:"3px 3px 0 0",height:`${Math.max((views/maxDaily)*80,2)}px`,transition:"height 0.2s"}}/>
                <span style={{fontSize:8,color:"#ccc",whiteSpace:"nowrap",transform:"rotate(-45deg)",transformOrigin:"top left",marginTop:2}}>{new Date(date+"T00:00:00").getDate()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{...cardS,marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:600,color:"#1a1a1a",marginBottom:10}}>Views by page</div>
        {data.pages.length===0&&<p style={{fontSize:12,color:"#ccc",margin:0}}>No view data in this range.</p>}
        {data.pages.map((p: any)=>{
          const pct=data.totalViews?(p.views/data.totalViews*100):0;
          return(
            <div key={p.page} onClick={()=>setPageFilter(p.page===pageFilter?"all":p.page)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f5f4f0",cursor:"pointer"}}>
              <span style={{fontSize:13,fontWeight:600,color:"#1a1a1a",minWidth:120}}>{p.page}</span>
              <div style={{flex:1,background:"#f5f4f0",borderRadius:4,height:14,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:4,background:pageFilter===p.page?"#4A7FD4":"#c8c6be",width:`${pct}%`,transition:"width 0.3s"}}/>
              </div>
              <span style={{fontSize:12,fontWeight:600,color:"#1a1a1a",minWidth:60,textAlign:"right"}}>{fmtNum(p.views)}</span>
              <span style={{fontSize:10,color:"#bbb",minWidth:30}}>{p.posts}p</span>
              {p.best&&<PB tag={p.best}/>}
            </div>
          );
        })}
      </div>

      {topIdeas.length>0&&(
        <div style={cardS}>
          <div style={{fontSize:12,fontWeight:600,color:"#1a1a1a",marginBottom:10}}>Top ideas</div>
          {topIdeas.map((t: any,i: number)=>(
            <div key={t.idea.id} onClick={()=>onClickIdea(t.idea)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f5f4f0",cursor:"pointer"}}>
              <span style={{fontSize:11,fontWeight:700,color:"#ccc",minWidth:20}}>{i+1}</span>
              <span style={{flex:1,fontSize:13,fontWeight:500,color:"#1a1a1a"}}>{t.idea.title}</span>
              <span style={{fontSize:12,fontWeight:600,color:"#1a1a1a"}}>{fmtNum(t.totalViews)}</span>
              {t.bestPerf&&<PB tag={t.bestPerf}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContentTracker(){
  const [niches,setNiches]=useState(DEFAULT_NICHES);
  const [ideas,setIdeas]=useState<any[]>([]);
  const [addOpen,setAddOpen]=useState(false);
  const [detailIdea,setDetailIdea]=useState<any>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [addNicheOpen,setAddNicheOpen]=useState(false);
  const [editNiche,setEditNiche]=useState<any>(null);
  const [newNiche,setNewNiche]=useState({name:"",pages:""});
  const [newIdea,setNewIdea]=useState({title:"",source:"original",nicheId:"",link:"",notes:""});
  const [viewMode,setViewMode]=useState("board");
  const [nicheFilter,setNicheFilter]=useState("all");
  const [pageFilter,setPageFilter]=useState("all");
  const [weekStart,setWeekStart]=useState(getMonday(today()));
  const [scheduleDate,setScheduleDate]=useState<Record<string,any>>({});
  const [dateFrom,setDateFrom]=useState(monthStart());
  const [dateTo,setDateTo]=useState(today());

  const filteredIdeas=nicheFilter==="all"?ideas:ideas.filter(i=>i.nicheId===nicheFilter);
  const allPagesForFilter=nicheFilter==="all"?niches.flatMap(n=>n.pages):(niches.find(n=>n.id===nicheFilter)?.pages||[]);

  function addIdeaFn(){if(!newIdea.title.trim()||!newIdea.nicheId)return;setIdeas(p=>[...p,{...newIdea,id:gid(),stage:"new",postings:[],createdAt:Date.now()}]);setNewIdea({title:"",source:"original",nicheId:"",link:"",notes:""});setAddOpen(false);}
  function moveIdea(id: string, ns: string){setIdeas(p=>p.map(i=>i.id===id?{...i,stage:ns}:i));}
  function deleteIdea(id: string){setIdeas(p=>p.filter(i=>i.id!==id));setDetailIdea(null);}

  function togglePage(iid: string, page: string, bv: any, date: string){
    setIdeas(p=>p.map(i=>{if(i.id!==iid)return i;const ex=(i.postings||[]).findIndex((pp: any)=>pp.page===page);if(ex>=0)return{...i,postings:i.postings.filter((_: any,idx: number)=>idx!==ex)};return{...i,postings:[...(i.postings||[]),{page,baselineViews:Number(bv)||0,views:null,date:date||today()}]};}));
  }
  function updateViews(iid: string, pi: number, v: string){setIdeas(p=>p.map(i=>{if(i.id!==iid)return i;const ps=[...i.postings];ps[pi]={...ps[pi],views:Number(v)||null};return{...i,postings:ps};}));}

  function addNiche(){if(!newNiche.name.trim())return;const pages=newNiche.pages.split(",").map(p=>p.trim()).filter(Boolean);setNiches(p=>[...p,{id:gid(),name:newNiche.name.trim(),pages}]);setNewNiche({name:"",pages:""});setAddNicheOpen(false);}
  function deleteNiche(id: string){setNiches(p=>p.filter(n=>n.id!==id));setIdeas(p=>p.filter(i=>i.nicheId!==id));}
  function saveEditNiche(){if(!editNiche||!editNiche.name.trim())return;const pages=editNiche.pagesStr.split(",").map((p: string)=>p.trim()).filter(Boolean);setNiches(p=>p.map(n=>n.id===editNiche.id?{...n,name:editNiche.name.trim(),pages}:n));setEditNiche(null);}

  const is: React.CSSProperties={width:"100%",padding:"9px 13px",border:"1.5px solid #e0ded6",borderRadius:9,fontSize:13,outline:"none",background:"#fafaf8",boxSizing:"border-box"};
  const ls: React.CSSProperties={display:"block",fontSize:11,fontWeight:600,color:"#999",marginBottom:4,letterSpacing:"0.04em",textTransform:"uppercase"};
  const bp: React.CSSProperties={padding:"9px 20px",background:"#1a1a1a",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"};
  const bs: React.CSSProperties={padding:"9px 20px",background:"#f0efe8",color:"#1a1a1a",border:"1px solid #e0ded6",borderRadius:9,fontSize:13,fontWeight:500,cursor:"pointer"};

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

  return(
    <div style={{fontFamily:"'DM Sans','Helvetica Neue',sans-serif",minHeight:"100vh",background:"#f7f6f3",color:"#1a1a1a"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{padding:"16px 20px 12px",borderBottom:"1px solid #e8e6e0",background:"#fff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:700,letterSpacing:"-0.03em"}}>Content tracker</h1>
            <p style={{margin:"3px 0 0",fontSize:12,color:"#999"}}>{ideas.length} ideas · {niches.length} niches · {niches.reduce((a,n)=>a+n.pages.length,0)} pages</p>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={()=>setSettingsOpen(true)} style={bs}>Niches</button>
            <button onClick={()=>setAddOpen(true)} style={bp}>+ New idea</button>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
          <select value={nicheFilter} onChange={e=>{setNicheFilter(e.target.value);setPageFilter("all");}} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #e0ded6",fontSize:12,background:"#fafaf8",cursor:"pointer"}}>
            <option value="all">All niches</option>
            {niches.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          {(viewMode==="calendar"||viewMode==="analytics")&&(
            <select value={pageFilter} onChange={e=>setPageFilter(e.target.value)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid #e0ded6",fontSize:12,background:"#fafaf8",cursor:"pointer"}}>
              <option value="all">All pages</option>
              {allPagesForFilter.map((p: string)=><option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <div style={{display:"flex",background:"#f0efe8",borderRadius:7,overflow:"hidden",border:"1px solid #e0ded6"}}>
            {["board","list","calendar","analytics"].map(v=>(
              <button key={v} onClick={()=>setViewMode(v)} style={{padding:"5px 12px",border:"none",fontSize:12,fontWeight:500,cursor:"pointer",background:viewMode===v?"#fff":"transparent",color:viewMode===v?"#1a1a1a":"#999",boxShadow:viewMode===v?"0 1px 3px rgba(0,0,0,0.06)":"none",textTransform:"capitalize"}}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Board */}
      {viewMode==="board"&&(
        <div style={{display:"flex",gap:8,padding:"12px 10px 24px",overflowX:"auto",minHeight:"calc(100vh - 130px)"}}>
          {STAGES.map(stage=>(
            <div key={stage} style={{minWidth:200,maxWidth:240,flex:"1 0 200px"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 4px 8px"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:SC[stage].dot}}/>
                <span style={{fontSize:11,fontWeight:600,color:SC[stage].text}}>{SL[stage]}</span>
                <span style={{fontSize:10,color:"#ccc",fontWeight:500}}>{counts[stage]}</span>
              </div>
              <div style={{minHeight:50,padding:1}}>
                {filteredIdeas.filter(i=>i.stage===stage).sort((a,b)=>b.createdAt-a.createdAt).map(idea=>(
                  <IdeaCard key={idea.id} idea={idea} niches={niches} onClick={()=>openDetail(idea)}/>
                ))}
                {counts[stage]===0&&<div style={{padding:"24px 12px",textAlign:"center",color:"#ddd",fontSize:11,border:"1.5px dashed #e8e6e0",borderRadius:9}}>Empty</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {viewMode==="list"&&(
        <div style={{padding:"14px 20px",maxWidth:860}}>
          {STAGES.filter(s=>counts[s]>0).map(stage=>(
            <div key={stage} style={{marginBottom:18}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:SC[stage].dot}}/>
                <span style={{fontSize:13,fontWeight:600,color:SC[stage].text}}>{SL[stage]}</span>
                <span style={{fontSize:11,color:"#ccc"}}>{counts[stage]}</span>
              </div>
              {filteredIdeas.filter(i=>i.stage===stage).map(idea=>{const niche=niches.find(n=>n.id===idea.nicheId);return(
                <div key={idea.id} onClick={()=>openDetail(idea)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#fff",borderRadius:8,marginBottom:3,border:"1px solid #e8e6e0",cursor:"pointer",fontSize:13}}>
                  <span style={{flex:1,fontWeight:500}}>{idea.title}</span>
                  <span style={{fontSize:11,color:"#aaa"}}>{niche?.name}</span>
                  <span style={{fontSize:10,padding:"1px 7px",borderRadius:99,background:idea.source==="competitor"?"#EEEDFE":"#E8F5EE",color:idea.source==="competitor"?"#534AB7":"#1A5E3A",fontWeight:500}}>{idea.source==="competitor"?"Comp":"Orig"}</span>
                  {idea.postings?.length>0&&<span style={{fontSize:10,color:"#bbb"}}>{idea.postings.length}pg</span>}
                </div>);})}
            </div>
          ))}
          {filteredIdeas.length===0&&<p style={{textAlign:"center",color:"#ccc",padding:40,fontSize:13}}>No ideas yet.</p>}
        </div>
      )}

      {/* Calendar */}
      {viewMode==="calendar"&&<CalendarView ideas={ideas} niches={niches} nicheFilter={nicheFilter} pageFilter={pageFilter} onClickIdea={openDetail} weekStart={weekStart} setWeekStart={setWeekStart}/>}

      {/* Analytics */}
      {viewMode==="analytics"&&<AnalyticsView ideas={ideas} niches={niches} nicheFilter={nicheFilter} pageFilter={pageFilter} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} setPageFilter={setPageFilter} onClickIdea={openDetail}/>}

      {/* Add Idea */}
      <Modal open={addOpen} onClose={()=>setAddOpen(false)} title="Add new idea">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><label style={ls}>Idea title / description</label><input value={newIdea.title} onChange={e=>setNewIdea(p=>({...p,title:e.target.value}))} placeholder="e.g. Morning routine montage with dramatic voiceover" style={is}/></div>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><label style={ls}>Source</label><div style={{display:"flex",gap:6}}>{SOURCES.map(s=><button key={s} onClick={()=>setNewIdea(p=>({...p,source:s}))} style={{flex:1,padding:"8px 10px",borderRadius:8,border:newIdea.source===s?"2px solid #1a1a1a":"1.5px solid #e0ded6",background:newIdea.source===s?"#f5f4f0":"#fff",fontSize:12,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{s}</button>)}</div></div>
            <div style={{flex:1}}><label style={ls}>Niche</label><select value={newIdea.nicheId} onChange={e=>setNewIdea(p=>({...p,nicheId:e.target.value}))} style={{...is,cursor:"pointer"}}><option value="">Select niche</option>{niches.map(n=><option key={n.id} value={n.id}>{n.name} ({n.pages.length} pages)</option>)}</select></div>
          </div>
          <div><label style={ls}>Reference link (optional)</label><input value={newIdea.link} onChange={e=>setNewIdea(p=>({...p,link:e.target.value}))} placeholder="Instagram reel URL" style={is}/></div>
          <div><label style={ls}>Notes (optional)</label><textarea value={newIdea.notes} onChange={e=>setNewIdea(p=>({...p,notes:e.target.value}))} rows={2} placeholder="Any context..." style={{...is,resize:"vertical"}}/></div>
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
              {dn&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:99,background:"#f5f4f0",color:"#666",fontWeight:500}}>{dn.name}</span>}
            </div>
            {cd.link&&<a href={cd.link} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#4A7FD4",wordBreak:"break-all"}}>{cd.link}</a>}
            {cd.notes&&<p style={{fontSize:12,color:"#888",margin:0,lineHeight:1.4}}>{cd.notes}</p>}
            {sa[cd.stage]?.length>0&&<div style={{display:"flex",gap:6}}>{sa[cd.stage].map(a=><button key={a.stage} onClick={()=>moveIdea(cd.id,a.stage)} style={a.style}>{a.label}</button>)}</div>}

            {/* Page checklist */}
            {["testing","scale","done"].includes(cd.stage)&&dn&&(
              <div>
                <label style={{...ls,marginBottom:8}}>Pages in {dn.name} — pick date & schedule</label>
                {dn.pages.map((page: string)=>{const isP=pp.includes(page);const pi=(cd.postings||[]).findIndex((p: any)=>p.page===page);const po=pi>=0?cd.postings[pi]:null;const perf=po?gPerf(po.views,po.baselineViews):null;const dk=`${cd.id}_${page}`;return(
                  <div key={page} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:isP?"#fafaf8":"#fff",borderRadius:8,marginBottom:4,border:isP?"1.5px solid #d8d6ce":"1px solid #eee",flexWrap:"wrap"}}>
                    {isP?(
                      <>
                        <div onClick={()=>togglePage(cd.id,page,0,"")} style={{width:20,height:20,borderRadius:5,background:"#1a1a1a",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                        <span style={{fontSize:13,fontWeight:600,color:"#1a1a1a",minWidth:100}}>{page}</span>
                        <span style={{fontSize:11,color:"#aaa",whiteSpace:"nowrap"}}>{fmtD(po.date)}</span>
                        <div style={{display:"flex",alignItems:"center",gap:5,flex:1,minWidth:130}}>
                          <input type="number" value={po.views??""} placeholder="Views" onClick={e=>e.stopPropagation()} onChange={e=>updateViews(cd.id,pi,e.target.value)} style={{width:80,padding:"5px 8px",borderRadius:7,border:"1.5px solid #e0ded6",fontSize:12,background:"#fff"}}/>
                          <span style={{fontSize:10,color:"#ccc"}}>/ {(po.baselineViews||0).toLocaleString()}</span>
                        </div>
                        {perf&&<PB tag={perf}/>}
                      </>
                    ):(
                      <>
                        <div style={{width:20,height:20,borderRadius:5,border:"1.5px solid #d0cec6",background:"#fff",flexShrink:0}}/>
                        <span style={{fontSize:13,fontWeight:500,color:"#888",minWidth:100}}>{page}</span>
                        <input type="date" value={scheduleDate[dk]?.date||""} onChange={e=>setScheduleDate(p=>({...p,[dk]:{...p[dk],date:e.target.value}}))} style={{padding:"4px 8px",borderRadius:7,border:"1.5px solid #e0ded6",fontSize:11,background:"#fff",color:"#666"}}/>
                        <input type="number" value={scheduleDate[dk]?.baseline||""} placeholder="Baseline" onChange={e=>setScheduleDate(p=>({...p,[dk]:{...p[dk],baseline:e.target.value}}))} style={{width:75,padding:"4px 8px",borderRadius:7,border:"1.5px solid #e0ded6",fontSize:11,background:"#fff"}}/>
                        <button onClick={()=>{const sd=scheduleDate[dk];if(!sd?.date)return;togglePage(cd.id,page,sd?.baseline||0,sd.date);setScheduleDate(p=>{const n={...p};delete n[dk];return n;});}} disabled={!scheduleDate[dk]?.date} style={{padding:"4px 12px",borderRadius:7,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:scheduleDate[dk]?.date?"#1a1a1a":"#e0ded6",color:scheduleDate[dk]?.date?"#fff":"#aaa"}}>Schedule</button>
                      </>
                    )}
                  </div>);})}
                <div style={{marginTop:8,fontSize:11,color:"#bbb"}}>{pp.length}/{dn.pages.length} pages assigned</div>
              </div>
            )}
            <button onClick={()=>deleteIdea(cd.id)} style={{...bs,color:"#C93B3B",borderColor:"#f0d0d0",marginTop:6,fontSize:12}}>Delete idea</button>
          </div>);})()}
      </Modal>

      {/* Manage Niches */}
      <Modal open={settingsOpen} onClose={()=>setSettingsOpen(false)} title="Manage niches">
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {niches.map(n=>(
            <div key={n.id} style={{padding:"10px 12px",background:"#fafaf8",borderRadius:9,border:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:600}}>{n.name}</span>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setEditNiche({id:n.id,name:n.name,pagesStr:n.pages.join(", ")})} style={{background:"none",border:"none",fontSize:11,color:"#4A7FD4",cursor:"pointer",fontWeight:500}}>Edit</button>
                  <button onClick={()=>deleteNiche(n.id)} style={{background:"none",border:"none",fontSize:11,color:"#C93B3B",cursor:"pointer",fontWeight:500}}>Remove</button>
                </div>
              </div>
              <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>
                {n.pages.map((p: string)=><span key={p} style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:"#e8e6e0",color:"#666"}}>{p}</span>)}
              </div>
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
