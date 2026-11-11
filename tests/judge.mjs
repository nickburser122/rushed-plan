import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {createFromSaved,DAYS}=require('../engine.js');

export {DAYS};

const BASE_SHAPE={main:{1:2,2:2},contracted:{1:2,2:1}};
const GENDER_MODES=['off','mixed','legacy4','minF','minM'];

const pad=n=>String(n).padStart(2,'0');
const isoOf=t=>t.getFullYear()+'-'+pad(t.getMonth()+1)+'-'+pad(t.getDate());

function ctxOf(saved){
const S=createFromSaved(saved).state;
const ov=(S.weekOverrides&&S.weekOverrides[S.weekStart])||null;
const holidays=new Set(ov&&ov.holidays?ov.holidays:[]);
const memberOffWeek=id=>(ov&&ov.memberOff&&ov.memberOff[id])||[];
const locClosedWeek=id=>(ov&&ov.locClosed&&ov.locClosed[id])||[];
const dayOpen=d=>!!S.days[d]&&S.days[d].on&&!holidays.has(d);
const workDays=[0,1,2,3,4,5,6].filter(dayOpen);
const memberById=new Map(S.members.map(m=>[m.id,m]));
const locById=new Map(S.locations.map(l=>[l.id,l]));
const C={S,memberById,locById,workDays,dayOpen};
C.off=(m,d)=>m.off.includes(d)||memberOffWeek(m.id).includes(d);
C.closed=(l,d)=>l.closed.includes(d)||locClosedWeek(l.id).includes(d)||(Array.isArray(l.allowedDays)&&l.allowedDays.length>0&&!l.allowedDays.includes(d));
C.eligible=(m,l)=>{
if(m.types&&m.types!=='any'&&m.types!==l.type)return false;
if(Array.isArray(l.ban)&&l.ban.includes(m.id))return false;
if(Array.isArray(l.only)&&l.only.length>0&&!l.only.includes(m.id)&&l.only.some(id=>memberById.has(id)))return false;
return true;
};
C.shape=l=>{
const b=BASE_SHAPE[l.type]||BASE_SHAPE.main;
const s=l.seats;
if(!s)return b;
return{1:s[1]==null?b[1]:s[1],2:s[2]==null?b[2]:s[2]};
};
C.visits=l=>Number.isInteger(l.visits)?l.visits:1;
C.repeat=l=>({people:l.repeat&&l.repeat.people==='any'?'any':'different',days:l.repeat&&l.repeat.days==='same'?'same':'separate'});
C.maxExtra=l=>Number.isInteger(l.maxExtra)?l.maxExtra:0;
C.extraVisits=()=>Number.isInteger(S.extraVisits)?S.extraVisits:0;
C.oneVisit=()=>S.oneVisitPerMember===true||(S.oneVisitPerMember===undefined&&S.dup&&S.dup.people==='all');
C.genderCfg=l=>{
const g=S.gender||{},r=g.ratio||{};
const mode=GENDER_MODES.includes(l.genderMode)?l.genderMode:(GENDER_MODES.includes(g.mode)?g.mode:'legacy4');
return{mode,a:r.a>=1?r.a:3,b:r.b>=1?r.b:1,min:g.min>=1?g.min:1};
};
C.genderActive=l=>!!l.genderRule&&C.genderCfg(l).mode!=='off';
C.genderOK=(genders,cfg)=>{
const n=genders.length;
if(n<2)return true;
const men=genders.filter(x=>x==='M').length,wom=n-men;
if(cfg.mode==='off')return true;
if(cfg.mode==='minF')return wom>=Math.min(cfg.min,n);
if(cfg.mode==='minM')return men>=Math.min(cfg.min,n);
if(cfg.mode==='legacy4'&&n===cfg.a+cfg.b)return men===cfg.a||men===cfg.b;
return men>=1&&wom>=1;
};
C.needsOK=(team,l)=>{
for(const n of l.needs||[]){
let c=0;
for(const m of team)if(m.tags&&m.tags.includes(n.tag))c++;
if(c<n.min)return false;
}
return true;
};
const pairs=[];
if(S.pairs&&S.pairs.enabled){
for(const r of S.pairs.rules||[]){
if(r.a===r.b||!memberById.has(r.a)||!memberById.has(r.b))continue;
if(r.kind==='must')pairs.push({kind:'must',a:r.a,b:r.b});
else if(r.kind==='avoid'&&(r.hard===true||(r.hard!==false&&S.pairs.mode==='hard')))pairs.push({kind:'avoid',a:r.a,b:r.b});
}
}
C.hardPairs=pairs;
C.pairsOK=ids=>{
for(const p of pairs){
const ia=ids.includes(p.a),ib=ids.includes(p.b);
if(p.kind==='avoid'&&ia&&ib)return false;
if(p.kind==='must'&&ia!==ib)return false;
}
return true;
};
C.conflicts=(S.conflicts||[]).filter(c=>c.on!==false&&c.hard!==false).map(c=>({
A:new Set(c.a.filter(id=>locById.has(id))),
B:new Set(c.b.filter(id=>locById.has(id))),
scope:c.scope,pool:c.pool,ids:new Set((c.ids||[]).filter(id=>memberById.has(id)))
})).filter(c=>c.A.size&&c.B.size);
C.conflictApplies=(c,m)=>c.scope==='all'||(c.scope==='pool'&&m.pool===c.pool)||(c.scope==='members'&&c.ids.has(m.id));
C.dayRules=(S.dayRules||[]).filter(r=>r.on!==false).map(r=>({
kind:r.kind,
A:new Set(r.a.filter(id=>locById.has(id))),
B:new Set(r.b.filter(id=>locById.has(id)))
})).filter(r=>r.A.size&&r.B.size);
C.restRule=m=>m.rest||S.rest;
C.calendar=()=>S.restCalendar!==false;
C.restPos=d=>{
if(C.calendar())return d;
const k=workDays.indexOf(d);
return k<0?null:k;
};
C.prev=()=>{
const out=new Map();
if(!S.carryWeek)return out;
const t=new Date(S.weekStart+'T00:00:00');
t.setDate(t.getDate()-7);
const key=isoOf(t);
const h=S.history&&S.history[key];
if(!h)return out;
const hw=S.historyWd&&S.historyWd[key];
const pwd=hw&&hw.length?hw:workDays;
for(const id of Object.keys(h)){
const arr=[];
for(const d of h[id]){
if(C.calendar())arr.push(d-7);
else{const k=pwd.indexOf(d);if(k>=0)arr.push(k-pwd.length);}
}
if(arr.length)out.set(+id,arr);
}
return out;
};
C.dayMax=d=>{
const v=S.days[d].max;
if(v>0)return v;
const cap=S.cap||{};
return cap.dayMax>0?cap.dayMax:(cap.mainPerDay||2)+(cap.conPerDay||1);
};
C.globalMax=()=>S.gmaxOn?S.gmax:Infinity;
C.memberMax=m=>Math.min(m.vmode==='exact'?m.vmin:m.vmode==='range'?m.vmax:Infinity,C.globalMax(),C.oneVisit()?1:Infinity);
C.fairHard=()=>!!S.fair&&S.fair.mode==='hard';
C.activeMembers=()=>{
const out={1:[],2:[]};
for(const m of S.members){
if(workDays.some(d=>!C.off(m,d))&&S.locations.some(l=>C.eligible(m,l)))out[m.pool].push(m.id);
}
return out;
};
C.memberMin=m=>m.vmode==='exact'||m.vmode==='range'?m.vmin:0;
return C;
}

