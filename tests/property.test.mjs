import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,clone} from './helpers.mjs';
import {genInstance} from './gen.mjs';
import {judge} from './judge.mjs';
import {oracleMax} from './oracle3.mjs';

const N=Number(process.env.PROP_N||500);

const plain=saved=>{
const s=Engine.migrate(clone(saved));
return s.goals.length===0&&s.locations.every(l=>l.visits===1)?s:null;
};

const capOf=(saved,ms=500)=>Engine.createFromSaved(clone(saved),{seed:3}).capacityInfo({timeBudgetMs:ms});

test(`exactness: capacity equals the brute-force oracle on ${N} random instances`,()=>{
const bad=[];
let checked=0,skipped=0;
for(let seed=1;seed<=N;seed++){
const s=plain(genInstance(seed));
if(!s){skipped++;continue;}
let o;
try{o=oracleMax(s,{maxNodes:400000});}catch(e){skipped++;continue;}
const info=capOf(s,600);
checked++;
if(info.capacity!==o||!info.exact)bad.push({seed,engine:info.capacity,exact:info.exact,oracle:o});
}
assert.ok(checked>N*0.5,'oracle skipped too many: '+skipped+' of '+N);
assert.deepEqual(bad,[]);
});

test('soundness: every plan the engine returns passes the independent judge and the engine checker',()=>{
const bad=[];
for(let seed=1;seed<=N;seed++){
const saved=Engine.migrate(clone(genInstance(seed)));
const E=Engine.createFromSaved(clone(saved),{seed:3});
const r=E.solveNow({seed:3,timeBudgetMs:300,explain:false,plans:3});
for(const p of r.plans){
const full=r.status==='optimal'||r.status==='feasible';
const invalid=new Set([...E.compileGoals().issues.keys()].map(k=>k&&k.id!=null?k.id:k));
const scoped={...saved,goals:saved.goals.filter(g=>!invalid.has(g.id))};
const j=judge(scoped,p,{complete:full,coverage:true});
if(!j.ok)bad.push({seed,rule:j.violations[0].rule});
if(full){
const ev=E.checkPlan(p.rows,E.compileModel());
if(ev.hardCount!==0)bad.push({seed,hard:ev.hard});
}
}
}
assert.deepEqual(bad,[]);
});

const free=(saved,fn)=>{const s=clone(saved);fn(s);return s;};

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
['addLoc',(s,i)=>{s.locations.push({id:950+i,name:'n',type:'main',dist:'',genderRule:false,maxWeek:0,closed:[],seats:{1:1,2:0},dup:null,only:[],ban:[]});}]
];
const tighten=[
['dayOff',(s,i)=>{const m=s.members[i%s.members.length];const d=s.days.map((x,k)=>x.on?k:-1).filter(k=>k>=0)[i%2];if(m&&!m.off.includes(d))m.off.push(d);}],
['ban',(s,i)=>{const l=s.locations[0];if(l&&s.members.length)l.ban=[...new Set([...(l.ban||[]),s.members[i%s.members.length].id])];}],
['conflict',s=>{if(s.locations.length>=2&&!s.conflicts.length)s.conflicts=[{id:9990,on:true,a:[s.locations[0].id],b:[s.locations[1].id],scope:'all',pool:1,ids:[],hard:true}];}]
];
for(let seed=1;seed<=Math.min(N,120);seed++){
const base=plain(genInstance(seed));
if(!base)continue;
const c0=capOf(base);
if(!c0.exact)continue;
for(const [name,fn] of relax){
if(name==='addMember'&&base.fair&&base.fair.mode==='hard'&&(base.fair.maxSpread||base.fair.minEach))continue;
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

test('explanation correctness: every listed fix really helps (checked with the oracle)',()=>{
const bad=[];
let checkedFixes=0;
for(let seed=1;seed<=Math.min(N,100);seed++){
const s=plain(genInstance(seed));
if(!s)continue;
let o;
try{o=oracleMax(s,{maxNodes:300000});}catch(e){continue;}
const E=Engine.createFromSaved(clone(s),{seed:3});
const r=E.solveNow({seed:3,timeBudgetMs:500,explainMs:1200,plans:1});
if(r.status!=='partial_proven')continue;
if(r.achieved!==o){bad.push({seed,achieved:r.achieved,oracle:o});continue;}
for(const u of r.unplaced)for(const reason of u.reasons)for(const fx of reason.fixes){
const E2=Engine.createFromSaved(clone(s),{seed:3});
E2.FIX[fx.op].run(fx);
const s2=E2.saveObject();
let o2;
try{o2=oracleMax(s2,{maxNodes:300000});}catch(e){continue;}
checkedFixes++;
const complete=o2===E2.totalRequested();
if(!complete&&o2<=o)bad.push({seed,fix:fx,before:o,after:o2});
}
}
assert.deepEqual(bad,[]);
assert.ok(checkedFixes>0);
});

test('determinism: same input and seed give identical plans',()=>{
for(let seed=1;seed<=20;seed++){
const saved=genInstance(seed);
const a=Engine.solve(saved,{seed:5,timeBudgetMs:600,explain:false});
const b=Engine.solve(saved,{seed:5,timeBudgetMs:600,explain:false});
assert.equal(a.status,b.status);
const hs=r=>r.plans.map(p=>JSON.stringify(p.rows.map(x=>[x.day,x.loc.id,x.team.slice().sort()])));
assert.deepEqual(hs(a),hs(b),'seed '+seed);
}
});
