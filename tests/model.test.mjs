import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,clone} from './helpers.mjs';
import {easyState} from './build.mjs';
import {judge} from './judge.mjs';

const v3=(saved,visits)=>{
const s=clone(saved);
s.v=3;
s.extraVisits=0;
s.locations.forEach((l,i)=>{l.visits=visits?visits[i]:1;l.repeat={people:'different',days:'separate'};l.maxExtra=0;});
return s;
};
const solve=(saved,ms=800,seed=1)=>Engine.createFromSaved(clone(saved),{seed}).solveNow({seed,timeBudgetMs:ms});
const full=r=>r.status==='optimal'||r.status==='feasible';

test('T-LOC-7 a location with zero visits is never planned',()=>{
const saved=v3(easyState({main:3}),[1,0,1]);
const skipped=saved.locations[1].id;
for(let seed=1;seed<=20;seed++){
const r=solve(saved,500,seed);
assert.equal(r.requested,2);
assert.equal(full(r),true);
for(const p of r.plans){
assert.equal(p.rows.some(x=>x.loc.id===skipped),false);
assert.equal(judge(saved,p).ok,true);
}
}
});

test('visits above one produce that many rows on different days with different people',()=>{
const saved=v3(easyState({main:2,clinical:8,admin:8}),[3,1]);
const r=solve(saved);
assert.equal(full(r),true);
assert.equal(r.requested,4);
for(const p of r.plans){
const rows=p.rows.filter(x=>x.loc.id===saved.locations[0].id);
assert.equal(rows.length,3);
assert.equal(new Set(rows.map(x=>x.day)).size,3);
assert.equal(new Set(rows.flatMap(x=>x.team)).size,rows.reduce((a,x)=>a+x.team.length,0));
assert.equal(judge(saved,p).ok,true);
}
});

test('repeat.days same puts all visits of a location on one day',()=>{
const saved=v3(easyState({main:2,clinical:8,admin:8}),[2,1]);
saved.locations[0].repeat={people:'different',days:'same'};
const r=solve(saved);
assert.equal(full(r),true);
for(const p of r.plans){
const rows=p.rows.filter(x=>x.loc.id===saved.locations[0].id);
assert.equal(rows.length,2);
assert.equal(new Set(rows.map(x=>x.day)).size,1);
assert.equal(judge(saved,p).ok,true);
}
});

test('repeat.people any lets the same member return',()=>{
const saved=v3(easyState({main:1,clinical:2,admin:2,days:[1,3]}),[2]);
saved.locations[0].repeat={people:'any',days:'separate'};
const r=solve(saved);
assert.equal(full(r),true);
assert.equal(r.achieved,2);
for(const p of r.plans)assert.equal(judge(saved,p).ok,true);
});

test('extra visits are placed only where maxExtra allows and never exceed extraVisits',()=>{
const saved=v3(easyState({main:3,clinical:8,admin:8}),[1,1,1]);
saved.extraVisits=2;
saved.locations[0].maxExtra=1;
saved.locations[2].maxExtra=2;
const r=solve(saved);
assert.equal(r.requested,5);
assert.equal(full(r),true);
for(const p of r.plans){
assert.equal(p.rows.length,5);
assert.equal(judge(saved,p).ok,true);
const per=id=>p.rows.filter(x=>x.loc.id===id).length;
assert.ok(per(saved.locations[0].id)<=2);
assert.equal(per(saved.locations[1].id),1);
assert.ok(per(saved.locations[2].id)<=3);
}
});

test('extra visits with no room are reported as unplaced without a location',()=>{
const saved=v3(easyState({main:2,clinical:8,admin:8}),[1,1]);
saved.extraVisits=1;
const r=solve(saved);
assert.equal(r.requested,3);
assert.equal(r.achieved,2);
assert.equal(r.unplaced.length,1);
assert.equal(r.unplaced[0].locId,null);
});

test('oneVisitPerMember limits every member to one visit',()=>{
const saved=v3(easyState({main:2,clinical:4,admin:4}),[1,1]);
saved.oneVisitPerMember=true;
const r=solve(saved);
assert.equal(full(r),true);
for(const p of r.plans){
const all=p.rows.flatMap(x=>x.team);
assert.equal(new Set(all).size,all.length);
assert.equal(judge(saved,p).ok,true);
}
});

test('a goal pins its location, people and day and raises the visit count',()=>{
const saved=v3(easyState({main:2,clinical:6,admin:6}),[1,1]);
const m1=saved.members[0].id,m2=saved.members[7].id;
saved.goals=[{id:5001,on:true,mode:'pool',size:4,allowed:[],loc:saved.locations[0].id,days:[3],people:[m1,m2],exclude:[],name:''}];
const r=solve(saved);
assert.equal(full(r),true);
for(const p of r.plans){
const row=p.rows.find(x=>x.goal===5001);
assert.ok(row);
assert.equal(row.day,3);
assert.equal(row.loc.id,saved.locations[0].id);
assert.ok(row.team.includes(m1)&&row.team.includes(m2));
assert.equal(judge(saved,p).ok,true);
}
});

test('two goals on one location make it two visits',()=>{
const saved=v3(easyState({main:1,clinical:8,admin:8}),[1]);
const L=saved.locations[0].id;
saved.goals=[
{id:5001,on:true,mode:'pool',size:4,allowed:[],loc:L,days:[1],people:[],exclude:[],name:''},
{id:5002,on:true,mode:'pool',size:4,allowed:[],loc:L,days:[3],people:[],exclude:[],name:''}
];
const E=Engine.createFromSaved(clone(saved),{seed:1});
assert.equal(E.totalRequested(),2);
const r=E.solveNow({seed:1,timeBudgetMs:800});
assert.equal(r.requested,2);
assert.equal(full(r),true);
for(const p of r.plans){
assert.deepEqual(p.rows.map(x=>x.day).sort(),[1,3]);
assert.equal(judge(E.saveObject(),p).ok,true);
}
});

test('a custom-size goal takes exactly its size from the allowed members',()=>{
const saved=v3(easyState({main:1,clinical:6,admin:6}),[1]);
const allowed=saved.members.slice(0,5).map(m=>m.id);
saved.goals=[{id:5001,on:true,mode:'custom',size:3,allowed,loc:saved.locations[0].id,days:[],people:[],exclude:[],name:''}];
const r=solve(saved);
assert.equal(full(r),true);
for(const p of r.plans){
const row=p.rows.find(x=>x.goal===5001);
assert.equal(row.team.length,3);
assert.ok(row.team.every(id=>allowed.includes(id)));
assert.equal(judge(saved,p).ok,true);
}
});

test('week overrides: a member off this week and a closed location are respected',()=>{
const saved=v3(easyState({main:3,clinical:6,admin:6}),[1,1,1]);
const wk=saved.weekStart;
const m=saved.members[0].id,l=saved.locations[0].id;
saved.weekOverrides={[wk]:{holidays:[3],memberOff:{[m]:[1,2]},locClosed:{[l]:[4]}}};
const r=solve(saved);
assert.equal(full(r),true);
for(const p of r.plans){
assert.equal(p.rows.some(x=>x.day===3),false);
assert.equal(judge(saved,p).ok,true);
}
});
