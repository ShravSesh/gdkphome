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
    card:"linear-gradient(135deg,#0D9488,#0F766E)",accent:"#0F766E",hdr:"#0F766E",light:"#F0FDFA"},
  admin:{label:"Life Admin",icon:"\u{1F4CB}",
    card:"linear-gradient(135deg,#DC2626,#B91C1C)",accent:"#B91C1C",hdr:"#991B1B",light:"#FEF2F2"},
  personal:{label:"Projects",icon:"\u{1F680}",
    card:"linear-gradient(135deg,#7C3AED,#6D28D9)",accent:"#6D28D9",hdr:"#5B21B6",light:"#F5F3FF"},
};
const PRI_C={high:{b:"#DC2626",p:"bg-red-50 text-red-700"},medium:{b:"#D97706",p:"bg-amber-50 text-amber-700"},low:{b:"#2563EB",p:"bg-blue-50 text-blue-700"}};

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

function selectDaily(tasks){
  const due=tasks.filter(isDue).sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));
  if(!due.length)return[];
  const cats=["home","admin","personal"];
  const picked=[];
  for(const c of cats){
    const pool=due.filter(t=>t.category===c&&!picked.find(p=>p.id===t.id));
    if(pool.length){const top=pool.slice(0,3);picked.push(top[Math.floor(Math.random()*top.length)]);}
    if(picked.length>=3)break;
  }
  while(picked.length<3){
    const rem=due.filter(t=>!picked.find(p=>p.id===t.id));
    if(!rem.length)break;
    const top=rem.slice(0,3);picked.push(top[Math.floor(Math.random()*top.length)]);
  }
  return picked;
}

const CONFETTI=["#EF4444","#F59E0B","#10B981","#3B82F6","#8B5CF6","#EC4899","#06B6D4","#F97316"];
function Burst(){
  const ps=Array.from({length:24},(_,i)=>({id:i,c:CONFETTI[i%CONFETTI.length],
    x:10+Math.random()*80,dl:Math.random()*0.6,sz:4+Math.random()*10,
    dur:1.2+Math.random()*1,rot:Math.random()*720,dx:(Math.random()-.5)*120}));
  return<div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
    {ps.map(p=><div key={p.id} className="absolute" style={{
      left:`${p.x}%`,bottom:"50%",width:p.sz,height:p.sz,background:p.c,opacity:0,
      borderRadius:Math.random()>.5?"50%":"2px",
      animation:`burst ${p.dur}s cubic-bezier(.15,.6,.35,1) ${p.dl}s forwards`,
      '--dx':`${p.dx}px`,'--rot':`${p.rot}deg`}}/>)}
    <style>{`@keyframes burst{0%{transform:translate(0,0) rotate(0) scale(1);opacity:1}60%{opacity:1}100%{transform:translate(var(--dx),-300px) rotate(var(--rot)) scale(.1);opacity:0}}`}</style>
  </div>;
}

