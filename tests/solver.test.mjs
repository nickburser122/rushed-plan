import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,clone} from './helpers.mjs';
import {easyState} from './build.mjs';
import {judge,requestedTotal} from './judge.mjs';
import {planted,SMALL_N,MEDIUM_N} from './planted.mjs';

const v3=(saved,visits)=>{
const s=clone(saved);
s.v=3;
s.extraVisits=0;
s.locations.forEach((l,i)=>{l.visits=visits?visits[i]:1;l.repeat={people:'different',days:'separate'};l.maxExtra=0;});
return s;
};

const run=(saved,seed,ms)=>Engine.createFromSaved(clone(saved),{seed}).solveNow({seed,timeBudgetMs:ms});

const engineHard=(saved,plan)=>{
const E=Engine.createFromSaved(clone(saved),{seed:1});
return E.checkPlan(plan.rows.map(r=>({day:r.day,locId:r.loc.id,team:r.team.slice()}))).hardCount;
};

function plantedSweep(size,n,ms){
for(let s=1;s<=n;s++){
const {saved}=planted(s,size);
const r=run(saved,1,ms);
assert.ok(r.status==='optimal'||r.status==='feasible','seed '+s+' status '+r.status+' achieved '+r.achieved+'/'+r.requested);
assert.equal(r.achieved,r.requested);
assert.equal(r.requested,requestedTotal(saved));
assert.ok(r.plans.length>=1);
for(const p of r.plans){
const j=judge(saved,p);
assert.equal(j.ok,true,'seed '+s+' '+JSON.stringify(j.violations.slice(0,2)));
}
}
}

test('T-SOLV-1/2 every small planted instance is solved within 500 ms and every plan passes the judge',()=>{
plantedSweep('small',SMALL_N,500);
});

test('T-SOLV-1/2 every medium planted instance is solved within 1500 ms and every plan passes the judge',()=>{
plantedSweep('medium',MEDIUM_N,1500);
});

test('T-SOLV-1 returned plans also pass the engine checker',()=>{
for(let s=1;s<=40;s++){
const {saved}=planted(s,'small');
const r=run(saved,1,500);
for(const p of r.plans)assert.equal(engineHard(saved,p),0,'seed '+s);
}
});

test('T-SOLV-8 the same input and seed give identical plans',()=>{
for(let s=1;s<=25;s++){
const {saved}=planted(s,'small');
const a=run(saved,7,400),b=run(saved,7,400);
assert.equal(a.status,b.status);
assert.deepEqual(a.plans.map(p=>p.rows.map(r=>[r.day,r.loc.id,r.team])),b.plans.map(p=>p.rows.map(r=>[r.day,r.loc.id,r.team])),'seed '+s);
}
});

test('B1 four default locations give four distinct visits on every seed',()=>{
const saved=v3(easyState({main:4}));
for(let seed=1;seed<=40;seed++){
const r=run(saved,seed,500);
assert.equal(r.status==='optimal'||r.status==='feasible',true);
for(const p of r.plans){
assert.equal(p.rows.length,4);
assert.equal(new Set(p.rows.map(x=>x.loc.id)).size,4);
}
}
});

test('B2 a contracted location is visited exactly once with five mains',()=>{
const saved=v3(easyState({main:5,contracted:1}));
const con=saved.locations[5].id;
for(let seed=1;seed<=40;seed++){
const r=run(saved,seed,500);
for(const p of r.plans)assert.equal(p.rows.filter(x=>x.loc.id===con).length,1);
}
});

test('B7 a repeat never wins over an unvisited location',()=>{
const saved=v3(easyState({main:3,days:[2,3]}));
saved.locations[2].closed=[2];
saved.locations[1].closed=[3];
for(let seed=1;seed<=40;seed++){
const r=run(saved,seed,500);
for(const p of r.plans){
assert.equal(p.rows.length,3);
assert.equal(new Set(p.rows.map(x=>x.loc.id)).size,3);
}
}
});

test('T-SOLV-5 a shortage is reported as partial_proven with the true maximum and the coverage invariant',()=>{
for(let n=3;n<=6;n++){
const saved=v3(easyState({main:n,days:[1]}));
const r=run(saved,1,800);
assert.equal(r.requested,n);
assert.equal(r.achieved,2);
assert.equal(r.status,'partial_proven');
assert.equal(r.exact,true);
assert.equal(r.unplaced.length,n-2);
for(const p of r.plans){
const j=judge(saved,p,{complete:false,coverage:true});
assert.equal(j.ok,true,JSON.stringify(j.violations.slice(0,2)));
assert.equal(p.rows.length,2);
}
}
});

test('T-SOLV solve rejects the removed visitsWanted input',()=>{
const E=Engine.createFromSaved(v3(easyState({main:2})),{seed:1});
assert.throws(()=>E.solveNow({visitsWanted:3}),/visitsWanted/);
});

import {oracleMax} from './oracle3.mjs';

function tinyInstance(r){
const ri=(a,b)=>a+Math.floor(r()*(b-a+1));
const nDays=ri(2,3);
const days=Array.from({length:nDays},(_,i)=>1+i);
const base=easyState({main:0,clinical:ri(3,5),admin:ri(2,4),days});
let id=900;
const nl=ri(3,4);
for(let i=0;i<nl;i++)base.locations.push({id:++id,name:'ل'+i,type:r()<0.3?'contracted':'main',dist:'',maxWeek:0,closed:[],seats:{1:ri(1,2),2:ri(0,1)},dup:null,only:[],ban:[]});
const s=v3(base);
for(const m of s.members){
if(r()<0.25)m.off=[days[ri(0,nDays-1)]];
}
for(const l of s.locations){
if(r()<0.25)l.closed=[days[ri(0,nDays-1)]];
if(r()<0.2)l.ban=[s.members[ri(0,s.members.length-1)].id];
}
if(r()<0.5)s.rest={rest:1,maxRun:1};
if(r()<0.4){s.gmaxOn=true;s.gmax=1;}
if(r()<0.3)s.cap={...s.cap,mainPerDay:1,conPerDay:1};
return s;
}

test('T-SOLV-4 achieved equals the brute-force maximum on 120 tiny random instances and is proven exact',()=>{
const r=Engine.mulberry32(31337);
let short=0,full=0;
for(let n=0;n<120;n++){
const saved=tinyInstance(r);
const want=oracleMax(saved);
const res=run(saved,1,1500);
assert.equal(res.achieved,want,'case '+n+' status '+res.status);
assert.equal(res.exact,true,'case '+n);
if(want<res.requested){short++;assert.equal(res.status,'partial_proven','case '+n);}else{full++;assert.ok(res.status==='optimal'||res.status==='feasible','case '+n);}
for(const p of res.plans)assert.equal(judge(saved,p,{complete:false,coverage:true}).ok,true,'case '+n);
}
assert.ok(short>=15&&full>=15,'mix '+short+'/'+full);
});