function restViolations(C,days,rule,prevPts){
if(rule.rest===0)return 0;
const pts=new Map();
for(const x of prevPts||[])pts.set(x,false);
for(const d of days){
const x=C.restPos(d);
if(x!==null&&x!==undefined)pts.set(x,true);
}
const seq=[...pts.entries()].sort((a,b)=>a[0]-b[0]);
let run=1,n=0;
for(let i=1;i<seq.length;i++){
const gap=seq[i][0]-seq[i-1][0]-1;
if(gap===0){run++;if(run>rule.maxRun&&seq[i][1])n++;}
else{if(gap<rule.rest&&seq[i][1])n++;run=1;}
}
return n;
}

function normRows(plan){
const rows=Array.isArray(plan)?plan:(plan&&plan.rows)||[];
return rows.map(r=>({
day:r.day,
locId:r.locId!=null?r.locId:(r.loc&&r.loc.id),
team:Array.isArray(r.team)?r.team.slice():[],
goal:r.goal==null?null:r.goal,
custom:r.custom||null
}));
}

function combos(arr,k){
const out=[];
(function rec(s,cur){
if(cur.length===k){out.push(cur.slice());return;}
for(let i=s;i<=arr.length-(k-cur.length);i++){cur.push(arr[i]);rec(i+1,cur);cur.pop();}
})(0,[]);
return out;
}

export function standaloneFeasible(C,loc){
const sh=C.shape(loc);
const prev=C.prev();
for(const d of C.workDays){
if(C.closed(loc,d))continue;
const pools={1:[],2:[]};
for(const m of C.S.members){
if(C.off(m,d)||!C.eligible(m,loc)||C.memberMax(m)<1)continue;
if(restViolations(C,[d],C.restRule(m),prev.get(m.id))>0)continue;
pools[m.pool].push(m);
}
if(pools[1].length<sh[1]||pools[2].length<sh[2])continue;
const simple=!C.genderActive(loc)&&!(loc.needs&&loc.needs.length)&&C.hardPairs.length===0;
if(simple)return true;
const cfg=C.genderCfg(loc);
for(const a of combos(pools[1],sh[1])){
for(const b of combos(pools[2],sh[2])){
const team=a.concat(b);
if(C.genderActive(loc)&&!C.genderOK(team.map(m=>m.gender),cfg))continue;
if(loc.needs&&loc.needs.length&&!C.needsOK(team,loc))continue;
if(!C.pairsOK(team.map(m=>m.id)))continue;
return true;
}
}
}
return false;
}

