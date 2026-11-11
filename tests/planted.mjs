import {Engine} from './helpers.mjs';

export const SMALL_N=300;
export const MEDIUM_N=150;

const SIZES={
small:{clinical:[2,4],admin:[2,4],locs:[2,5],maxMembers:8,maxLocs:5},
medium:{clinical:[6,10],admin:[6,10],locs:[5,10],maxMembers:20,maxLocs:10}
};

function randomsOf(seed){
const r=Engine.mulberry32((seed*2654435761)>>>0);
const ri=(a,b)=>a+Math.floor(r()*(b-a+1));
const chance=p=>r()<p;
const pick=a=>a[Math.floor(r()*a.length)];
const shuffle=a=>{const x=a.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;};
return{r,ri,chance,pick,shuffle};
}

function spacedOK(days,d){
return !days.some(x=>Math.abs(x-d)<=1);
}

function construct(R,cfg,members,locs,workDays){
const used=new Map(members.map(m=>[m.id,[]]));
const dayLocs=new Map(workDays.map(d=>[d,new Set()]));
const rows=[];
const capMain=R.ri(1,3),capCon=R.ri(1,2);
const visitsOf=new Map();
for(const l of R.shuffle(locs)){
const n=R.pick([1,1,1,2]);
visitsOf.set(l.id,n);
const prevTeams=[];
const usedDays=[];
for(let v=0;v<n;v++){
let placed=false;
for(const d of R.shuffle(workDays)){
if(usedDays.includes(d))continue;
const here=dayLocs.get(d);
let mains=0,cons=0;
for(const id of here){if(locs.find(x=>x.id===id).type==='main')mains++;else cons++;}
if(l.type==='main'&&mains>=capMain)continue;
if(l.type==='contracted'&&cons>=capCon)continue;
const team=[];
let ok=true;
for(const q of[1,2]){
const need=l.seats[q];
const pool=members.filter(m=>m.pool===q&&spacedOK(used.get(m.id),d)&&!prevTeams.some(t=>t.includes(m.id)));
if(pool.length<need){ok=false;break;}
for(const m of R.shuffle(pool).slice(0,need))team.push(m.id);
}
if(!ok)continue;
for(const id of team)used.get(id).push(d);
here.add(l.id);
prevTeams.push(team);
usedDays.push(d);
rows.push({day:d,locId:l.id,team:team.slice().sort((a,b)=>a-b)});
placed=true;
break;
}
if(!placed)return null;
}
}
return{rows,visitsOf};
}

