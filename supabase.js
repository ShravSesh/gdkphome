import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import { setupNotifications, notifyCompletion, getNotificationStatus } from "./notifications.js";

const FREQ = [
  { v:"daily",l:"Daily",d:1 },{ v:"twice_weekly",l:"2x/week",d:3 },
  { v:"weekly",l:"Weekly",d:7 },{ v:"biweekly",l:"Every 2 weeks",d:14 },
  { v:"monthly",l:"Monthly",d:30 },{ v:"quarterly",l:"Quarterly",d:90 },
];
const PRIS = ["high","medium","low"];
const SLOTS = [10,15,20,30,45,60];
const CAT = {
  home:{ label:"Home Tasks",icon:"\u{1F3E0}",desc:"Cleaning & maintenance",
    grad:"linear-gradient(135deg,#06B6D4,#0D9488)",accent:"#0D9488",hdr:"#0F766E",light:"#CCFBF1",
    cards:["linear-gradient(135deg,#22D3EE,#14B8A6)","linear-gradient(135deg,#2DD4BF,#059669)"]},
  admin:{ label:"Life Admin",icon:"\u{1F4CB}",desc:"Bills, appointments & paperwork",
    grad:"linear-gradient(135deg,#F97316,#E11D48)",accent:"#EA580C",hdr:"#C2410C",light:"#FFF7ED",
    cards:["linear-gradient(135deg,#FB923C,#F43F5E)","linear-gradient(135deg,#FBBF24,#F97316)"]},
  personal:{ label:"Projects",icon:"\u{1F680}",desc:"Goals & personal projects",
    grad:"linear-gradient(135deg,#8B5CF6,#7C3AED)",accent:"#7C3AED",hdr:"#6D28D9",light:"#F5F3FF",
    cards:["linear-gradient(135deg,#A78BFA,#7C3AED)","linear-gradient(135deg,#C084FC,#9333EA)"]},
};
const PRI_C = { high:{b:"#EF4444",p:"bg-red-100 text-red-700"},medium:{b:"#F59E0B",p:"bg-amber-100 text-amber-700"},low:{b:"#3B82F6",p:"bg-blue-100 text-blue-600"} };
const S_C = { overdue:"text-red-500 font-bold",due:"text-amber-500 font-semibold",soon:"text-yellow-600",ok:"text-emerald-500 font-medium" };

function getStat(t){
  if(!t.last_completed) return {s:"due",l:"Not done yet",u:100};
  const e=Math.floor((Date.now()-new Date(t.last_completed))/864e5),r=t.frequency_days-e;
  if(r<=0) return {s:"overdue",l:`${Math.abs(r)}d overdue`,u:200+Math.abs(r)};
  if(r<=Math.max(1,t.frequency_days*.25)) return {s:"soon",l:`Due in ${r}d`,u:50};
  return {s:"ok",l:`${r}d left`,u:0};
}
function pw(p){return p==="high"?30:p==="medium"?20:10;}
function fmt(s){return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;}

const CONFETTI=["#FF6B6B","#FFE66D","#4ECDC4","#45B7D1","#96E6A1","#DDA0DD","#FF9A9E","#A18CD1","#F093FB","#FCCB90"];

function Burst({onDone}){
  useEffect(()=>{const t=setTimeout(onDone,3200);return()=>clearTimeout(t);},[onDone]);
  const ps=Array.from({length:28},(_,i)=>({id:i,c:CONFETTI[i%CONFETTI.length],
    x:10+Math.random()*80,dl:Math.random()*0.8,sz:5+Math.random()*12,
    dur:1.4+Math.random()*1.2,rot:Math.random()*720,dx:(Math.random()-.5)*140}));
  return <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
    {ps.map(p=><div key={p.id} className="absolute" style={{
      left:`${p.x}%`,bottom:"40%",width:p.sz,height:p.sz,background:p.c,opacity:0,
      borderRadius:Math.random()>.5?"50%":"2px",
      animation:`burst ${p.dur}s cubic-bezier(.15,.6,.35,1) ${p.dl}s forwards`,
      '--dx':`${p.dx}px`,'--rot':`${p.rot}deg`}}/>)}
    <style>{`@keyframes burst{0%{transform:translate(0,0) rotate(0deg) scale(1);opacity:1}60%{opacity:1}100%{transform:translate(var(--dx),-340px) rotate(var(--rot)) scale(.15);opacity:0}}`}</style>
  </div>;
}