export function judger(saved){
const C=ctxOf(saved);
return(plan,opts)=>judgeCtx(C,plan,opts||{});
}

export function judge(saved,plan,opts={}){
return judgeCtx(ctxOf(saved),plan,opts);
}

function judgeCtx(C,plan,opts){
const S=C.S;
const complete=opts.complete!==false;
const rows=normRows(plan);
const V=[];
const ignore=new Set(opts.ignore||[]);
const bad=(rule,row,detail)=>{if(!ignore.has(rule))V.push({rule,row,detail});};

const perLoc=new Map(),perDayLocs=new Map(),memberDays=new Map(),memberCount=new Map(),memberLocs=new Map();

rows.forEach((r,i)=>{
const loc=C.locById.get(r.locId);
if(!loc){bad('unknownLocation',i,'location '+r.locId);return;}
if(!Number.isInteger(r.day)||r.day<0||r.day>6){bad('badDay',i,String(r.day));return;}
if(!C.dayOpen(r.day))bad('dayNotWorking',i,'day '+r.day);
if(C.closed(loc,r.day))bad('locationClosed',i,loc.id+' on '+r.day);
if(!perLoc.has(loc.id))perLoc.set(loc.id,[]);
perLoc.get(loc.id).push(i);
if(!perDayLocs.has(r.day))perDayLocs.set(r.day,new Set());
perDayLocs.get(r.day).add(loc.id);
const seen=new Set();
const c={1:0,2:0};
const members=[];
for(const id of r.team){
const m=C.memberById.get(id);
if(!m||seen.has(id)){bad('teamMember',i,'member '+id);continue;}
seen.add(id);
members.push(m);
c[m.pool]++;
if(C.off(m,r.day))bad('memberDayOff',i,m.id+' on '+r.day);
if(!C.eligible(m,loc))bad('memberNotEligible',i,m.id+' at '+loc.id);
const ds=memberDays.get(id)||[];
if(ds.includes(r.day))bad('doubleBooked',i,m.id+' on '+r.day);
ds.push(r.day);
memberDays.set(id,ds);
memberCount.set(id,(memberCount.get(id)||0)+1);
if(!memberLocs.has(id))memberLocs.set(id,new Set());
memberLocs.get(id).add(loc.id);
}
if(r.custom){
if(r.team.length!==r.custom.size)bad('customSize',i,r.team.length+' vs '+r.custom.size);
}else{
const sh=C.shape(loc);
if(c[1]!==sh[1]||c[2]!==sh[2])bad('seats',i,c[1]+'/'+c[2]+' vs '+sh[1]+'/'+sh[2]);
if(C.genderActive(loc)&&!C.genderOK(members.map(m=>m.gender),C.genderCfg(loc)))bad('gender',i,'loc '+loc.id);
if(loc.needs&&loc.needs.length&&!C.needsOK(members,loc))bad('tags',i,'loc '+loc.id);
}
if(!C.pairsOK(r.team))bad('pairRule',i,'loc '+loc.id);
});

for(const [id,ds] of memberDays){
const m=C.memberById.get(id);
const n=restViolations(C,ds,C.restRule(m),C.prev().get(id));
if(n>0)bad('rest',-1,'member '+id+' x'+n);
}

for(const m of S.members){
const n=memberCount.get(m.id)||0;
if(n>C.memberMax(m))bad('memberMax',-1,'member '+m.id+' has '+n);
if(complete&&n<C.memberMin(m))bad('memberMin',-1,'member '+m.id+' has '+n);
}

if(C.fairHard()){
const minEach=S.fair.minEach|0,spread=S.fair.maxSpread|0;
const act=C.activeMembers();
if(complete&&minEach>0)for(const q of[1,2])for(const id of act[q])if((memberCount.get(id)||0)<minEach)bad('fairMin',-1,'member '+id);
if(spread>0)for(const q of[1,2]){
const a=act[q];
if(a.length<2)continue;
let hi=-1,lo=Infinity;
for(const id of a){const n=memberCount.get(id)||0;if(n>hi)hi=n;if(n<lo)lo=n;}
if(hi-lo>spread)bad('fairSpread',-1,'pool '+q+' spread '+(hi-lo));
}
}

if(S.useAllDays&&complete)for(const d of C.workDays)if(!perDayLocs.has(d))bad('useAllDays',-1,'day '+d+' empty');

for(const [d,set] of perDayLocs){
let mains=0,cons=0;
for(const id of set){if(C.locById.get(id).type==='main')mains++;else cons++;}
if(set.size>C.dayMax(d))bad('dayMax',-1,'day '+d);
if(mains>(S.cap.mainPerDay||2)||cons>(S.cap.conPerDay||1))bad('dayTypeCap',-1,'day '+d);
}

for(const c of C.conflicts){
for(const [id,set] of memberLocs){
const m=C.memberById.get(id);
if(!C.conflictApplies(c,m))continue;
let a=false,b=false;
for(const l of set){if(c.A.has(l))a=true;if(c.B.has(l))b=true;}
if(a&&b)bad('conflict',-1,'member '+id);
}
}

for(const d of C.workDays){
const here=perDayLocs.get(d)||new Set();
for(const r of C.dayRules){
let ha=false,hb=false;
for(const id of here){if(r.A.has(id))ha=true;if(r.B.has(id))hb=true;}
if(r.kind==='notSameDay'&&ha&&hb)bad('dayRuleNotSame',-1,'day '+d);
if(r.kind==='sameDay'&&ha!==hb)bad('dayRuleSame',-1,'day '+d);
}
}

let extraRows=0;
for(const l of S.locations){
const idx=perLoc.get(l.id)||[];
const n=idx.length,base=C.visits(l),mx=C.maxExtra(l);
if(n>base+mx)bad('visitsExceeded',-1,'location '+l.id+' has '+n+' of '+base+'+'+mx);
if(complete&&n<base)bad('visitsMissing',-1,'location '+l.id+' has '+n+' of '+base);
if(base===0&&n>0)bad('skippedLocationVisited',-1,'location '+l.id);
extraRows+=Math.max(0,n-base);
if(n>=2){
const rp=C.repeat(l);
const dset=new Set(idx.map(i=>rows[i].day));
if(rp.days==='separate'&&dset.size!==n)bad('repeatDays',-1,'location '+l.id+' repeats on one day');
if(rp.days==='same'&&dset.size!==1)bad('repeatSameDay',-1,'location '+l.id+' spans days');
if(rp.people==='different'){
const who=new Map();
for(const i of idx)for(const id of rows[i].team)who.set(id,(who.get(id)||0)+1);
for(const [id,k] of who)if(k>1)bad('repeatPeople',-1,'member '+id+' at location '+l.id);
}
const gap=l.minGap|0;
if(gap>1&&rp.days!=='same'){
const ds=idx.map(i=>rows[i].day).sort((a,b)=>a-b);
for(let i=1;i<ds.length;i++)if(ds[i]!==ds[i-1]&&ds[i]-ds[i-1]<gap)bad('minGap',-1,'location '+l.id);
}
}
}
if(extraRows>C.extraVisits())bad('extraVisitsExceeded',-1,extraRows+' > '+C.extraVisits());

for(const g of S.goals||[]){
if(g.on===false)continue;
const i=rows.findIndex(r=>r.goal===g.id);
if(i<0){if(complete)bad('goalMissing',-1,'goal '+g.id);continue;}
const r=rows[i];
const days=g.days&&g.days.length?g.days.filter(d=>C.dayOpen(d)):C.workDays;
if(r.locId!==g.loc)bad('goalLocation',i,'goal '+g.id);
if(!days.includes(r.day))bad('goalDay',i,'goal '+g.id);
if((g.people||[]).some(id=>!r.team.includes(id)))bad('goalPeople',i,'goal '+g.id);
if((g.exclude||[]).some(id=>r.team.includes(id)))bad('goalExclude',i,'goal '+g.id);
if(g.mode==='custom'){
if(r.team.length!==g.size)bad('goalSize',i,'goal '+g.id);
if(g.allowed&&g.allowed.length&&r.team.some(id=>!g.allowed.includes(id)))bad('goalAllowed',i,'goal '+g.id);
}
}

if(opts.coverage){
const zero=S.locations.filter(l=>C.visits(l)>=1&&!(perLoc.get(l.id)||[]).length);
const repeated=S.locations.filter(l=>(perLoc.get(l.id)||[]).length>=2);
if(zero.length&&repeated.length){
const fixed=zero.filter(l=>standaloneFeasible(C,l));
if(fixed.length)bad('coverageInvariant',-1,'repeat at '+repeated[0].id+' while '+fixed[0].id+' is unvisited and feasible');
}
}

return{ok:V.length===0,violations:V};
}

export function requestedTotal(saved){
const C=ctxOf(saved);
return C.S.locations.reduce((a,l)=>a+C.visits(l),0)+C.extraVisits();
}