function Timer({task,onDone,onCancel}){
  const c=CAT[task.category]||CAT.home;
  const[left,setLeft]=useState(task.estimated_min*60);
  const[run,setRun]=useState(true);
  const total=task.estimated_min*60,fin=left<=0,ref=useRef(null);
  useEffect(()=>{if(run&&left>0)ref.current=setInterval(()=>setLeft(s=>s-1),1000);return()=>clearInterval(ref.current);},[run,left]);
  const circ=2*Math.PI*90;
  return<div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8"
    style={{background:fin?"#064E3B":"#1E1B4B"}}>
    <p className="text-white/50 text-xs font-semibold uppercase tracking-[.25em] mb-2">{fin?"Done":"Focusing"}</p>
    <h2 className="text-white text-xl font-extrabold text-center mb-10 max-w-xs leading-snug">{task.name}</h2>
    <div className="relative w-44 h-44 mb-10">
      <svg className="w-44 h-44 -rotate-90" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
        <circle cx="100" cy="100" r="90" fill="none" stroke={fin?"#34D399":c.accent}
          strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ-circ*(1-left/total)}
          style={{transition:"stroke-dashoffset 1s linear"}}/>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {fin?<span className="text-4xl">&#10003;</span>:<span className="text-3xl font-extrabold text-white tabular-nums">{fmt(left)}</span>}
      </div>
    </div>
    {fin?<>
      <button onClick={onDone} className="w-full max-w-xs py-4 rounded-2xl bg-emerald-500 text-white font-extrabold active:scale-95 transition-transform">Complete</button>
      <button onClick={onCancel} className="text-white/30 text-sm mt-3">Not yet</button>
    </>:<>
      <div className="flex gap-3 w-full max-w-xs mb-3">
        <button onClick={()=>setRun(r=>!r)} className="flex-1 py-3 rounded-2xl bg-white/10 text-white text-sm font-bold">{run?"Pause":"Resume"}</button>
        <button onClick={()=>setLeft(s=>s+120)} className="py-3 px-5 rounded-2xl bg-white/10 text-white text-sm font-bold">+2m</button>
      </div>
      <button onClick={onDone} className="w-full max-w-xs py-3 rounded-2xl text-white/80 text-sm font-semibold" style={{background:c.accent}}>Done early</button>
      <button onClick={onCancel} className="text-white/20 text-xs mt-3">Cancel</button>
    </>}
  </div>;
}