function Timer({task,theme,onDone,onCancel}){
  const[left,setLeft]=useState(task.estimated_min*60);
  const[run,setRun]=useState(true);
  const total=task.estimated_min*60,fin=left<=0,ref=useRef(null);
  useEffect(()=>{if(run&&left>0)ref.current=setInterval(()=>setLeft(s=>s-1),1000);return()=>clearInterval(ref.current);},[run,left]);
  const circ=2*Math.PI*90;
  return <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
    style={{background:fin?"linear-gradient(135deg,#065f46,#047857)":"linear-gradient(135deg,#1E1B4B,#312E81)"}}>
    <p className="text-white/60 text-sm font-bold mb-1 uppercase tracking-widest">{fin?"Nice work!":"Focus mode"}</p>
    <h2 className="text-white text-xl font-bold text-center mb-8 max-w-xs">{task.name}</h2>
    <div className="relative w-48 h-48 mb-8">
      <svg className="w-48 h-48 -rotate-90" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
        <circle cx="100" cy="100" r="90" fill="none" stroke={fin?"#34d399":theme.accent}
          strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ-circ*(1-left/total)}
          style={{transition:"stroke-dashoffset 1s linear"}}/>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {fin?<span className="text-5xl">&#127881;</span>:<span className="text-4xl font-bold text-white tabular-nums">{fmt(left)}</span>}
      </div>
    </div>
    {fin?<>
      <button onClick={onDone} className="w-full max-w-xs py-4 rounded-2xl bg-emerald-500 text-white font-bold mb-2">Mark Complete</button>
      <button onClick={onCancel} className="text-white/40 text-sm">Not done yet</button>
    </>:<>
      <div className="flex gap-3 w-full max-w-xs mb-2">
        <button onClick={()=>setRun(r=>!r)} className="flex-1 py-3 rounded-2xl bg-white/10 text-white text-sm font-bold">{run?"Pause":"Resume"}</button>
        <button onClick={()=>setLeft(s=>s+120)} className="py-3 px-5 rounded-2xl bg-white/10 text-white text-sm font-bold">+2m</button>
      </div>
      <button onClick={onDone} className="w-full max-w-xs py-3 rounded-2xl text-white text-sm font-bold mb-2" style={{background:theme.accent}}>Done early</button>
      <button onClick={onCancel} className="text-white/30 text-xs">Cancel</button>
    </>}
  </div>;
}

function QuickPick({tasks,theme,onStart,onClose}){
  const[min,setMin]=useState(null);
  const avail=min?tasks.filter(t=>t.estimated_min<=min&&["overdue","due","soon"].includes(t.s))
    .sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority))).slice(0,2):[];
  return <div className="fixed inset-0 z-40 overflow-auto" style={{background:"#FAFAFF"}}>
    <div className="max-w-lg mx-auto p-4">
      <div className="flex items-center justify-between mb-5 pt-2">
        <h2 className="text-xl font-black" style={{color:theme.accent}}>&#9889; Got time?</h2>
        <button onClick={onClose} className="text-sm text-slate-400 font-semibold px-3 py-1">Back</button></div>
      <p className="text-sm text-slate-600 font-medium mb-4">How many minutes?</p>
      <div className="flex flex-wrap gap-2 mb-6">
        {SLOTS.map(t=><button key={t} onClick={()=>setMin(t)} className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={min===t?{background:theme.accent,color:"#fff"}:{background:"#fff",border:"2px solid #E5E7EB",color:"#374151"}}>{t}m</button>)}
      </div>
      {min&&avail.length===0&&<div className="text-center py-10"><p className="text-4xl mb-3">&#127881;</p><p className="text-sm text-slate-500">Nothing due that fits!</p></div>}
      {avail.map((t,i)=><button key={t.id} onClick={()=>onStart(t)} className="w-full mb-3 text-left rounded-2xl p-5 active:scale-[0.97] transition-all shadow-md"
        style={{background:theme.cards[i%2]}}>
        <div className="flex items-center justify-between">
          <div><p className="text-lg font-black text-white">{t.name}</p>
            <p className="text-white/80 text-sm font-semibold mt-1">{t.estimated_min} min &middot; {t.l}</p></div>
          <div className="w-12 h-12 rounded-full bg-white/25 flex items-center justify-center"><span className="text-white text-xl">&#9654;</span></div>
        </div>
      </button>)}
    </div>
  </div>;
}