export function planted(seed,size='small'){
const cfg=SIZES[size];
for(let attempt=0;attempt<200;attempt++){
const R=randomsOf(seed*1000+attempt);
const nd=R.ri(3,5);
const workDays=Array.from({length:nd},(_,i)=>1+i);
const nc=R.ri(cfg.clinical[0],cfg.clinical[1]),na=R.ri(cfg.admin[0],cfg.admin[1]);
if(nc+na>cfg.maxMembers)continue;
let id=100;
const tagPool=['س','ص','ع'];
const members=[];
for(let i=0;i<nc+na;i++)members.push({id:++id,name:'م'+i,pool:i<nc?1:2,gender:R.chance(0.5)?'M':'F',off:[],pref:'',types:'any',prefDays:[],tags:R.chance(0.4)?[R.pick(tagPool)]:[]});
const nl=Math.min(R.ri(cfg.locs[0],cfg.locs[1]),cfg.maxLocs);
const locs=[];
for(let i=0;i<nl;i++){
const type=R.chance(0.3)?'contracted':'main';
locs.push({id:++id,name:'ل'+i,type,dist:'',closed:[],seats:{1:R.ri(1,2),2:R.ri(0,2)},only:[],ban:[],maxWeek:0,dup:null,minWeek:0,priority:'normal',allowedDays:[],minGap:0,needs:[],genderRule:false,genderMode:null});
}
const built=construct(R,cfg,members,locs,workDays);
if(!built)continue;
const {rows,visitsOf}=built;
const rowsOfLoc=l=>rows.filter(r=>r.locId===l.id);
const membersOfLoc=l=>new Set(rowsOfLoc(l).flatMap(r=>r.team));
const usedDaysOf=m=>rows.filter(r=>r.team.includes(m.id)).map(r=>r.day);

for(const l of locs){
l.visits=visitsOf.get(l.id);
l.repeat={people:'different',days:'separate'};
l.maxExtra=0;
}

for(const m of members){
const ud=usedDaysOf(m);
for(const d of workDays)if(!ud.includes(d)&&R.chance(0.3))m.off.push(d);
}
for(const l of locs){
const ld=new Set(rowsOfLoc(l).map(r=>r.day));
for(const d of workDays)if(!ld.has(d)&&R.chance(0.3))l.closed.push(d);
const mem=membersOfLoc(l);
if(R.chance(0.2)){
l.only=members.filter(m=>mem.has(m.id)||R.chance(0.3)).map(m=>m.id);
}else if(R.chance(0.3)){
const outsiders=members.filter(m=>!mem.has(m.id));
if(outsiders.length)l.ban=[R.pick(outsiders).id];
}
const teams=rowsOfLoc(l).map(r=>r.team.map(i=>members.find(m=>m.id===i)));
const gOK=teams.every(t=>t.length<2||(t.some(m=>m.gender==='M')&&t.some(m=>m.gender==='F')));
if(gOK&&R.chance(0.4)){l.genderRule=true;l.genderMode='mixed';}
const tag=tagPool.find(t=>teams.every(tm=>tm.some(m=>m.tags.includes(t))));
if(tag&&R.chance(0.4))l.needs=[{tag,min:1}];
}

const conflicts=[];
for(let i=0;i<locs.length;i++)for(let j=i+1;j<locs.length;j++){
const a=membersOfLoc(locs[i]),b=membersOfLoc(locs[j]);
let shared=false;
for(const x of a)if(b.has(x)){shared=true;break;}
if(!shared&&R.chance(0.3))conflicts.push({id:++id,on:true,a:[locs[i].id],b:[locs[j].id],scope:'all',pool:1,ids:[],hard:true});
}

const pairRules=[];
for(let i=0;i<members.length&&pairRules.length<3;i++)for(let j=i+1;j<members.length&&pairRules.length<3;j++){
const together=rows.some(r=>r.team.includes(members[i].id)&&r.team.includes(members[j].id));
if(!together&&R.chance(0.1))pairRules.push({id:++id,kind:'avoid',a:members[i].id,b:members[j].id});
}

const dayRules=[];
for(let i=0;i<locs.length;i++)for(let j=i+1;j<locs.length;j++){
const da=new Set(rowsOfLoc(locs[i]).map(r=>r.day)),db=rowsOfLoc(locs[j]).map(r=>r.day);
if(!db.some(d=>da.has(d))&&R.chance(0.15))dayRules.push({id:++id,kind:'notSameDay',on:true,a:[locs[i].id],b:[locs[j].id]});
}

const countOf=m=>rows.filter(r=>r.team.includes(m.id)).length;
const maxCount=Math.max(...members.map(countOf));
const gmaxOn=R.chance(0.4);

let mainDay=0,conDay=0,anyDay=0;
for(const d of workDays){
const ls=new Set(rows.filter(r=>r.day===d).map(r=>r.locId));
let mm=0,cc=0;
for(const x of ls){if(locs.find(l=>l.id===x).type==='main')mm++;else cc++;}
mainDay=Math.max(mainDay,mm);conDay=Math.max(conDay,cc);anyDay=Math.max(anyDay,ls.size);
}

const days=Array.from({length:7},(_,i)=>({on:workDays.includes(i),fav:'',dist:'',max:0}));
const saved={
v:3,days,members,locations:locs,
pairs:{enabled:pairRules.length>0,mode:'hard',rules:pairRules},
goals:[],conflicts,dayRules,
cap:{mainPerDay:Math.max(1,mainDay),conPerDay:Math.max(1,conDay),dayMax:R.chance(0.3)?Math.max(1,anyDay):0,even:true},
rest:{rest:1,maxRun:1},restCalendar:true,
extraVisits:0,oneVisitPerMember:false,
gmaxOn,gmax:Math.min(7,Math.max(1,maxCount)),
dup:{mode:'separate',people:'different',spread:'avoid'},
useAllDays:false,carryWeek:false,history:{},weekStart:'2026-10-24',view:'day',priority:'balance',
gender:{mode:'mixed',ratio:{a:3,b:1},min:1},
autoRegen:true,minChanges:true
};
return{saved,plantedPlan:{rows}};
}
throw new Error('planted generator failed for seed '+seed);
}
