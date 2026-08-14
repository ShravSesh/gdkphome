import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import { setupNotifications, notifyCompletion, getNotificationStatus } from "./notifications.js";

const FREQ=[
  {v:"daily",l:"Daily",d:1},{v:"twice_weekly",l:"2x/week",d:3},
  {v:"weekly",l:"Weekly",d:7},{v:"biweekly",l:"Every 2 weeks",d:14},
  {v:"monthly",l:"Monthly",d:30},{v:"quarterly",l:"Quarterly",d:90},
];
const PRIS=["high","medium","low"];
const SLOTS=[10,15,20,30,45,60];
const DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CAT={
  home:{label:"Home",icon:"\u{1F3E0}",
    grad:"linear-gradient(135deg,#06B6D4,#0D9488)",accent:"#0D9488",hdr:"#0F766E",light:"#CCFBF1",
    cards:["linear-gradient(135deg,#22D3EE,#14B8A6)","linear-gradient(135deg,#2DD4BF,#059669)"]},
  admin:{label:"Life Admin",icon:"\u{1F4CB}",
    grad:"linear-gradient(135deg,#F97316,#E11D48)",accent:"#EA580C",hdr:"#C2410C",light:"#FFF7ED",
    cards:["linear-gradient(135deg,#FB923C,#F43F5E)","linear-gradient(135deg,#FBBF24,#F97316)"]},
  personal:{label:"Projects",icon:"\u{1F680}",
    grad:"linear-gradient(135deg,#8B5CF6,#7C3AED)",accent:"#7C3AED",hdr:"#6D28D9",light:"#F5F3FF",
    cards:["linear-gradient(135deg,#A78BFA,#7C3AED)","linear-gradient(135deg,#C084FC,#9333EA)"]},
};
const PRI_C={high:{b:"#EF4444",p:"bg-red-100 text-red-700"},medium:{b:"#F59E0B",p:"bg-amber-100 text-amber-700"},low:{b:"#3B82F6",p:"bg-blue-100 text-blue-600"}};

