import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import { setupNotifications, notifyCompletion, getNotificationStatus } from "./notifications.js";

const FREQ=[
  {v:"once",l:"One-time",d:0},
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
    card:"linear-gradient(135deg,#EC4899,#BE185D)",accent:"#BE185D",hdr:"#9D174D",light:"#FDF2F8"},
  admin:{label:"Life Admin",icon:"\u{1F4CB}",
    card:"linear-gradient(135deg,#2563EB,#1D4ED8)",accent:"#1D4ED8",hdr:"#1E40AF",light:"#EFF6FF"},
  personal:{label:"Projects",icon:"\u{1F680}",
    card:"linear-gradient(135deg,#16A34A,#15803D)",accent:"#15803D",hdr:"#166534",light:"#F0FDF4"},
};
const PRI_C={high:{b:"#DC2626",p:"bg-red-50 text-red-700"},medium:{b:"#D97706",p:"bg-amber-50 text-amber-700"},low:{b:"#2563EB",p:"bg-blue-50 text-blue-700"}};

function getStat(t){
  if(!t.last_completed)return{s:"due",l:"Not done yet",u:100};
  if(t.frequency_days===0)return{s:"ok",l:"Done",u:-1};
  const last=new Date(t.last_completed);const today=new Date();
  last.setHours(0,0,0,0);today.setHours(0,0,0,0);
  const e=Math.round((today-last)/864e5),r=t.frequency_days-e;
  if(r<=0)return{s:"overdue",l:`${Math.abs(r)}d overdue`,u:200+Math.abs(r)};
  if(r<=Math.max(1,t.frequency_days*.25))return{s:"soon",l:`Due in ${r}d`,u:50};
  return{s:"ok",l:`${r}d left`,u:0};
}
function pw(p){return p==="high"?30:p==="medium"?20:10;}
function fmt(s){return`${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;}
function enrich(t){const st=getStat(t);return{...t,s:st.s,l:st.l,u:st.u};}
function isDue(t){return["overdue","due","soon"].includes(t.s);}

function selectDaily(tasks,user){
  const mine=tasks.filter(t=>!t.assigned_to||t.assigned_to===user);
  const due=mine.filter(isDue).sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));
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
  const[nw,setNw]=useState({name:"",frequency:"weekly",priority:"medium",estimated_min:15,category:"home",assigned_to:null});
  const[edit,setEdit]=useState(null);
  const[del,setDel]=useState(null);
  const[celebrating,setCelebrating]=useState(null);
  const[dailyIds,setDailyIds]=useState([]);
  const[notifStatus,setNotifStatus]=useState(()=>getNotificationStatus());
  const[picking,setPicking]=useState(false);
  const[completedToday,setCompletedToday]=useState([]);
  const[momentum,setMomentum]=useState(null);
  const[captureText,setCaptureText]=useState("");
  const[streak,setStreak]=useState(0);
  const[shopItems,setShopItems]=useState([]);
  const[shopInput,setShopInput]=useState("");
  const[knownUsers,setKnownUsers]=useState([]);

  // Discover all users who have signed in
  useEffect(()=>{
    supabase.from("push_subscriptions").select("user_name").then(({data})=>{
      if(data){
        const names=[...new Set(data.map(d=>d.user_name))].filter(Boolean);
        setKnownUsers(names);
      }
    });
  },[]);

  const enableNotifs=async()=>{const s=await setupNotifications(user);setNotifStatus(s);};
  const load=useCallback(async()=>{
    const{data}=await supabase.from("tasks").select("*").eq("active",true).order("created_at");
    if(data)setTasks(data);setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const loadShop=useCallback(async()=>{
    const{data}=await supabase.from("shopping_items").select("*").order("completed").order("created_at",{ascending:false});
    if(data)setShopItems(data);
  },[]);
  useEffect(()=>{loadShop();},[loadShop]);

  useEffect(()=>{
    const ch=supabase.channel("rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},()=>load())
      .on("postgres_changes",{event:"*",schema:"public",table:"shopping_items"},()=>loadShop())
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[load,loadShop]);

  // Daily assignments
  useEffect(()=>{
    if(!user||!tasks.length)return;
    const today=new Date().toDateString();
    const key=`hb-daily-${user}`;
    const stored=localStorage.getItem(key);
    const parsed=stored?JSON.parse(stored):null;
    if(parsed&&parsed.date===today){
      const valid=parsed.ids.filter(id=>tasks.find(t=>t.id===id));
      if(valid.length>0){setDailyIds(valid);return;}
    }
    // Generate fresh daily tasks
    const ids=selectDaily(tasks.map(enrich),user).map(t=>t.id);
    localStorage.setItem(key,JSON.stringify({date:today,ids}));
    setDailyIds(ids);
  },[user,tasks]);

  const saveDailyIds=ids=>{setDailyIds(ids);localStorage.setItem(`hb-daily-${user}`,JSON.stringify({date:new Date().toDateString(),ids}));};
  const shuffleDaily=idx=>{
    const enriched=tasks.map(enrich);
    const due=enriched.filter(t=>isDue(t)&&!dailyIds.includes(t.id)&&(!t.assigned_to||t.assigned_to===user));
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
      const nextUp=enriched.filter(t=>isDue(t)&&!remaining.includes(t.id)&&t.id!==id&&(!t.assigned_to||t.assigned_to===user))
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

  // Smart task parser
  const parseTask=(text)=>{
    const lo=text.toLowerCase();

    // Category
    const hw=['clean','vacuum','mop','dust','laundry','dishes','kitchen','bathroom','bed','trash','fridge','oven','window','plant','water','garden','organiz','declutter','tidy','sweep','scrub','wipe','wash','sheets','toilet','shower','counter','floor','appliance','mirror','garbage','recycl','pantry','closet','garage','gutter','lawn','iron'];
    const aw=['bill','pay','budget','financ','appointment','doctor','dentist','insurance','tax','mail','package','document','file','renew','cancel','subscri','bank','call','email','schedule','passport','license','registr','invoice','receipt','paper','pharmacy','prescri','grocer','errand','return','refund','booking','reservation'];
    const pw2=['read','write','exercise','workout','gym','meditat','journal','learn','study','project','hobby','practice','goal','run ','yoga','paint','draw','music','code','course','blog','podcast','book','skill','language','stretch'];

    const hs=hw.filter(w=>lo.includes(w)).length;
    const as=aw.filter(w=>lo.includes(w)).length;
    const ps=pw2.filter(w=>lo.includes(w)).length;
    let category=as>=hs&&as>=ps?"admin":ps>hs&&ps>as?"personal":"home";
    if(hs===0&&as===0&&ps===0)category="admin";

    // Frequency
    let frequency="weekly",frequency_days=7;
    if(/every\s*day|daily|each\s*day|every\s*morning|every\s*night|every\s*evening/i.test(lo)){frequency="daily";frequency_days=1;}
    else if(/twice\s*(a\s*)?week|2x?\s*(a\s*)?week|two\s*times?\s*(a\s*)?week/i.test(lo)){frequency="twice_weekly";frequency_days=3;}
    else if(/every\s*(two|2)\s*weeks?|fortnightly|bi[\s-]?weekly|every\s*other\s*week/i.test(lo)){frequency="biweekly";frequency_days=14;}
    else if(/monthly|every\s*month|once\s*a\s*month/i.test(lo)){frequency="monthly";frequency_days=30;}
    else if(/quarterly|every\s*(3|three)\s*months?|every\s*quarter/i.test(lo)){frequency="quarterly";frequency_days=90;}
    else if(/weekly|every\s*week|once\s*a\s*week/i.test(lo)){frequency="weekly";frequency_days=7;}

    // Explicit time mention
    let estimated_min=null;
    const timeMatch=lo.match(/(\d+)\s*(?:min|minute|mins|minutes)/);
    if(timeMatch)estimated_min=parseInt(timeMatch[1]);
    const hrMatch=lo.match(/(\d+)\s*(?:hr|hour|hours)/);
    if(hrMatch)estimated_min=(parseInt(hrMatch[1]))*60;

    // Estimate time from task type if not explicit
    if(!estimated_min){
      const q=['water','trash','mail','check','sort','wipe','put away','tidy','take out','pick up'];
      const s=['dust','counter','mirror','plant','iron','fold','make bed','sweep'];
      const m=['vacuum','mop','laundry','file','budget','organiz','dishes','grocery','errand','workout','exercise','stretch'];
      const l=['bathroom','deep clean','window','oven','declutter','garage','closet','gutter','lawn'];
      if(q.some(w=>lo.includes(w)))estimated_min=5;
      else if(s.some(w=>lo.includes(w)))estimated_min=10;
      else if(m.some(w=>lo.includes(w)))estimated_min=20;
      else if(l.some(w=>lo.includes(w)))estimated_min=30;
      else estimated_min=15;
    }

    // Priority
    let priority="medium";
    if(/urgent|important|asap|critical|must|need to/i.test(lo)||frequency==="daily")priority="high";
    else if(/whenever|sometime|eventually|low|no rush|when i can/i.test(lo)||frequency==="quarterly")priority="low";

    // Detect "today" - should assign to today's list
    const isToday=/\btoday\b|right now|this morning|this evening|this afternoon|tonight/i.test(lo);

    // Clean task name - remove frequency/time phrases and "today"
    let name=text
      .replace(/\b(every\s*day|daily|each\s*day|every\s*morning|every\s*night|every\s*evening|twice\s*(a\s*)?week|2x?\s*(a\s*)?week|two\s*times?\s*(a\s*)?week|every\s*(two|2)\s*weeks?|fortnightly|bi[\s-]?weekly|every\s*other\s*week|monthly|every\s*month|once\s*a\s*month|quarterly|every\s*(3|three)\s*months?|every\s*quarter|weekly|every\s*week|once\s*a\s*week)\b/gi,'')
      .replace(/\b\d+\s*(?:min(?:ute)?s?|hr|hours?)\b/gi,'')
      .replace(/\b(takes?|about|around|roughly|approximately|urgent|asap|important|no rush|whenever|eventually|today|right now|this morning|this evening|this afternoon|tonight)\b/gi,'')
      .replace(/[,\s]+$/,'').replace(/^\s+/,'').replace(/\s{2,}/g,' ').trim();
    if(name)name=name.charAt(0).toUpperCase()+name.slice(1);
    else name=text.trim().charAt(0).toUpperCase()+text.trim().slice(1);

    return{name,category,frequency,frequency_days,priority,estimated_min,isToday};
  };

  // Quick capture with smart parsing
  const quickCapture=async()=>{
    if(!captureText.trim())return;
    const parsed=parseTask(captureText);
    const{isToday,...taskData}=parsed;
    const{data}=await supabase.from("tasks").insert(taskData).select();
    setCaptureText("");
    await load();
    // If "today" was mentioned, add to daily list
    if(isToday&&data&&data[0]){
      saveDailyIds([...dailyIds,data[0].id]);
    }
  };

  // Shopping list functions
  const addShopItem=async()=>{
    if(!shopInput.trim())return;
    await supabase.from("shopping_items").insert({name:shopInput.trim(),added_by:user});
    setShopInput("");await loadShop();
  };
  const toggleShopItem=async(id,completed)=>{
    await supabase.from("shopping_items").update({
      completed:!completed,completed_by:!completed?user:null,
      completed_at:!completed?new Date().toISOString():null
    }).eq("id",id);
    await loadShop();
  };
  const removeShopItem=async(id)=>{
    await supabase.from("shopping_items").delete().eq("id",id);
    await loadShop();
  };
  const clearCompletedShop=async()=>{
    await supabase.from("shopping_items").delete().eq("completed",true);
    await loadShop();
  };

  // Task stats calculator (ignores first cycle)
  const getTaskStats=(task)=>{
    const history=(task.history||[]).length>0?task.history:
      completedToday.filter(c=>c.task_id===task.id).map(c=>({date:c.completed_at,by:c.completed_by}));
    // Need at least 2 completions to calculate stats (first one establishes baseline)
    if(!task.completions_data||task.completions_data.length<2)return null;
    const sorted=task.completions_data.sort((a,b)=>new Date(a)-new Date(b));
    const gaps=[];
    for(let i=1;i<sorted.length;i++){
      const d1=new Date(sorted[i-1]);d1.setHours(0,0,0,0);
      const d2=new Date(sorted[i]);d2.setHours(0,0,0,0);
      gaps.push(Math.round((d2-d1)/864e5));
    }
    if(!gaps.length)return null;
    const avg=Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length);
    const target=task.frequency_days;
    if(target===0)return{status:"done",label:"Completed"};
    const diff=avg-target;
    return{
      avg,target,completions:sorted.length,
      status:diff<=1?"on-track":diff<=target*0.5?"slightly-late":"often-late",
      label:diff<=1?`On track (avg ${avg}d)`:diff<=target*0.5?`Slightly late (avg ${avg}d vs ${target}d)`:`Often late (avg ${avg}d vs ${target}d)`
    };
  };

  // Streak calculation
  useEffect(()=>{
    if(!user)return;
    supabase.from("completions").select("completed_at").eq("completed_by",user)
      .order("completed_at",{ascending:false}).limit(200)
      .then(({data})=>{
        if(!data||!data.length){setStreak(0);return;}
        const days=new Set(data.map(c=>new Date(c.completed_at).toDateString()));
        let count=0;
        const d=new Date();
        // Check if today has completions, if not start from yesterday
        if(!days.has(d.toDateString())){
          d.setDate(d.getDate()-1);
          if(!days.has(d.toDateString())){setStreak(0);return;}
        }
        while(days.has(d.toDateString())){count++;d.setDate(d.getDate()-1);}
        setStreak(count);
      });
  },[user,completedToday]);
  const rmTask=async id=>{await supabase.from("tasks").update({active:false}).eq("id",id);setDel(null);await load();};
  const upTask=async(id,u)=>{const f=u.frequency?FREQ.find(x=>x.v===u.frequency):null;
    const up={...u};if(f)up.frequency_days=f.d;await supabase.from("tasks").update(up).eq("id",id);setEdit(null);await load();};
  const addTask=async()=>{
    if(!nw.name.trim())return;const f=FREQ.find(x=>x.v===nw.frequency);
    const ins={name:nw.name.trim(),category:nw.category||cat||"home",frequency:nw.frequency,
      frequency_days:f.d,priority:nw.priority,estimated_min:nw.estimated_min};
    if(nw.assigned_to)ins.assigned_to=nw.assigned_to;
    await supabase.from("tasks").insert(ins);
    setNw({name:"",frequency:"weekly",priority:"medium",estimated_min:15,category:cat||"home",assigned_to:null});setAdding(false);await load();};

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

  // Available tasks to pick from (exclude already completed today)
  const completedTodayIds=new Set(completedToday.map(c=>c.task_id));
  const pickable=tasks.map(enrich).filter(t=>isDue(t)&&!dailyIds.includes(t.id)&&!completedTodayIds.has(t.id)&&(!t.assigned_to||t.assigned_to===user))
    .sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));

  if(timer)return<Timer task={timer} onDone={()=>{complete(timer.id);setTimer(null);}} onCancel={()=>setTimer(null)}/>;

  // Quick Pick
  if(qp){
    const allDue=tasks.map(enrich).filter(t=>isDue(t)&&(!t.assigned_to||t.assigned_to===user)).sort((a,b)=>(b.u+pw(b.priority))-(a.u+pw(a.priority)));
    return<QuickPick allDue={allDue} onStart={t=>setTimer(t)} onClose={()=>setQp(false)}/>;
  }

  // Name entry
  if(!user)return(
    <div className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">Home Base</h1>
        <p className="text-stone-400 mt-1 text-sm font-medium text-center mb-8">GDKP command center</p>
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
        {adding&&<AddForm nw={nw} setNw={setNw} theme={theme} onAdd={addTask} onCancel={()=>setAdding(false)} user={user} knownUsers={knownUsers}/>}
        {all.length===0&&!adding&&<p className="text-center text-stone-300 text-sm py-10">No tasks. Tap + Add.</p>}
        {all.map(t=><div key={t.id} className="py-3 border-b border-stone-100">
          {edit===t.id?<EditInline task={t} theme={theme} onSave={u=>upTask(t.id,u)} onCancel={()=>setEdit(null)} user={user} knownUsers={knownUsers}/>:<>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-stone-800">{t.name}{t.assigned_to?<span className="text-xs font-medium text-stone-300 ml-2">({t.assigned_to} only)</span>:""}</p>
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

  // SHOPPING LIST VIEW
  if(view==="shop"){
    const pending=shopItems.filter(s=>!s.completed);
    const done=shopItems.filter(s=>s.completed);
    return<div className="min-h-screen bg-white" style={{paddingTop:"env(safe-area-inset-top)"}}>
      <div className="max-w-lg mx-auto px-5 pt-10 pb-8">
        <div className="flex items-center justify-between mb-4">
          <button onClick={()=>setView("today")} className="text-base font-semibold text-stone-400">&#8592; Back</button>
          {done.length>0&&<button onClick={clearCompletedShop} className="text-sm font-semibold text-stone-300">Clear done</button>}
        </div>
        <h1 className="text-2xl font-black text-stone-900 mb-4">&#128722; Shopping List</h1>
        <div className="flex gap-2 mb-4">
          <input value={shopInput} onChange={e=>setShopInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addShopItem()}
            placeholder="Add an item..."
            className="flex-1 px-4 py-3 rounded-2xl bg-stone-50 border-2 border-stone-100 text-sm font-medium text-stone-800 focus:outline-none focus:border-stone-300 placeholder:text-stone-300"/>
          {shopInput.trim()&&<button onClick={addShopItem}
            className="px-4 py-3 rounded-2xl bg-stone-900 text-white text-sm font-bold active:scale-95">Add</button>}
        </div>
        {pending.length===0&&done.length===0&&<p className="text-center text-stone-300 text-sm py-10">List is empty. Add some items.</p>}
        <div className="space-y-1">
          {pending.map(item=>(
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl active:bg-stone-50 transition-colors">
              <button onClick={()=>toggleShopItem(item.id,item.completed)}
                className="w-6 h-6 rounded-full border-2 border-stone-300 flex-shrink-0 active:scale-90 transition-all"/>
              <span className="text-base font-medium text-stone-800 flex-1">{item.name}</span>
              <button onClick={()=>removeShopItem(item.id)} className="text-stone-200 text-sm active:text-stone-400">&#10005;</button>
            </div>
          ))}
        </div>
        {done.length>0&&<div className="mt-4 pt-3 border-t border-stone-100">
          <p className="text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">Got it</p>
          {done.map(item=>(
            <div key={item.id} className="flex items-center gap-3 px-4 py-2 rounded-xl">
              <button onClick={()=>toggleShopItem(item.id,item.completed)}
                className="w-6 h-6 rounded-full bg-emerald-500 flex-shrink-0 flex items-center justify-center active:scale-90">
                <span className="text-white text-xs font-bold">&#10003;</span></button>
              <span className="text-sm text-stone-400 line-through flex-1">{item.name}</span>
              <span className="text-xs text-stone-300">{item.completed_by}</span>
            </div>
          ))}
        </div>}
      </div></div>;
  }

  // STATS VIEW
  if(view==="stats"){
    const[statsData,setStatsData]=useState(null);
    useEffect(()=>{
      supabase.from("completions").select("task_id,completed_at").order("completed_at")
        .then(({data})=>{
          if(!data)return;
          const byTask={};
          data.forEach(c=>{
            if(!byTask[c.task_id])byTask[c.task_id]=[];
            byTask[c.task_id].push(c.completed_at);
          });
          setStatsData(byTask);
        });
    },[]);
    const allTasks=tasks.map(enrich).filter(t=>(!t.assigned_to||t.assigned_to===user));
    return<div className="min-h-screen bg-white" style={{paddingTop:"env(safe-area-inset-top)"}}>
      <div className="max-w-lg mx-auto px-5 pt-10 pb-8">
        <div className="flex items-center justify-between mb-4">
          <button onClick={()=>setView("today")} className="text-base font-semibold text-stone-400">&#8592; Back</button>
        </div>
        <h1 className="text-2xl font-black text-stone-900 mb-1">&#128202; Task Stats</h1>
        <p className="text-sm text-stone-400 mb-4">Based on your completion history (first cycle excluded)</p>
        {!statsData?<p className="text-center text-stone-300 text-sm py-10">Loading...</p>:
        <div className="space-y-2">
          {allTasks.filter(t=>t.frequency_days>0).map(t=>{
            const completions=statsData[t.id]||[];
            if(completions.length<2)return(
              <div key={t.id} className="py-3 border-b border-stone-100">
                <p className="text-sm font-semibold text-stone-800">{t.name}</p>
                <p className="text-xs text-stone-300 mt-0.5">{completions.length===0?"No data yet":"Needs more completions for stats"}</p>
              </div>
            );
            const sorted=[...completions].sort((a,b)=>new Date(a)-new Date(b));
            const gaps=[];
            for(let i=1;i<sorted.length;i++){
              const d1=new Date(sorted[i-1]);d1.setHours(0,0,0,0);
              const d2=new Date(sorted[i]);d2.setHours(0,0,0,0);
              gaps.push(Math.round((d2-d1)/864e5));
            }
            const avg=Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length);
            const target=t.frequency_days;
            const diff=avg-target;
            const status=diff<=1?"on-track":diff<=target*0.5?"slightly-late":"often-late";
            const colors={
              "on-track":{bg:"bg-emerald-50",text:"text-emerald-700",dot:"bg-emerald-500"},
              "slightly-late":{bg:"bg-amber-50",text:"text-amber-700",dot:"bg-amber-500"},
              "often-late":{bg:"bg-red-50",text:"text-red-700",dot:"bg-red-500"},
            };
            const c=colors[status];
            return(
              <div key={t.id} className={`py-3 px-4 rounded-xl ${c.bg} border-b border-stone-100`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-stone-800">{t.name}</p>
                  <div className={`w-2 h-2 rounded-full ${c.dot}`}/>
                </div>
                <p className={`text-xs font-semibold mt-1 ${c.text}`}>
                  {status==="on-track"?`On track`:status==="slightly-late"?"Slightly late":"Often late"}
                  {" \u00B7 "}avg {avg}d vs target {target}d {" \u00B7 "}{sorted.length} completions
                </p>
              </div>
            );
          })}
        </div>}
      </div></div>;
  }

  // TODAY VIEW
  return(
    <div className="min-h-screen bg-white" style={{paddingTop:"env(safe-area-inset-top)"}}>
      <div className="max-w-lg mx-auto px-5 pt-10 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-sm font-semibold text-stone-400 uppercase tracking-wider">{dateStr}</p>
          <div className="flex gap-2">
            {notifStatus==="default"&&<button onClick={enableNotifs} className="text-sm font-semibold text-stone-400 active:text-stone-600">&#128276;</button>}
            <button onClick={()=>setQp(true)} className="text-sm font-bold text-stone-900 bg-stone-100 px-4 py-1.5 rounded-full active:bg-stone-200">&#9889; Got time?</button>
          </div>
        </div>
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">Today, {user}</h1>

        {/* Progress bar + streak */}
        {(completedToday.length>0||dailyTasks.length>0||streak>0)&&<div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-stone-400">{completedToday.length} done{dailyTasks.length>0?` / ${completedToday.length+dailyTasks.length} total`:""}</span>
            {streak>0&&<span className="text-xs font-bold text-amber-500">&#128293; {streak} day streak</span>}
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

        {/* Quick capture */}
        <div className="mt-6">
          <div className="flex gap-2">
            <input value={captureText} onChange={e=>setCaptureText(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&quickCapture()}
              placeholder="Quick thought... just type and hit enter"
              className="flex-1 px-4 py-3 rounded-2xl bg-stone-50 border-2 border-stone-100 text-sm font-medium text-stone-800 focus:outline-none focus:border-stone-300 placeholder:text-stone-300 transition-colors"/>
            {captureText.trim()&&<button onClick={quickCapture}
              className="px-4 py-3 rounded-2xl bg-stone-900 text-white text-sm font-bold active:scale-95 transition-all">Add</button>}
          </div>
        </div>

        {/* Category nav */}
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button onClick={()=>setView("shop")}
            className="rounded-2xl p-4 text-left active:scale-95 transition-all bg-amber-50">
            <p className="text-sm font-extrabold text-amber-700">&#128722; Shopping List</p>
            <p className="text-xs font-semibold text-amber-500 mt-0.5">{shopItems.filter(s=>!s.completed).length} items</p>
          </button>
          <button onClick={()=>setView("stats")}
            className="rounded-2xl p-4 text-left active:scale-95 transition-all bg-stone-100">
            <p className="text-sm font-extrabold text-stone-700">&#128202; Task Stats</p>
            <p className="text-xs font-semibold text-stone-400 mt-0.5">How you're doing</p>
          </button>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2.5">
          {Object.entries(CAT).map(([k,c])=>{
            const n=tasks.filter(t=>t.category===k&&(!t.assigned_to||t.assigned_to===user)).map(enrich).filter(isDue).length;
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

function AddForm({nw,setNw,theme,onAdd,onCancel,user,knownUsers}){
  const assignOpts=[{v:null,l:"Both"},{v:user,l:"Just me"},...knownUsers.filter(n=>n!==user).map(n=>({v:n,l:n+" only"}))];
  return<div className="bg-white rounded-2xl border-2 border-stone-100 p-5 mb-4">
    <input value={nw.name} onChange={e=>setNw({...nw,name:e.target.value})} placeholder="Task name" autoFocus
      className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 text-sm font-semibold mb-3 focus:outline-none focus:border-stone-900"/>
    <p className="text-xs font-semibold text-stone-400 mb-1.5">Who?</p>
    <div className="flex flex-wrap gap-1.5 mb-3">{assignOpts.map(a=>
      <button key={a.l} onClick={()=>setNw({...nw,assigned_to:a.v})} className="px-3 py-1.5 rounded-full text-xs font-bold"
        style={nw.assigned_to===a.v?{background:theme.accent,color:"#fff"}:{background:"#F5F5F4",color:"#78716C"}}>{a.l}</button>)}</div>
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

function EditInline({task,theme,onSave,onCancel,user,knownUsers}){
  const[n,setN]=useState(task.name);const[f,setF]=useState(task.frequency);
  const[p,setP]=useState(task.priority);const[e,setE]=useState(task.estimated_min);
  const[a,setA]=useState(task.assigned_to||null);
  const assignOpts=[{v:null,l:"Both"},{v:user,l:"Just me"},...(knownUsers||[]).filter(x=>x!==user).map(x=>({v:x,l:x+" only"}))];
  return<div className="space-y-3 py-2">
    <input value={n} onChange={ev=>setN(ev.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-200 text-sm font-semibold focus:outline-none focus:border-stone-900"/>
    <div className="flex items-center gap-2"><span className="text-xs text-stone-400 font-semibold">Time:</span>
      <input type="number" value={e} onChange={ev=>setE(parseInt(ev.target.value)||1)} className="w-14 px-2 py-1.5 rounded-lg border-2 border-stone-200 text-sm font-bold focus:outline-none text-center"/><span className="text-xs text-stone-400">min</span></div>
    <div className="flex flex-wrap gap-1.5">{assignOpts.map(o=>
      <button key={o.l} onClick={()=>setA(o.v)} className="px-2.5 py-1 rounded-full text-xs font-bold"
        style={a===o.v?{background:theme.accent,color:"#fff"}:{background:"#F5F5F4",color:"#78716C"}}>{o.l}</button>)}</div>
    <div className="flex flex-wrap gap-1.5">{FREQ.map(x=>
      <button key={x.v} onClick={()=>setF(x.v)} className="px-2.5 py-1 rounded-full text-xs font-bold"
        style={f===x.v?{background:theme.accent,color:"#fff"}:{background:"#F5F5F4",color:"#78716C"}}>{x.l}</button>)}</div>
    <div className="flex gap-1.5">{PRIS.map(x=>
      <button key={x} onClick={()=>setP(x)} className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${p===x?PRI_C[x].p:"bg-stone-100 text-stone-400"}`}>{x}</button>)}</div>
    <div className="flex gap-2"><button onClick={onCancel} className="text-xs px-4 py-2 rounded-xl border-2 border-stone-200 text-stone-400 font-semibold">Cancel</button>
      <button onClick={()=>onSave({name:n,frequency:f,priority:p,estimated_min:e,assigned_to:a})} className="text-xs px-4 py-2 rounded-xl text-white font-bold" style={{background:theme.accent}}>Save</button></div>
  </div>;
}