export default function App(){
  const[user,setUser]=useState(()=>localStorage.getItem("hb-user")||null);
  const[nameIn,setNameIn]=useState("");
  const[tasks,setTasks]=useState([]);
  const[loading,setLoading]=useState(true);
  const[cat,setCat]=useState(null);
  const[timer,setTimer]=useState(null);
  const[qp,setQp]=useState(false);
  const[manage,setManage]=useState(false);
  const[adding,setAdding]=useState(false);
  const[nw,setNw]=useState({name:"",frequency:"weekly",priority:"medium",estimated_min:15});
  const[edit,setEdit]=useState(null);
  const[del,setDel]=useState(null);
  const[celebrating,setCelebrating]=useState(null);
  const[shuffleAnim,setShuffleAnim]=useState(null);
  const[skipIds,setSkipIds]=useState([]);
  const[notifStatus,setNotifStatus]=useState(()=>getNotificationStatus());

  // Auto-setup notifications when user is set
  useEffect(()=>{if(user&&notifStatus==="default"){/* wait for manual prompt */}},[user,notifStatus]);
  const enableNotifs=async()=>{const s=await setupNotifications(user);setNotifStatus(s);};

  // Load tasks from Supabase
  const load=useCallback(async()=>{
    const{data,error}=await supabase.from("tasks").select("*").eq("active",true).order("created_at");
    if(data) setTasks(data);
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  // Real-time subscription
  useEffect(()=>{
    const channel=supabase.channel("tasks-realtime")
      .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},()=>load())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"completions"},(payload)=>{
        if(payload.new.completed_by!==user){
          // Partner completed something — could trigger notification here
        }
      })
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[load,user]);

  const saveName=(n)=>{setUser(n);localStorage.setItem("hb-user",n);};

  const complete=async(id)=>{
    const now=new Date().toISOString();
    const task=tasks.find(t=>t.id===id);
    await supabase.from("tasks").update({last_completed:now,last_completed_by:user}).eq("id",id);
    await supabase.from("completions").insert({task_id:id,completed_by:user,completed_at:now});
    if(task) notifyCompletion(user,task.name);
    await load();
  };

  const addTask=async()=>{
    if(!nw.name.trim())return;
    const f=FREQ.find(x=>x.v===nw.frequency);
    await supabase.from("tasks").insert({name:nw.name.trim(),category:cat,frequency:nw.frequency,
      frequency_days:f.d,priority:nw.priority,estimated_min:nw.estimated_min});
    setNw({name:"",frequency:"weekly",priority:"medium",estimated_min:15});setAdding(false);await load();
  };

  const rmTask=async(id)=>{await supabase.from("tasks").update({active:false}).eq("id",id);setDel(null);await load();};
  const upTask=async(id,u)=>{
    const f=u.frequency?FREQ.find(x=>x.v===u.frequency):null;
    const update={...u};if(f)update.frequency_days=f.d;
    await supabase.from("tasks").update(update).eq("id",id);setEdit(null);await load();
  };

  const theme=cat?CAT[cat]:null;
  const enrich=t=>{const st=getStat(t);return{...t,s:st.s,l:st.l,u:st.u};};
  const getDue=c=>tasks.filter(t=>t.category===c).map(enrich)
    .filter(t=>["overdue","due","soon"].includes(t.s)).sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));
  const cntDue=c=>getDue(c).length;

  const deck=cat?getDue(cat):[];
  const visible=deck.filter(t=>!skipIds.includes(t.id)).slice(0,2);
  const[completions,setCompletions]=useState([]);

  // Load today's completions
  useEffect(()=>{
    if(!cat)return;
    const today=new Date();today.setHours(0,0,0,0);
    supabase.from("completions").select("*,tasks(category)")
      .gte("completed_at",today.toISOString())
      .then(({data})=>{if(data)setCompletions(data);});
  },[cat,tasks]);

  const doneToday=cat?completions.filter(c=>c.tasks?.category===cat).length:0;

  const shuffle=(idx)=>{
    const task=visible[idx];if(!task)return;
    setShuffleAnim(idx);setTimeout(()=>setShuffleAnim(null),400);
    setSkipIds(prev=>{const next=[...prev,task.id];
      if(deck.filter(t=>!next.includes(t.id)).length<2)return[];return next;});
  };
  const handleComplete=(idx)=>{
    const task=visible[idx];if(!task)return;
    setCelebrating(idx);complete(task.id);
    setTimeout(()=>{setCelebrating(null);setSkipIds(prev=>prev.filter(id=>id!==task.id));},3300);
  };
  useEffect(()=>{setSkipIds([]);},[cat]);

  if(timer&&theme) return <Timer task={timer} theme={theme} onDone={()=>{complete(timer.id);setTimer(null);setQp(false);}} onCancel={()=>setTimer(null)}/>;
  if(qp&&theme) return <QuickPick tasks={deck} theme={theme} onStart={t=>setTimer(t)} onClose={()=>setQp(false)}/>;

  // NAME ENTRY
  if(!user) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:"linear-gradient(135deg,#EEF2FF,#FDF2F8,#ECFDF5)"}}>
      <div className="w-full max-w-sm"><div className="text-center mb-8"><div className="text-5xl mb-3">&#127968;</div>
        <h1 className="text-3xl font-black text-slate-800">Home Base</h1>
        <p className="text-slate-500 mt-2 text-sm font-medium">Your shared home command center</p></div>
        <div className="bg-white rounded-2xl p-6 shadow-lg">
          <label className="block text-sm font-bold text-slate-700 mb-2">What's your name?</label>
          <input type="text" value={nameIn} onChange={e=>setNameIn(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&nameIn.trim()&&saveName(nameIn.trim())}
            placeholder="First name" autoFocus className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base font-medium focus:outline-none focus:border-violet-400"/>
          <button onClick={()=>nameIn.trim()&&saveName(nameIn.trim())} disabled={!nameIn.trim()}
            className="w-full mt-4 py-3.5 rounded-xl text-white font-bold disabled:opacity-40 active:scale-[0.98]"
            style={{background:"linear-gradient(135deg,#8B5CF6,#06B6D4)"}}>Let's go</button>
          <p className="text-xs text-slate-400 mt-3 text-center font-medium">Your partner enters their name on their device</p>
        </div></div></div>
  );
  if(loading) return <div className="min-h-screen flex items-center justify-center" style={{background:"#FAFAFF"}}><p className="text-slate-400">Loading...</p></div>;

  // HOME SCREEN
  if(!cat) return (
    <div className="min-h-screen pb-8" style={{background:"linear-gradient(180deg,#F0EFFF 0%,#FAFAFF 40%)"}}>
      <div className="max-w-lg mx-auto px-5 pt-8">
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Home Base</p>
        <h1 className="text-2xl font-black text-slate-800 mt-1">Hey {user} &#128075;</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">What are we tackling?</p>
        {notifStatus==="default"&&<button onClick={enableNotifs}
          className="w-full mt-4 py-3 px-4 rounded-xl bg-white border-2 border-violet-200 text-sm font-bold text-violet-700 flex items-center gap-2 active:scale-[0.98] shadow-sm">
          <span className="text-lg">&#128276;</span> Enable notifications so your partner knows when you finish a task
        </button>}
        {notifStatus==="granted"&&<div className="mt-4 py-2 px-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-2">
          <span>&#10003;</span> Notifications on — you'll know when tasks get done
        </div>}
        <div className="mt-6 space-y-4">
          {Object.entries(CAT).map(([k,c])=>{const n=cntDue(k);return(
            <button key={k} onClick={()=>{setCat(k);setManage(false);setAdding(false);}}
              className="w-full text-left rounded-2xl p-5 shadow-md active:scale-[0.97] transition-all relative overflow-hidden" style={{background:c.grad}}>
              <span className="text-3xl">{c.icon}</span>
              <h2 className="text-xl font-black text-white mt-2">{c.label}</h2>
              <p className="text-white/70 text-sm font-medium mt-0.5">{c.desc}</p>
              {n>0?<p className="text-white/80 text-xs font-bold mt-3">{n} task{n>1?"s":""} need attention</p>
                :<p className="text-white/60 text-xs font-semibold mt-3">All caught up!</p>}
              {n>0&&<div className="absolute right-4 top-5 bg-white/25 backdrop-blur rounded-full w-11 h-11 flex items-center justify-center">
                <span className="text-white text-lg font-black">{n}</span></div>}
              <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10"/>
            </button>);})}
        </div>
      </div></div>
  );

  // MANAGE VIEW
  if(manage){
    const all=tasks.filter(t=>t.category===cat).map(enrich);
    return <div className="min-h-screen pb-28" style={{background:"#FAFAFF"}}>
      <div className="sticky top-0 z-20 px-4 pt-4 pb-3 shadow-sm" style={{background:theme.hdr}}>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={()=>setManage(false)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">&#8592;</button>
            <h1 className="text-lg font-black text-white">Manage Tasks</h1></div>
          <button onClick={()=>setAdding(true)} className="w-9 h-9 rounded-full bg-white/20 text-white text-xl flex items-center justify-center">+</button>
        </div></div>
      <div className="px-4 max-w-lg mx-auto mt-3 space-y-2">
        {adding&&<div className="bg-white rounded-2xl border-2 border-gray-100 p-4 shadow-sm mb-3">
          <h2 className="text-sm font-black text-slate-800 mb-3">Add task</h2>
          <input value={nw.name} onChange={e=>setNw({...nw,name:e.target.value})} placeholder="Task name" autoFocus
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-medium mb-2 focus:outline-none"/>
          <div className="flex flex-wrap gap-1.5 mb-2">{[5,10,15,20,30].map(m=>
            <button key={m} onClick={()=>setNw({...nw,estimated_min:m})} className="px-2.5 py-1 rounded-full text-xs font-bold"
              style={nw.estimated_min===m?{background:theme.accent,color:"#fff"}:{background:"#F3F4F6",color:"#6B7280"}}>{m}m</button>)}</div>
          <div className="flex flex-wrap gap-1.5 mb-2">{FREQ.map(f=>
            <button key={f.v} onClick={()=>setNw({...nw,frequency:f.v})} className="px-2.5 py-1 rounded-full text-xs font-bold"
              style={nw.frequency===f.v?{background:theme.accent,color:"#fff"}:{background:"#F3F4F6",color:"#6B7280"}}>{f.l}</button>)}</div>
          <div className="flex gap-1.5 mb-3">{PRIS.map(p=>
            <button key={p} onClick={()=>setNw({...nw,priority:p})}
              className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${nw.priority===p?PRI_C[p].p:"bg-gray-100 text-gray-400"}`}>{p}</button>)}</div>
          <div className="flex gap-2">
            <button onClick={()=>setAdding(false)} className="flex-1 py-2 rounded-xl border-2 border-gray-200 text-sm font-bold text-slate-500">Cancel</button>
            <button onClick={addTask} disabled={!nw.name.trim()} className="flex-1 py-2 rounded-xl text-white text-sm font-black disabled:opacity-40"
              style={{background:theme.accent}}>Add</button></div>
        </div>}
        {all.map(t=><div key={t.id} className="bg-white rounded-xl p-3" style={{border:"2px solid #F3F4F6",borderLeftWidth:5,borderLeftColor:PRI_C[t.priority].b}}>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-slate-800">{t.name}</p>
              <div className="flex gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${PRI_C[t.priority].p}`}>{t.priority}</span>
                <span className="text-xs text-gray-500 font-semibold">{FREQ.find(f=>f.v===t.frequency)?.l}</span>
                <span className="text-xs font-bold" style={{color:theme.accent}}>{t.estimated_min}m</span></div></div>
            <div className="flex gap-1">
              <button onClick={()=>setEdit(edit===t.id?null:t.id)} className="text-xs text-slate-400 font-semibold px-2 py-1">Edit</button>
              <button onClick={()=>setDel(del===t.id?null:t.id)} className="text-xs text-slate-400 font-semibold px-2 py-1">Del</button></div>
          </div>
          {del===t.id&&<div className="mt-2 bg-red-50 rounded-lg p-2 flex items-center justify-between">
            <span className="text-xs text-red-600 font-bold">Remove?</span>
            <div className="flex gap-2"><button onClick={()=>setDel(null)} className="text-xs px-2 py-1 rounded bg-white border border-gray-200 font-semibold">No</button>
            <button onClick={()=>rmTask(t.id)} className="text-xs px-2 py-1 rounded bg-red-500 text-white font-bold">Yes</button></div></div>}
          {edit===t.id&&<EditInline task={t} theme={theme} onSave={u=>upTask(t.id,u)} onCancel={()=>setEdit(null)}/>}
        </div>)}
      </div></div>;
  }

  // MAIN 2-CARD VIEW
  return (
    <div className="min-h-screen" style={{background:"linear-gradient(180deg,"+theme.hdr+" 0%,#FAFAFF 35%)"}}>
      <div className="max-w-lg mx-auto px-5 pt-5 pb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={()=>setCat(null)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">&#8592;</button>
            <h1 className="text-lg font-black text-white">{theme.icon} {theme.label}</h1></div>
          <button onClick={()=>setQp(true)} className="px-3 py-2 rounded-xl bg-white/20 text-white text-xs font-bold backdrop-blur">&#9889; Got time?</button>
        </div>
        <div className="flex items-center gap-2 mb-5">
          {doneToday>0?<div className="bg-white/20 backdrop-blur rounded-full px-4 py-1.5 flex items-center gap-2">
            <span className="text-white text-lg">&#127942;</span>
            <span className="text-white text-sm font-bold">{doneToday} done today!</span>
          </div>:<div className="bg-white/10 rounded-full px-4 py-1.5">
            <span className="text-white/60 text-sm font-medium">Let's get started</span></div>}
          <div className="flex-1"/>
          <span className="text-white/50 text-xs font-medium">{deck.length} due</span>
        </div>

        {visible.length===0?
          <div className="bg-white rounded-3xl p-8 text-center shadow-lg mt-4">
            <p className="text-5xl mb-4">&#10024;</p>
            <h2 className="text-xl font-black text-slate-800">All caught up!</h2>
            <p className="text-sm text-slate-500 font-medium mt-2">Nothing due. Nice work.</p></div>
        :<div className="space-y-4">
          {visible.map((task,idx)=>{
            const isCel=celebrating===idx,isSh=shuffleAnim===idx;
            return <div key={task.id+idx} className="relative">
              {isCel&&<Burst onDone={()=>{}}/>}
              <div className={`rounded-3xl p-5 shadow-lg transition-all duration-300 relative overflow-hidden ${isCel?"scale-105":""} ${isSh?"opacity-0 scale-90":"opacity-100 scale-100"}`}
                style={{background:isCel?"linear-gradient(135deg,#10B981,#059669)":theme.cards[idx%2],transition:"all 0.3s ease"}}>
                <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10"/>
                <div className="relative z-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-lg font-black text-white leading-snug">{task.name}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="bg-white/25 backdrop-blur px-2.5 py-1 rounded-full text-xs font-bold text-white">{task.estimated_min} min</span>
                        <span className="bg-white/15 px-2.5 py-1 rounded-full text-xs font-semibold text-white/80">{task.l}</span></div></div>
                    <button onClick={()=>handleComplete(idx)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 ${isCel?"bg-white scale-110":"bg-white/25 hover:bg-white/40"}`}
                      style={{boxShadow:isCel?"0 0 30px rgba(255,255,255,0.5)":"none"}}>
                      <span className={`text-2xl font-black ${isCel?"text-emerald-500":"text-white"}`}>&#10003;</span></button>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={()=>shuffle(idx)} className="bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full text-xs font-bold text-white/90 active:scale-95 transition-all">&#8634; Shuffle</button>
                    <button onClick={()=>setTimer(task)} className="bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full text-xs font-bold text-white/90 active:scale-95 transition-all">&#9654; Start timer</button>
                  </div>
                </div>
              </div>
            </div>;})}
        </div>}

        {visible.length>0&&<div className="flex justify-center mt-4">
          <button onClick={()=>{shuffle(0);setTimeout(()=>shuffle(1),100);}}
            className="px-5 py-2.5 rounded-full bg-white/90 shadow-md text-sm font-bold active:scale-95 transition-all"
            style={{color:theme.accent}}>&#8634; Shuffle both</button></div>}

        <div className="flex gap-3 mt-6">
          <button onClick={()=>setManage(true)} className="flex-1 py-3 rounded-xl bg-white border-2 border-gray-200 text-sm font-bold text-slate-500">Manage tasks</button>
        </div>
      </div></div>
  );
}

function EditInline({task,theme,onSave,onCancel}){
  const[n,setN]=useState(task.name);const[f,setF]=useState(task.frequency);
  const[p,setP]=useState(task.priority);const[e,setE]=useState(task.estimated_min);
  return <div className="mt-3 rounded-xl p-3 space-y-3" style={{background:theme.light}}>
    <input value={n} onChange={ev=>setN(ev.target.value)} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm font-medium focus:outline-none"/>
    <div className="flex items-center gap-2"><label className="text-xs text-slate-500 font-semibold">Time:</label>
      <input type="number" value={e} onChange={ev=>setE(parseInt(ev.target.value)||1)} className="w-16 px-3 py-1.5 rounded-lg border-2 border-gray-200 text-sm font-bold focus:outline-none"/>
      <span className="text-xs text-slate-400">min</span></div>
    <div className="flex flex-wrap gap-1.5">{FREQ.map(x=>
      <button key={x.v} onClick={()=>setF(x.v)} className="px-2.5 py-1 rounded-full text-xs font-bold"
        style={f===x.v?{background:theme.accent,color:"#fff"}:{background:"#fff",border:"1px solid #D1D5DB",color:"#6B7280"}}>{x.l}</button>)}</div>
    <div className="flex gap-1.5">{PRIS.map(x=>
      <button key={x} onClick={()=>setP(x)} className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${p===x?PRI_C[x].p+" ring-1 ring-gray-200":"bg-white border border-gray-200 text-gray-400"}`}>{x}</button>)}</div>
    <div className="flex gap-2"><button onClick={onCancel} className="text-xs px-4 py-2 rounded-lg border-2 border-gray-200 text-slate-500 font-semibold">Cancel</button>
      <button onClick={()=>onSave({name:n,frequency:f,priority:p,estimated_min:e})} className="text-xs px-4 py-2 rounded-lg text-white font-bold" style={{background:theme.accent}}>Save</button></div>
  </div>;
}