export default function App(){
  const[user,setUser]=useState(()=>localStorage.getItem("hb-user")||null);
  const[nameIn,setNameIn]=useState("");
  const[tasks,setTasks]=useState([]);
  const[loading,setLoading]=useState(true);
  const[view,setView]=useState("today");
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
  const[picking,setPicking]=useState(false);
  const[completedToday,setCompletedToday]=useState([]);
  const[momentum,setMomentum]=useState(null); // task to suggest after completing

  const enableNotifs=async()=>{const s=await setupNotifications(user);setNotifStatus(s);};
  const load=useCallback(async()=>{
    const{data}=await supabase.from("tasks").select("*").eq("active",true).order("created_at");
    if(data)setTasks(data);setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{
    const ch=supabase.channel("rt").on("postgres_changes",{event:"*",schema:"public",table:"tasks"},()=>load()).subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[load]);

  // Daily assignments
  useEffect(()=>{
    if(!user||!tasks.length)return;
    const today=new Date().toDateString();
    const key=`hb-daily-${user}`;
    const stored=localStorage.getItem(key);
    const parsed=stored?JSON.parse(stored):null;
    if(parsed&&parsed.date===today){
      setDailyIds(parsed.ids.filter(id=>tasks.find(t=>t.id===id)));
    }else{
      const ids=selectDaily(tasks.map(enrich)).map(t=>t.id);
      localStorage.setItem(key,JSON.stringify({date:today,ids}));
      setDailyIds(ids);
    }
  },[user,tasks]);

  const saveDailyIds=ids=>{setDailyIds(ids);localStorage.setItem(`hb-daily-${user}`,JSON.stringify({date:new Date().toDateString(),ids}));};
  const shuffleDaily=idx=>{
    const enriched=tasks.map(enrich);
    const due=enriched.filter(t=>isDue(t)&&!dailyIds.includes(t.id));
    if(!due.length)return;
    const top=due.sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority))).slice(0,5);
    const newIds=[...dailyIds];newIds[idx]=top[Math.floor(Math.random()*top.length)].id;
    saveDailyIds(newIds);
  };
  const removeDaily=idx=>saveDailyIds(dailyIds.filter((_,i)=>i!==idx));

  const saveName=n=>{setUser(n);localStorage.setItem("hb-user",n);};
  const complete=async id=>{
    const now=new Date().toISOString();const task=tasks.find(t=>t.id===id);
    await supabase.from("tasks").update({last_completed:now,last_completed_by:user}).eq("id",id);
    await supabase.from("completions").insert({task_id:id,completed_by:user,completed_at:now});
    if(task)notifyCompletion(user,task.name);await load();
  };
  const handleDailyComplete=idx=>{
    const id=dailyIds[idx];if(!id)return;
    setCelebrating(idx);complete(id);
    setTimeout(()=>{
      setCelebrating(null);
      const remaining=dailyIds.filter((_,i)=>i!==idx);
      saveDailyIds(remaining);
      // Momentum: suggest next task if there are more due
      const enriched=tasks.map(enrich);
      const nextUp=enriched.filter(t=>isDue(t)&&!remaining.includes(t.id)&&t.id!==id)
        .sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));
      if(nextUp.length>0)setMomentum(nextUp[0]);
    },3000);
  };

  // Undo a completion
  const undoComplete=async(completionId,taskId)=>{
    await supabase.from("completions").delete().eq("id",completionId);
    // Find previous completion for this task
    const{data:prev}=await supabase.from("completions").select("*").eq("task_id",taskId).order("completed_at",{ascending:false}).limit(1);
    if(prev&&prev.length>0){
      await supabase.from("tasks").update({last_completed:prev[0].completed_at,last_completed_by:prev[0].completed_by}).eq("id",taskId);
    }else{
      await supabase.from("tasks").update({last_completed:null,last_completed_by:null}).eq("id",taskId);
    }
    // Add back to daily
    if(!dailyIds.includes(taskId))saveDailyIds([...dailyIds,taskId]);
    await load();
  };

  // Just 5 minutes
  const justFiveMin=()=>{
    const enriched=tasks.map(enrich);
    const pool=dailyTasks.length>0?dailyTasks:enriched.filter(isDue).sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));
    if(!pool.length)return;
    const pick=pool[0];
    setTimer({...pick,estimated_min:5,_originalMin:pick.estimated_min});
  };
  const rmTask=async id=>{await supabase.from("tasks").update({active:false}).eq("id",id);setDel(null);await load();};
  const upTask=async(id,u)=>{const f=u.frequency?FREQ.find(x=>x.v===u.frequency):null;
    const up={...u};if(f)up.frequency_days=f.d;await supabase.from("tasks").update(up).eq("id",id);setEdit(null);await load();};
  const addTask=async()=>{
    if(!nw.name.trim())return;const f=FREQ.find(x=>x.v===nw.frequency);
    await supabase.from("tasks").insert({name:nw.name.trim(),category:nw.category||cat||"home",frequency:nw.frequency,
      frequency_days:f.d,priority:nw.priority,estimated_min:nw.estimated_min});
    setNw({name:"",frequency:"weekly",priority:"medium",estimated_min:15,category:cat||"home"});setAdding(false);await load();};

  const now=new Date();
  const dateStr=`${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  const dailyTasks=dailyIds.map(id=>tasks.find(t=>t.id===id)).filter(Boolean).map(enrich);

  // Load completed today
  useEffect(()=>{
    const today=new Date();today.setHours(0,0,0,0);
    supabase.from("completions").select("*,tasks(name,category,estimated_min)")
      .gte("completed_at",today.toISOString()).order("completed_at",{ascending:false})
      .then(({data})=>{if(data)setCompletedToday(data);});
  },[tasks]);

  // Add a task to today
  const addToDaily=id=>{
    if(dailyIds.includes(id))return;
    saveDailyIds([...dailyIds,id]);
    setPicking(false);
  };

  // Available tasks to pick from
  const pickable=tasks.map(enrich).filter(t=>isDue(t)&&!dailyIds.includes(t.id))
    .sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));

  if(timer)return<Timer task={timer} onDone={()=>{complete(timer.id);setTimer(null);}} onCancel={()=>setTimer(null)}/>;

  // Quick Pick
  if(qp){
    const allDue=tasks.map(enrich).filter(isDue).sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));
    return<QuickPick allDue={allDue} onStart={t=>setTimer(t)} onClose={()=>setQp(false)}/>;
  }

  // Name entry
  if(!user)return(
    <div className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight text-center">Home Base</h1>
        <p className="text-stone-400 mt-1 text-sm font-medium text-center mb-8">Your shared home command center</p>
        <input type="text" value={nameIn} onChange={e=>setNameIn(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&nameIn.trim()&&saveName(nameIn.trim())}
          placeholder="Your first name" autoFocus
          className="w-full px-5 py-4 rounded-2xl border-2 border-stone-200 text-lg font-semibold text-stone-900 focus:outline-none focus:border-stone-900 transition-colors text-center"/>
        <button onClick={()=>nameIn.trim()&&saveName(nameIn.trim())} disabled={!nameIn.trim()}
          className="w-full mt-3 py-4 rounded-2xl bg-stone-900 text-white font-extrabold disabled:opacity-30 active:scale-[0.98] transition-all text-base">
          Start</button>
      </div></div>
  );
  if(loading)return<div className="min-h-screen flex items-center justify-center bg-white"><p className="text-stone-300 text-sm">Loading...</p></div>;

  // Manage view
  if(view==="manage"){
    const mc=cat||"home";const theme=CAT[mc];
    const all=tasks.filter(t=>t.category===mc).map(enrich);
    return<div className="min-h-screen bg-white pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-stone-100 px-5 pt-5 pb-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <button onClick={()=>{setView("today");setCat(null);}} className="text-base font-semibold text-stone-400">&#8592; Back</button>
            <button onClick={()=>setAdding(true)} className="text-base font-bold" style={{color:theme.accent}}>+ Add</button>
          </div>
          <div className="flex gap-2 mt-3">
            {Object.entries(CAT).map(([k,c])=><button key={k} onClick={()=>setCat(k)}
              className="px-4 py-2 rounded-full text-sm font-bold transition-all"
              style={mc===k?{background:c.accent,color:"#fff"}:{background:c.light,color:c.accent}}>{c.icon} {c.label}</button>)}
          </div>
        </div></div>
      <div className="px-5 max-w-lg mx-auto mt-4 space-y-2">
        {adding&&<AddForm nw={nw} setNw={setNw} theme={theme} onAdd={addTask} onCancel={()=>setAdding(false)}/>}
        {all.length===0&&!adding&&<p className="text-center text-stone-300 text-sm py-10">No tasks. Tap + Add.</p>}
        {all.map(t=><div key={t.id} className="py-3 border-b border-stone-100">
          {edit===t.id?<EditInline task={t} theme={theme} onSave={u=>upTask(t.id,u)} onCancel={()=>setEdit(null)}/>:<>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-stone-800">{t.name}</p>
                <p className="text-sm text-stone-400 mt-0.5">{FREQ.find(f=>f.v===t.frequency)?.l} &middot; {t.estimated_min}m &middot;
                  <span className={t.s==="overdue"?" text-red-600 font-semibold":t.s==="due"?" text-amber-600":" text-emerald-600"}> {t.l}</span></p>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>setEdit(t.id)} className="text-sm text-stone-300 font-medium">Edit</button>
                <button onClick={()=>setDel(del===t.id?null:t.id)} className="text-sm text-stone-300 font-medium">Del</button>
              </div>
            </div>
            {del===t.id&&<div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-red-600 font-semibold">Remove?</span>
              <button onClick={()=>rmTask(t.id)} className="text-xs text-red-600 font-bold">Yes</button>
              <button onClick={()=>setDel(null)} className="text-xs text-stone-400">No</button>
            </div>}
          </>}
        </div>)}
      </div></div>;
  }

  // TODAY VIEW
  return(
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-5 pt-6 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-sm font-semibold text-stone-400 uppercase tracking-wider">{dateStr}</p>
          <div className="flex gap-2">
            {notifStatus==="default"&&<button onClick={enableNotifs} className="text-sm font-semibold text-stone-400 active:text-stone-600">&#128276;</button>}
            <button onClick={()=>setQp(true)} className="text-sm font-bold text-stone-900 bg-stone-100 px-4 py-1.5 rounded-full active:bg-stone-200">&#9889; Got time?</button>
          </div>
        </div>
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">Today, {user}</h1>

        {/* Progress bar */}
        {(completedToday.length>0||dailyTasks.length>0)&&<div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-stone-400">{completedToday.length} done{dailyTasks.length>0?` / ${completedToday.length+dailyTasks.length} total`:""}</span>
          </div>
          <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{width:`${completedToday.length+dailyTasks.length>0?Math.round(completedToday.length/(completedToday.length+dailyTasks.length)*100):0}%`}}/>
          </div>
        </div>}

        {/* Just 5 minutes */}
        {dailyTasks.length>0&&<button onClick={justFiveMin}
          className="w-full mt-4 py-3.5 rounded-2xl bg-stone-900 text-white text-base font-extrabold active:scale-[0.98] transition-all">
          Just 5 minutes &#9889;
        </button>}

        {/* Momentum prompt */}
        {momentum&&<div className="mt-4 rounded-2xl bg-emerald-50 border-2 border-emerald-100 p-5">
          <p className="text-sm font-bold text-emerald-800 mb-1">Nice work! Keep going?</p>
          <p className="text-base font-extrabold text-emerald-900">{momentum.name}</p>
          <p className="text-xs text-emerald-600 mt-1">{CAT[momentum.category]?.icon} {CAT[momentum.category]?.label} &middot; {momentum.estimated_min}m</p>
          <div className="flex gap-2 mt-3">
            <button onClick={()=>{addToDaily(momentum.id);setTimer(momentum);setMomentum(null);}}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold active:scale-95">Go &#9654;</button>
            <button onClick={()=>setMomentum(null)}
              className="flex-1 py-2.5 rounded-xl border-2 border-emerald-200 text-sm font-bold text-emerald-700 active:bg-emerald-100">Done for now</button>
          </div>
        </div>}

        {/* Daily tasks */}
        <div className="mt-4 space-y-2.5">
          {dailyTasks.length===0&&!picking?
            <div className="py-10 text-center">
              <p className="text-stone-400 text-base font-medium">Nothing assigned yet.</p></div>
          :dailyTasks.map((task,idx)=>{
            const c=CAT[task.category]||CAT.home;
            const isCel=celebrating===idx;
            return<div key={task.id} className="relative">
              {isCel&&<Burst/>}
              <div
                onClick={()=>!isCel&&handleDailyComplete(idx)}
                className={`rounded-2xl px-6 py-5 transition-all duration-300 cursor-pointer relative overflow-hidden ${isCel?"scale-[1.02]":""}`}
                style={{background:isCel?"#059669":c.card,transition:"all 0.3s ease"}}>

                {isCel?<div className="flex items-center justify-center py-5">
                  <span className="text-white text-5xl font-black">&#10003;</span>
                </div>:<>
                  <p className="text-white/60 text-sm font-semibold mb-1.5">{c.icon} {c.label} &middot; {task.estimated_min} min</p>
                  <p className="text-white text-xl font-extrabold leading-snug">{task.name}</p>
                  <div className="flex items-center gap-4 mt-3" onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>shuffleDaily(idx)} className="text-white/50 text-sm font-semibold active:text-white/80">&#8634; Shuffle</button>
                    <button onClick={()=>setTimer(task)} className="text-white/50 text-sm font-semibold active:text-white/80">&#9654; Timer</button>
                    <button onClick={()=>removeDaily(idx)} className="text-white/30 text-sm font-semibold active:text-white/60">&#10005;</button>
                  </div>
                </>}
              </div>
            </div>;})}

          {/* Add to today button */}
          <button onClick={()=>setPicking(!picking)}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-stone-200 text-sm font-bold text-stone-400 active:bg-stone-50 transition-all">
            {picking?"Cancel":"+ Add task to today"}
          </button>
        </div>

        {/* Task picker */}
        {picking&&<div className="mt-3 bg-stone-50 rounded-2xl p-4">
          {pickable.length===0?<p className="text-sm text-stone-400 text-center py-4">No more due tasks to add.</p>
          :<div className="space-y-1">
            {pickable.map(t=>{const c=CAT[t.category]||CAT.home;return(
              <button key={t.id} onClick={()=>addToDaily(t.id)}
                className="w-full text-left px-4 py-3 rounded-xl active:bg-white transition-all flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-800">{t.name}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{c.icon} {c.label} &middot; {t.estimated_min}m &middot; <span className={t.s==="overdue"?"text-red-600 font-semibold":t.s==="due"?"text-amber-600":"text-stone-400"}>{t.l}</span></p>
                </div>
                <span className="text-stone-300 text-lg">+</span>
              </button>
            );})}
          </div>}
        </div>}

        {/* Completed today */}
        {completedToday.length>0&&<div className="mt-6">
          <p className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-2">Done today</p>
          <div className="space-y-1">
            {completedToday.map(c=>{const cat=CAT[c.tasks?.category]||CAT.home;return(
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-stone-50">
                <span className="text-emerald-500 font-bold">&#10003;</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-500">{c.tasks?.name||"Task"}</p>
                </div>
                <button onClick={()=>undoComplete(c.id,c.task_id)} className="text-xs text-stone-300 font-semibold active:text-stone-500">Undo</button>
              </div>
            );})}
          </div>
        </div>}

        {/* Category nav */}
        <div className="mt-6 grid grid-cols-3 gap-2.5">
          {Object.entries(CAT).map(([k,c])=>{
            const n=tasks.filter(t=>t.category===k).map(enrich).filter(isDue).length;
            return<button key={k} onClick={()=>{setCat(k);setView("manage");setAdding(false);}}
              className="rounded-2xl p-4 text-left active:scale-95 transition-all" style={{background:c.light}}>
              <p className="text-sm font-extrabold" style={{color:c.accent}}>{c.icon} {c.label}</p>
              <p className="text-xs font-semibold mt-0.5" style={{color:c.accent,opacity:.6}}>{n>0?`${n} due`:"Clear"}</p>
            </button>;})}
        </div>
      </div>
    </div>
  );
}

function QuickPick({allDue,onStart,onClose}){
  const[min,setMin]=useState(null);
  const avail=min?allDue.filter(t=>t.estimated_min<=min).slice(0,2):[];
  return<div className="min-h-screen bg-white">
    <div className="max-w-lg mx-auto px-5 pt-6 pb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-extrabold text-stone-900">&#9889; Got time?</h2>
        <button onClick={onClose} className="text-base text-stone-400 font-semibold">Back</button></div>
      <div className="flex flex-wrap gap-2.5 mb-6">
        {SLOTS.map(t=><button key={t} onClick={()=>setMin(t)} className="px-5 py-3 rounded-xl text-base font-bold transition-all active:scale-95"
          style={min===t?{background:"#1C1917",color:"#fff"}:{background:"#F5F5F4",color:"#44403C"}}>{t}m</button>)}
      </div>
      {min&&!avail.length&&<p className="text-center text-stone-400 text-base py-10">Nothing due that fits.</p>}
      {avail.map((t,i)=>{const c=CAT[t.category]||CAT.home;return<button key={t.id} onClick={()=>onStart(t)}
        className="w-full mb-3 text-left rounded-2xl px-6 py-5 active:scale-[0.97] transition-all" style={{background:c.card}}>
        <p className="text-white/60 text-sm font-semibold mb-1">{c.icon} {c.label} &middot; {t.estimated_min} min</p>
        <p className="text-white text-xl font-extrabold">{t.name}</p>
      </button>;})}
    </div></div>;
}

function AddForm({nw,setNw,theme,onAdd,onCancel}){
  return<div className="bg-white rounded-2xl border-2 border-stone-100 p-5 mb-4">
    <input value={nw.name} onChange={e=>setNw({...nw,name:e.target.value})} placeholder="Task name" autoFocus
      className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 text-sm font-semibold mb-3 focus:outline-none focus:border-stone-900"/>
    <p className="text-xs font-semibold text-stone-400 mb-1.5">Time</p>
    <div className="flex flex-wrap gap-1.5 mb-3">{[5,10,15,20,30,45].map(m=>
      <button key={m} onClick={()=>setNw({...nw,estimated_min:m})} className="px-3 py-1.5 rounded-full text-xs font-bold"
        style={nw.estimated_min===m?{background:theme.accent,color:"#fff"}:{background:"#F5F5F4",color:"#78716C"}}>{m}m</button>)}</div>
    <p className="text-xs font-semibold text-stone-400 mb-1.5">Frequency</p>
    <div className="flex flex-wrap gap-1.5 mb-3">{FREQ.map(f=>
      <button key={f.v} onClick={()=>setNw({...nw,frequency:f.v})} className="px-3 py-1.5 rounded-full text-xs font-bold"
        style={nw.frequency===f.v?{background:theme.accent,color:"#fff"}:{background:"#F5F5F4",color:"#78716C"}}>{f.l}</button>)}</div>
    <p className="text-xs font-semibold text-stone-400 mb-1.5">Priority</p>
    <div className="flex gap-1.5 mb-4">{PRIS.map(p=>
      <button key={p} onClick={()=>setNw({...nw,priority:p})}
        className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize ${nw.priority===p?PRI_C[p].p:"bg-stone-100 text-stone-400"}`}>{p}</button>)}</div>
    <div className="flex gap-3">
      <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border-2 border-stone-200 text-sm font-bold text-stone-500">Cancel</button>
      <button onClick={onAdd} disabled={!nw.name.trim()} className="flex-1 py-2.5 rounded-xl text-white text-sm font-extrabold disabled:opacity-30"
        style={{background:theme.accent}}>Add</button></div>
  </div>;
}