function getStat(t){
  if(!t.last_completed)return{s:"due",l:"Not done yet",u:100};
  const e=Math.floor((Date.now()-new Date(t.last_completed))/864e5),r=t.frequency_days-e;
  if(r<=0)return{s:"overdue",l:`${Math.abs(r)}d overdue`,u:200+Math.abs(r)};
  if(r<=Math.max(1,t.frequency_days*.25))return{s:"soon",l:`Due in ${r}d`,u:50};
  return{s:"ok",l:`${r}d left`,u:0};
}
function pw(p){return p==="high"?30:p==="medium"?20:10;}
function fmt(s){return`${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;}
function enrich(t){const st=getStat(t);return{...t,s:st.s,l:st.l,u:st.u};}
function isDue(t){return["overdue","due","soon"].includes(t.s);}

// Select daily tasks: up to 3, mixed categories, weighted by urgency
function selectDaily(tasks){
  const due=tasks.filter(isDue).sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));
  if(due.length===0)return[];
  const cats=["home","admin","personal"];
  const picked=[];
  // One from each category first
  for(const c of cats){
    const pool=due.filter(t=>t.category===c&&!picked.find(p=>p.id===t.id));
    if(pool.length>0){
      const top=pool.slice(0,Math.min(3,pool.length));
      picked.push(top[Math.floor(Math.random()*top.length)]);
    }
    if(picked.length>=3)break;
  }
  // Fill remaining
  while(picked.length<3){
    const remaining=due.filter(t=>!picked.find(p=>p.id===t.id));
    if(remaining.length===0)break;
    const top=remaining.slice(0,3);
    picked.push(top[Math.floor(Math.random()*top.length)]);
  }
  return picked;
}

const CONFETTI=["#FF6B6B","#FFE66D","#4ECDC4","#45B7D1","#96E6A1","#DDA0DD","#FF9A9E","#A18CD1","#F093FB","#FCCB90"];
function Burst({onDone}){
  useEffect(()=>{const t=setTimeout(onDone,3200);return()=>clearTimeout(t);},[onDone]);
  const ps=Array.from({length:28},(_,i)=>({id:i,c:CONFETTI[i%CONFETTI.length],
    x:10+Math.random()*80,dl:Math.random()*0.8,sz:5+Math.random()*12,
    dur:1.4+Math.random()*1.2,rot:Math.random()*720,dx:(Math.random()-.5)*140}));
  return<div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
    {ps.map(p=><div key={p.id} className="absolute" style={{
      left:`${p.x}%`,bottom:"40%",width:p.sz,height:p.sz,background:p.c,opacity:0,
      borderRadius:Math.random()>.5?"50%":"2px",
      animation:`burst ${p.dur}s cubic-bezier(.15,.6,.35,1) ${p.dl}s forwards`,
      '--dx':`${p.dx}px`,'--rot':`${p.rot}deg`}}/>)}
    <style>{`@keyframes burst{0%{transform:translate(0,0) rotate(0deg) scale(1);opacity:1}60%{opacity:1}100%{transform:translate(var(--dx),-340px) rotate(var(--rot)) scale(.15);opacity:0}}`}</style>
  </div>;
}

function Timer({task,onDone,onCancel}){
  const catTheme=CAT[task.category]||CAT.home;
  const[left,setLeft]=useState(task.estimated_min*60);
  const[run,setRun]=useState(true);
  const total=task.estimated_min*60,fin=left<=0,ref=useRef(null);
  useEffect(()=>{if(run&&left>0)ref.current=setInterval(()=>setLeft(s=>s-1),1000);return()=>clearInterval(ref.current);},[run,left]);
  const circ=2*Math.PI*90;
  return<div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
    style={{background:fin?"linear-gradient(135deg,#065f46,#047857)":"linear-gradient(135deg,#1E1B4B,#312E81)"}}>
    <p className="text-white/60 text-xs font-bold mb-1 uppercase tracking-[.2em]">{fin?"Nice work!":"Focus mode"}</p>
    <h2 className="text-white text-xl font-extrabold text-center mb-8 max-w-xs leading-snug">{task.name}</h2>
    <div className="relative w-48 h-48 mb-8">
      <svg className="w-48 h-48 -rotate-90" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
        <circle cx="100" cy="100" r="90" fill="none" stroke={fin?"#34d399":catTheme.accent}
          strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ-circ*(1-left/total)}
          style={{transition:"stroke-dashoffset 1s linear"}}/>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {fin?<span className="text-5xl">&#127881;</span>:<span className="text-4xl font-extrabold text-white tabular-nums">{fmt(left)}</span>}
      </div>
    </div>
    {fin?<>
      <button onClick={onDone} className="w-full max-w-xs py-4 rounded-2xl bg-emerald-500 text-white font-extrabold mb-2 active:scale-95 transition-transform">Mark Complete</button>
      <button onClick={onCancel} className="text-white/40 text-sm">Not done yet</button>
    </>:<>
      <div className="flex gap-3 w-full max-w-xs mb-2">
        <button onClick={()=>setRun(r=>!r)} className="flex-1 py-3 rounded-2xl bg-white/10 text-white text-sm font-bold active:bg-white/20">{run?"Pause":"Resume"}</button>
        <button onClick={()=>setLeft(s=>s+120)} className="py-3 px-5 rounded-2xl bg-white/10 text-white text-sm font-bold active:bg-white/20">+2m</button>
      </div>
      <button onClick={onDone} className="w-full max-w-xs py-3 rounded-2xl text-white text-sm font-bold mb-2 active:scale-95 transition-transform" style={{background:catTheme.accent}}>Done early</button>
      <button onClick={onCancel} className="text-white/30 text-xs">Cancel</button>
    </>}
  </div>;
}

export default function App(){
  const[user,setUser]=useState(()=>localStorage.getItem("hb-user")||null);
  const[nameIn,setNameIn]=useState("");
  const[tasks,setTasks]=useState([]);
  const[loading,setLoading]=useState(true);
  const[view,setView]=useState("today"); // today, category, manage
  const[cat,setCat]=useState(null);
  const[timer,setTimer]=useState(null);
  const[qp,setQp]=useState(false);
  const[adding,setAdding]=useState(false);
  const[nw,setNw]=useState({name:"",frequency:"weekly",priority:"medium",estimated_min:15,category:"home"});
  const[edit,setEdit]=useState(null);
  const[del,setDel]=useState(null);
  const[celebrating,setCelebrating]=useState(null);
  const[dailyIds,setDailyIds]=useState([]);
  const[notifStatus,setNotifStatus]=useState(()=>getNotificationStatus());

  const enableNotifs=async()=>{const s=await setupNotifications(user);setNotifStatus(s);};

  const load=useCallback(async()=>{
    const{data}=await supabase.from("tasks").select("*").eq("active",true).order("created_at");
    if(data)setTasks(data);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  // Real-time sync
  useEffect(()=>{
    const ch=supabase.channel("rt").on("postgres_changes",{event:"*",schema:"public",table:"tasks"},()=>load())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"completions"},()=>{}).subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[load]);

  // Daily task selection
  useEffect(()=>{
    if(!user||tasks.length===0)return;
    const today=new Date().toDateString();
    const key=`hb-daily-${user}`;
    const stored=localStorage.getItem(key);
    const parsed=stored?JSON.parse(stored):null;
    if(parsed&&parsed.date===today){
      // Validate stored IDs still exist and aren't completed today
      const valid=parsed.ids.filter(id=>tasks.find(t=>t.id===id));
      setDailyIds(valid);
    }else{
      const enriched=tasks.map(enrich);
      const selected=selectDaily(enriched);
      const ids=selected.map(t=>t.id);
      localStorage.setItem(key,JSON.stringify({date:today,ids}));
      setDailyIds(ids);
    }
  },[user,tasks]);

  const saveDailyIds=(ids)=>{
    setDailyIds(ids);
    const today=new Date().toDateString();
    localStorage.setItem(`hb-daily-${user}`,JSON.stringify({date:today,ids}));
  };

  const shuffleDaily=(idx)=>{
    const currentId=dailyIds[idx];
    const enriched=tasks.map(enrich);
    const due=enriched.filter(t=>isDue(t)&&!dailyIds.includes(t.id));
    if(due.length===0)return;
    const top=due.sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority))).slice(0,5);
    const pick=top[Math.floor(Math.random()*top.length)];
    const newIds=[...dailyIds];
    newIds[idx]=pick.id;
    saveDailyIds(newIds);
  };

  const removeDaily=(idx)=>{
    saveDailyIds(dailyIds.filter((_,i)=>i!==idx));
  };

  const saveName=(n)=>{setUser(n);localStorage.setItem("hb-user",n);};
  const complete=async(id)=>{
    const now=new Date().toISOString();
    const task=tasks.find(t=>t.id===id);
    await supabase.from("tasks").update({last_completed:now,last_completed_by:user}).eq("id",id);
    await supabase.from("completions").insert({task_id:id,completed_by:user,completed_at:now});
    if(task)notifyCompletion(user,task.name);
    await load();
  };
  const handleDailyComplete=(idx)=>{
    const id=dailyIds[idx];if(!id)return;
    setCelebrating(idx);complete(id);
    setTimeout(()=>{setCelebrating(null);saveDailyIds(dailyIds.filter((_,i)=>i!==idx));},3300);
  };
  const rmTask=async(id)=>{await supabase.from("tasks").update({active:false}).eq("id",id);setDel(null);await load();};
  const upTask=async(id,u)=>{const f=u.frequency?FREQ.find(x=>x.v===u.frequency):null;
    const up={...u};if(f)up.frequency_days=f.d;
    await supabase.from("tasks").update(up).eq("id",id);setEdit(null);await load();};
  const addTask=async()=>{
    if(!nw.name.trim())return;const f=FREQ.find(x=>x.v===nw.frequency);
    await supabase.from("tasks").insert({name:nw.name.trim(),category:nw.category,frequency:nw.frequency,
      frequency_days:f.d,priority:nw.priority,estimated_min:nw.estimated_min});
    setNw({name:"",frequency:"weekly",priority:"medium",estimated_min:15,category:"home"});setAdding(false);await load();};

  const now=new Date();
  const dateStr=`${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  const dailyTasks=dailyIds.map(id=>tasks.find(t=>t.id===id)).filter(Boolean).map(enrich);

  // Count completions today
  const[todayCount,setTodayCount]=useState(0);
  useEffect(()=>{
    const today=new Date();today.setHours(0,0,0,0);
    supabase.from("completions").select("id",{count:"exact"}).eq("completed_by",user)
      .gte("completed_at",today.toISOString()).then(({count})=>setTodayCount(count||0));
  },[tasks,user]);

  if(timer)return<Timer task={timer} onDone={()=>{complete(timer.id);setTimer(null);}} onCancel={()=>setTimer(null)}/>;

  // Quick Pick
  if(qp){
    const[min,setMin]=useState(null);
    const allDue=tasks.map(enrich).filter(isDue).sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));
    const avail=min?allDue.filter(t=>t.estimated_min<=min).slice(0,2):[];
    return<div className="min-h-screen" style={{background:"#FFFAF5"}}>
      <div className="max-w-lg mx-auto px-5 pt-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-stone-800">&#9889; Got time?</h2>
          <button onClick={()=>setQp(false)} className="text-sm text-stone-400 font-semibold">Back</button></div>
        <p className="text-sm text-stone-500 font-medium mb-4">How many minutes?</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {SLOTS.map(t=><button key={t} onClick={()=>setMin(t)} className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={min===t?{background:"#FF6B35",color:"#fff"}:{background:"#fff",border:"2px solid #E7E5E4",color:"#44403C"}}>{t}m</button>)}
        </div>
        {min&&avail.length===0&&<div className="text-center py-10"><p className="text-4xl mb-3">&#127881;</p><p className="text-sm text-stone-400">Nothing due that fits!</p></div>}
        {avail.map((t,i)=>{const c=CAT[t.category]||CAT.home;return<button key={t.id} onClick={()=>setTimer(t)}
          className="w-full mb-3 text-left rounded-2xl p-5 active:scale-[0.97] transition-all shadow-lg" style={{background:c.cards[i%2]}}>
          <div className="flex items-center justify-between">
            <div><p className="text-lg font-extrabold text-white">{t.name}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="bg-white/25 px-2 py-0.5 rounded-full text-xs font-bold text-white">{c.icon} {c.label}</span>
                <span className="text-white/80 text-sm font-semibold">{t.estimated_min}m</span></div></div>
            <div className="w-11 h-11 rounded-full bg-white/25 flex items-center justify-center"><span className="text-white text-lg">&#9654;</span></div>
          </div>
        </button>;})}
      </div></div>;
  }

  // NAME ENTRY
  if(!user)return(
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:"linear-gradient(160deg,#FFFAF5 0%,#FFF1E6 50%,#F0EFFF 100%)"}}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">&#127968;</div>
          <h1 className="text-3xl font-black text-stone-800 tracking-tight">Home Base</h1>
          <p className="text-stone-400 mt-2 text-sm font-medium">Your shared home command center</p></div>
        <div className="bg-white rounded-3xl p-7 shadow-xl shadow-orange-100/50 border border-orange-100/50">
          <label className="block text-sm font-bold text-stone-600 mb-2">What's your name?</label>
          <input type="text" value={nameIn} onChange={e=>setNameIn(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&nameIn.trim()&&saveName(nameIn.trim())}
            placeholder="First name" autoFocus
            className="w-full px-4 py-3.5 rounded-2xl border-2 border-stone-200 text-base font-semibold text-stone-800 focus:outline-none focus:border-orange-400 transition-colors"/>
          <button onClick={()=>nameIn.trim()&&saveName(nameIn.trim())} disabled={!nameIn.trim()}
            className="w-full mt-4 py-3.5 rounded-2xl text-white font-extrabold disabled:opacity-40 active:scale-[0.97] transition-all text-base"
            style={{background:"linear-gradient(135deg,#FF6B35,#E8533F)"}}>Let's go</button>
          <p className="text-xs text-stone-400 mt-3 text-center font-medium">Your partner enters their name on their device</p>
        </div></div></div>
  );
  if(loading)return<div className="min-h-screen flex items-center justify-center" style={{background:"#FFFAF5"}}><p className="text-stone-400 text-sm font-medium">Loading...</p></div>;

  // MANAGE VIEW
  if(view==="manage"){
    const manageCat=cat||"home";
    const theme=CAT[manageCat];
    const all=tasks.filter(t=>t.category===manageCat).map(enrich);
    return<div className="min-h-screen pb-24" style={{background:"#FFFAF5"}}>
      <div className="sticky top-0 z-20 px-5 pt-5 pb-4" style={{background:theme.hdr}}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={()=>{setView("today");setCat(null);}} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold active:bg-white/30">&#8592;</button>
              <h1 className="text-lg font-extrabold text-white">{theme.icon} {theme.label}</h1></div>
            <button onClick={()=>setAdding(true)} className="w-9 h-9 rounded-full bg-white/20 text-white text-xl flex items-center justify-center active:bg-white/30">+</button>
          </div>
          {/* Category tabs */}
          <div className="flex gap-2 mt-3">
            {Object.entries(CAT).map(([k,c])=><button key={k} onClick={()=>setCat(k)}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={manageCat===k?{background:"#fff",color:theme.hdr}:{background:"rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.8)"}}>{c.icon} {c.label}</button>)}
          </div>
        </div></div>
      <div className="px-5 max-w-lg mx-auto mt-4 space-y-2">
        {adding&&<div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100 mb-3">
          <h2 className="text-sm font-extrabold text-stone-800 mb-3">New task</h2>
          <input value={nw.name} onChange={e=>setNw({...nw,name:e.target.value})} placeholder="Task name" autoFocus
            className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-200 text-sm font-semibold mb-3 focus:outline-none focus:border-orange-400"/>
          <div className="mb-3"><label className="text-xs font-bold text-stone-500 mb-1.5 block">Time</label>
            <div className="flex flex-wrap gap-1.5">{[5,10,15,20,30,45].map(m=>
              <button key={m} onClick={()=>setNw({...nw,estimated_min:m})} className="px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95"
                style={nw.estimated_min===m?{background:theme.accent,color:"#fff"}:{background:"#F5F5F4",color:"#78716C"}}>{m}m</button>)}</div></div>
          <div className="mb-3"><label className="text-xs font-bold text-stone-500 mb-1.5 block">Frequency</label>
            <div className="flex flex-wrap gap-1.5">{FREQ.map(f=>
              <button key={f.v} onClick={()=>setNw({...nw,frequency:f.v})} className="px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95"
                style={nw.frequency===f.v?{background:theme.accent,color:"#fff"}:{background:"#F5F5F4",color:"#78716C"}}>{f.l}</button>)}</div></div>
          <div className="mb-4"><label className="text-xs font-bold text-stone-500 mb-1.5 block">Priority</label>
            <div className="flex gap-1.5">{PRIS.map(p=>
              <button key={p} onClick={()=>setNw({...nw,priority:p})}
                className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-all active:scale-95 ${nw.priority===p?PRI_C[p].p+" ring-2 ring-offset-1 ring-stone-200":"bg-stone-100 text-stone-400"}`}>{p}</button>)}</div></div>
          <div className="flex gap-3">
            <button onClick={()=>setAdding(false)} className="flex-1 py-2.5 rounded-xl border-2 border-stone-200 text-sm font-bold text-stone-500 active:bg-stone-50">Cancel</button>
            <button onClick={()=>{setNw({...nw,category:manageCat});addTask();}} disabled={!nw.name.trim()}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-extrabold disabled:opacity-40 active:scale-95"
              style={{background:theme.accent}}>Add</button></div>
        </div>}
        {all.length===0&&!adding&&<div className="text-center py-10"><p className="text-stone-400 text-sm font-medium">No tasks yet. Tap + to add.</p></div>}
        {all.map(t=><div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 transition-all"
          style={{borderLeftWidth:4,borderLeftColor:PRI_C[t.priority].b}}>
          {edit===t.id?<EditInline task={t} theme={theme} onSave={u=>upTask(t.id,u)} onCancel={()=>setEdit(null)}/>:<>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-stone-800">{t.name}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${PRI_C[t.priority].p}`}>{t.priority}</span>
                  <span className="text-xs text-stone-400 font-semibold">{FREQ.find(f=>f.v===t.frequency)?.l}</span>
                  <span className="text-xs font-bold" style={{color:theme.accent}}>{t.estimated_min}m</span>
                  <span className={`text-xs ${t.s==="overdue"?"text-red-500 font-bold":t.s==="due"?"text-amber-500 font-semibold":"text-emerald-500"}`}>{t.l}</span></div></div>
              <div className="flex gap-1 ml-2">
                <button onClick={()=>setEdit(t.id)} className="text-xs text-stone-400 font-semibold px-2 py-1 rounded-lg active:bg-stone-100">Edit</button>
                <button onClick={()=>setDel(del===t.id?null:t.id)} className="text-xs text-stone-400 font-semibold px-2 py-1 rounded-lg active:bg-red-50">Del</button></div>
            </div>
            {del===t.id&&<div className="mt-3 bg-red-50 rounded-xl p-3 flex items-center justify-between border border-red-100">
              <span className="text-xs text-red-600 font-bold">Remove this task?</span>
              <div className="flex gap-2"><button onClick={()=>setDel(null)} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-stone-200 font-semibold">No</button>
              <button onClick={()=>rmTask(t.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white font-bold">Yes</button></div></div>}
          </>}
        </div>)}
      </div></div>;
  }

  // TODAY VIEW (default)
  return(
    <div className="min-h-screen" style={{background:"linear-gradient(180deg,#FF6B35 0%,#E8533F 18%,#FFFAF5 38%)"}}>
      <div className="max-w-lg mx-auto px-5 pt-6 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-white/70 text-xs font-bold uppercase tracking-[.15em]">{dateStr}</p>
          <button onClick={()=>setQp(true)} className="px-3 py-1.5 rounded-full bg-white/20 text-white text-xs font-bold active:bg-white/30 backdrop-blur transition-all">
            &#9889; Got time?</button>
        </div>
        <h1 className="text-2xl font-black text-white leading-tight">Hey {user} &#128075;</h1>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-3 mb-5">
          {todayCount>0&&<div className="bg-white/20 backdrop-blur rounded-full px-3 py-1 flex items-center gap-1.5">
            <span className="text-white text-sm">&#127942;</span>
            <span className="text-white text-xs font-bold">{todayCount} done today</span></div>}
          {notifStatus==="default"&&<button onClick={enableNotifs}
            className="bg-white/20 backdrop-blur rounded-full px-3 py-1 flex items-center gap-1.5 active:bg-white/30">
            <span className="text-white text-sm">&#128276;</span>
            <span className="text-white text-xs font-bold">Enable alerts</span></button>}
        </div>

        {/* Daily tasks */}
        <div className="space-y-3">
          {dailyTasks.length===0?
            <div className="bg-white rounded-3xl p-8 text-center shadow-lg shadow-stone-200/50">
              <p className="text-4xl mb-3">&#10024;</p>
              <h2 className="text-lg font-extrabold text-stone-800">All clear today!</h2>
              <p className="text-sm text-stone-400 font-medium mt-1">Nothing due. You earned a break.</p></div>
          :dailyTasks.map((task,idx)=>{
            const c=CAT[task.category]||CAT.home;
            const isCel=celebrating===idx;
            return<div key={task.id} className="relative">
              {isCel&&<Burst onDone={()=>{}}/>}
              <div className={`rounded-3xl p-5 shadow-lg shadow-stone-200/30 transition-all duration-300 relative overflow-hidden ${isCel?"scale-105":""}`}
                style={{background:isCel?"linear-gradient(135deg,#10B981,#059669)":c.cards[idx%2],transition:"all 0.3s ease"}}>
                <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10"/>
                <div className="relative z-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="bg-white/20 px-2 py-0.5 rounded-full text-[11px] font-bold text-white">{c.icon} {c.label}</span>
                        <span className="bg-white/15 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white/70">{task.l}</span></div>
                      <p className="text-lg font-extrabold text-white leading-snug">{task.name}</p>
                      <span className="text-white/80 text-sm font-semibold mt-1 inline-block">{task.estimated_min} min</span>
                    </div>
                    <button onClick={()=>handleDailyComplete(idx)}
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 ${
                        isCel?"bg-white scale-110":"bg-white/25 active:bg-white/40"}`}
                      style={{boxShadow:isCel?"0 0 30px rgba(255,255,255,0.5)":"none"}}>
                      <span className={`text-2xl font-black ${isCel?"text-emerald-500":"text-white"}`}>&#10003;</span></button>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={()=>shuffleDaily(idx)} className="bg-white/15 active:bg-white/25 px-3 py-1.5 rounded-full text-xs font-bold text-white/90 active:scale-95 transition-all">&#8634; Shuffle</button>
                    <button onClick={()=>setTimer(task)} className="bg-white/15 active:bg-white/25 px-3 py-1.5 rounded-full text-xs font-bold text-white/90 active:scale-95 transition-all">&#9654; Timer</button>
                    <button onClick={()=>removeDaily(idx)} className="bg-white/10 active:bg-white/20 px-3 py-1.5 rounded-full text-xs font-bold text-white/50 active:scale-95 transition-all">&#10005;</button>
                  </div>
                </div>
              </div>
            </div>;})}
        </div>

        {/* Category shortcuts */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-[.1em]">Browse & manage</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(CAT).map(([k,c])=>{
              const n=tasks.filter(t=>t.category===k).map(enrich).filter(isDue).length;
              return<button key={k} onClick={()=>{setCat(k);setView("manage");setAdding(false);setNw({...nw,category:k});}}
                className="rounded-2xl p-3 text-left active:scale-95 transition-all shadow-sm" style={{background:c.grad}}>
                <span className="text-xl">{c.icon}</span>
                <p className="text-xs font-extrabold text-white mt-1">{c.label}</p>
                <p className="text-[10px] font-semibold text-white/60 mt-0.5">{n>0?`${n} due`:"Clear"}</p>
              </button>;})}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditInline({task,theme,onSave,onCancel}){
  const[n,setN]=useState(task.name);const[f,setF]=useState(task.frequency);
  const[p,setP]=useState(task.priority);const[e,setE]=useState(task.estimated_min);
  return<div className="space-y-3">
    <input value={n} onChange={ev=>setN(ev.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-200 text-sm font-semibold focus:outline-none focus:border-orange-400"/>
    <div className="flex items-center gap-2"><span className="text-xs text-stone-500 font-bold">Time:</span>
      <input type="number" value={e} onChange={ev=>setE(parseInt(ev.target.value)||1)} className="w-16 px-3 py-1.5 rounded-lg border-2 border-stone-200 text-sm font-bold focus:outline-none"/>
      <span className="text-xs text-stone-400">min</span></div>
    <div className="flex flex-wrap gap-1.5">{FREQ.map(x=>
      <button key={x.v} onClick={()=>setF(x.v)} className="px-2.5 py-1 rounded-full text-xs font-bold transition-all active:scale-95"
        style={f===x.v?{background:theme.accent,color:"#fff"}:{background:"#F5F5F4",color:"#78716C"}}>{x.l}</button>)}</div>
    <div className="flex gap-1.5">{PRIS.map(x=>
      <button key={x} onClick={()=>setP(x)} className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${p===x?PRI_C[x].p+" ring-1 ring-stone-200":"bg-stone-100 text-stone-400"}`}>{x}</button>)}</div>
    <div className="flex gap-2"><button onClick={onCancel} className="text-xs px-4 py-2 rounded-xl border-2 border-stone-200 text-stone-500 font-bold active:bg-stone-50">Cancel</button>
      <button onClick={()=>onSave({name:n,frequency:f,priority:p,estimated_min:e})} className="text-xs px-4 py-2 rounded-xl text-white font-bold active:scale-95" style={{background:theme.accent}}>Save</button></div>
  </div>;
}
