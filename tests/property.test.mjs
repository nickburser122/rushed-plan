import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,clone} from './helpers.mjs';
import {genInstance} from './gen.mjs';
import {oracleCapacity} from './oracle.mjs';

const N=Number(process.env.PROP_N||500);

function engineCap(saved,ms=600){
const E=Engine.createFromSaved(saved,{seed:3});
return{E,info:E.capacityInfo({timeBudgetMs:ms,noCache:true})};
}

test(`exactness: capacity equals brute-force oracle on ${N} random instances`,()=>{
const bad=[];
let checked=0,skipped=0;
for(let seed=1;seed<=N;seed++){
const saved=genInstance(seed);
let o;
try{o=oracleCapacity(saved,{maxV:8,maxNodes:600000});}catch(e){skipped++;continue;}
const {info}=engineCap(saved);
checked++;
if(info.capacity!==o||!info.exact)bad.push({seed,engine:info.capacity,exact:info.exact,oracle:o,ub:info.ub});
}
assert.ok(checked>N*0.7,'oracle skipped too many: '+skipped);
assert.deepEqual(bad,[]);
});

test('soundness: every plan the engine returns passes the independent checker',()=>{
const bad=[];
for(let seed=1;seed<=N;seed++){
const saved=genInstance(seed);
const {E,info}=engineCap(saved,300);
if(!info.plan)continue;
const ev=E.checkPlan(info.plan.rows,E.compileModel());
if(ev.hardCount!==0)bad.push({seed,hard:ev.hard});
}
assert.deepEqual(bad,[]);
});

test('bound validity: flow upper bound is never below the brute-force capacity',()=>{
const bad=[];
for(let seed=1;seed<=N;seed++){
const saved=genInstance(seed);
let o;
try{o=oracleCapacity(saved,{maxV:8,maxNodes:600000});}catch(e){continue;}
const E=Engine.createFromSaved(saved,{seed:3});
const fb=E.flowBound(E.compileModel());
if(fb.ub<o)bad.push({seed,ub:fb.ub,oracle:o});
}
assert.deepEqual(bad,[]);
});

import {oracleFeasible} from './oracle.mjs';

const free=(saved,fn)=>{const s=clone(saved);fn(s);return s;};
const capOf=(saved,ms=500)=>Engine.createFromSaved(saved,{seed:3}).capacityInfo({timeBudgetMs:ms,noCache:true});

test('completeness: solve at the oracle capacity is feasible, one above is proven infeasible',()=>{
const bad=[];
for(let seed=1;seed<=Math.min(N,150);seed++){
const saved=genInstance(seed);
let o;
try{o=oracleCapacity(saved,{maxV:8,maxNodes:600000});}catch(e){continue;}
if(o>=1){
const r=Engine.solve(saved,{seed:1,visitsWanted:o,timeBudgetMs:800});
if(!['optimal','feasible'].includes(r.status))bad.push({seed,o,status:r.status});
}
const r2=Engine.solve(saved,{seed:1,visitsWanted:o+1,timeBudgetMs:800});
if(r2.status==='feasible'||r2.status==='optimal')bad.push({seed,o,above:r2.status});
if(r2.status==='infeasible_proven'&&r2.achieved!==o)bad.push({seed,o,achieved:r2.achieved});
}
assert.deepEqual(bad,[]);
});

test('monotonicity: relaxing never lowers capacity, tightening never raises it',()=>{
const bad=[];
const relax=[
['addMember',(s,i)=>{s.members.push({id:900+i,name:'x',pool:i%2?1:2,gender:i%3?'M':'F',off:[],pref:'',types:'any',prefDays:[]});}],
['openDay',s=>{const l=s.locations.find(x=>x.closed.length);if(l)l.closed=l.closed.slice(1);}],
['raiseGmax',s=>{if(s.gmaxOn)s.gmax+=1;}],
['genderOff',s=>{s.locations.forEach(l=>l.genderRule=false);}],
['conflictOff',s=>{s.conflicts=[];}],
['dayMaxUp',s=>{if(s.cap.dayMax>0)s.cap.dayMax+=1;s.cap.mainPerDay+=1;}],
['restOff',s=>{s.rest={rest:0,maxRun:1};}],
['dupAny',s=>{s.dup.people='any';}],
['addLoc',(s,i)=>{s.locations.push({id:950+i,name:'n',type:'main',dist:'',genderRule:false,maxWeek:0,closed:[],seats:{1:1,2:0},dup:null,only:[],ban:[]});}]
];
const tighten=[
['dayOff',(s,i)=>{const m=s.members[i%s.members.length];const d=s.days.map((x,k)=>x.on?k:-1).filter(k=>k>=0)[i%2];if(m&&!m.off.includes(d))m.off.push(d);}],
['ban',(s,i)=>{const l=s.locations[0];if(l&&s.members.length)l.ban=[...new Set([...(l.ban||[]),s.members[i%s.members.length].id])];}],
['conflict',s=>{if(s.locations.length>=2&&!s.conflicts.length)s.conflicts=[{id:9990,on:true,a:[s.locations[0].id],b:[s.locations[1].id],scope:'all',pool:1,ids:[],hard:true}];}]
];
for(let seed=1;seed<=Math.min(N,120);seed++){
const base=genInstance(seed);
const c0=capOf(base);
if(!c0.exact)continue;
for(const [name,fn] of relax){
const c=capOf(free(base,s=>fn(s,seed)));
if(c.exact&&c.capacity<c0.capacity)bad.push({seed,name,from:c0.capacity,to:c.capacity});
}
for(const [name,fn] of tighten){
const c=capOf(free(base,s=>fn(s,seed)));
if(c.exact&&c.capacity>c0.capacity)bad.push({seed,name,from:c0.capacity,to:c.capacity});
}
}
assert.deepEqual(bad,[]);
});