function EditInline({task,theme,onSave,onCancel}){
  const[n,setN]=useState(task.name);const[f,setF]=useState(task.frequency);
  const[p,setP]=useState(task.priority);const[e,setE]=useState(task.estimated_min);
  return<div className="space-y-3 py-2">
    <input value={n} onChange={ev=>setN(ev.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-200 text-sm font-semibold focus:outline-none focus:border-stone-900"/>
    <div className="flex items-center gap-2"><span className="text-xs text-stone-400 font-semibold">Time:</span>
      <input type="number" value={e} onChange={ev=>setE(parseInt(ev.target.value)||1)} className="w-14 px-2 py-1.5 rounded-lg border-2 border-stone-200 text-sm font-bold focus:outline-none text-center"/><span className="text-xs text-stone-400">min</span></div>
    <div className="flex flex-wrap gap-1.5">{FREQ.map(x=>
      <button key={x.v} onClick={()=>setF(x.v)} className="px-2.5 py-1 rounded-full text-xs font-bold"
        style={f===x.v?{background:theme.accent,color:"#fff"}:{background:"#F5F5F4",color:"#78716C"}}>{x.l}</button>)}</div>
    <div className="flex gap-1.5">{PRIS.map(x=>
      <button key={x} onClick={()=>setP(x)} className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${p===x?PRI_C[x].p:"bg-stone-100 text-stone-400"}`}>{x}</button>)}</div>
    <div className="flex gap-2"><button onClick={onCancel} className="text-xs px-4 py-2 rounded-xl border-2 border-stone-200 text-stone-400 font-semibold">Cancel</button>
      <button onClick={()=>onSave({name:n,frequency:f,priority:p,estimated_min:e})} className="text-xs px-4 py-2 rounded-xl text-white font-bold" style={{background:theme.accent}}>Save</button></div>
  </div>;
}