test('explanation correctness: reported relaxations and every listed fix really reach the requested visits (checked with the oracle)',()=>{
const bad=[];
let checkedFixes=0;
for(let seed=1;seed<=Math.min(N,100);seed++){
const saved=genInstance(seed);
const E=Engine.createFromSaved(saved,{seed:3});
const info=E.capacityInfo({timeBudgetMs:500,noCache:true});
if(!info.exact)continue;
const V=info.capacity+1;
if(V>6)continue;
E.state.visitsWanted=V;E.state.visits=V;
const x=E.explain({visits:V,timeBudgetMs:500});
for(const f of x.findings){
if(f.cap!=null&&f.family!=='seats'&&f.family!=='struct'&&f.family!=='daycap'){
const c=E.withRelax([f.family],()=>E.capacityInfo({timeBudgetMs:400,noCache:true}).capacity);
if(c<f.cap)bad.push({seed,fam:f.family,reported:f.cap,got:c});
}
for(const fx of f.fixes){
const E2=Engine.createFromSaved(clone(saved),{seed:3});
E2.FIX[fx.op].run(fx);
const s2=E2.saveObject();
let ok;
try{ok=oracleFeasible(s2,V,{maxNodes:800000});}catch(e){continue;}
checkedFixes++;
if(!ok)bad.push({seed,fix:fx,V});
}
}
}
assert.deepEqual(bad,[]);
assert.ok(checkedFixes>0);
});

test('determinism: same input and seed give hash-equal plans',()=>{
for(let seed=1;seed<=20;seed++){
const saved=genInstance(seed);
const a=Engine.solve(saved,{seed:5,visitsWanted:2,attempts:250,timeBudgetMs:20000});
const b=Engine.solve(saved,{seed:5,visitsWanted:2,attempts:250,timeBudgetMs:20000});
assert.equal(a.status,b.status);
const hs=r=>r.plans.map(p=>JSON.stringify(p.rows.map(x=>[x.day,x.loc.id,x.team.slice().sort()])));
assert.deepEqual(hs(a),hs(b));
}
});

test('output invariants hold for every returned plan',()=>{
const bad=[];
for(let seed=1;seed<=Math.min(N,120);seed++){
const saved=genInstance(seed);
const E=Engine.createFromSaved(saved,{seed:3});
const r=Engine.solve(saved,{seed:2,visitsWanted:2,timeBudgetMs:200});
for(const p of r.plans){
const seen=new Set();
const perLoc=new Map();
const perDay=new Map();
for(const row of p.rows){
const l=saved.locations.find(x=>x.id===row.loc.id);
const sh=E.shapeOf(l);
const c1=row.team.filter(id=>saved.members.find(m=>m.id===id).pool===1).length;
if(c1!==sh[1]||row.team.length-c1!==sh[2])bad.push({seed,why:'shape'});
for(const id of row.team){
const m=saved.members.find(x=>x.id===id);
if(seen.has(id+':'+row.day))bad.push({seed,why:'double'});
seen.add(id+':'+row.day);
if(m.off.includes(row.day))bad.push({seed,why:'off'});
if(l.only.length&&!l.only.includes(id))bad.push({seed,why:'only'});
if(l.ban.includes(id))bad.push({seed,why:'ban'});
}
if(l.closed.includes(row.day))bad.push({seed,why:'closed'});
perLoc.set(l.id,(perLoc.get(l.id)||0)+1);
perDay.set(row.day,(perDay.get(row.day)||0)+1);
}
if(saved.dup.mode==='banned')for(const [id,n] of perLoc)if(n>1)bad.push({seed,why:'repeat'});
if(saved.cap.dayMax>0)for(const [d,n] of perDay)if(n>saved.cap.dayMax)bad.push({seed,why:'daycap'});
}
}
assert.deepEqual(bad,[]);
});
