import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,fixture,clone} from './helpers.mjs';
import {blank,member,loc,genInstance} from './gen.mjs';
import {oracleCapacity} from './oracle.mjs';

const rowsOf=r=>r.plans[0].rows;
const byLoc=(rows,id)=>rows.filter(r=>r.loc.id===id);

test('R1: fixture as is, request 5',()=>{
const r=Engine.solve(fixture(),{seed:1,visitsWanted:5});
assert.ok(['optimal','feasible'].includes(r.status));
assert.equal(r.achieved,5);
const E=Engine.createFromSaved(fixture());
for(const p of r.plans){
assert.equal(p.rows.length,5);
assert.equal(E.checkPlan(p.rows,E.compileModel()).hardCount,0);
}
});

test('R2: fixture, request 6 is proven infeasible, 5 achieved, explained',()=>{
const f=fixture();
const r=Engine.solve(f,{seed:1,visitsWanted:6});
assert.equal(r.status,'infeasible_proven');
assert.equal(r.achieved,5);
assert.ok(r.plans.length>0);
assert.equal(r.unplaced.length,1);
const E=Engine.createFromSaved({...f,visits:6});
const x=E.explain({visits:6});
const seats=x.findings.find(g=>g.family==='seats'&&g.numbers.pool===2);
assert.ok(seats);
assert.equal(seats.numbers.need,6);
assert.equal(seats.numbers.have,5);
assert.ok(seats.reasons.includes('dupPeople'));
assert.ok(seats.fixes.some(z=>z.op==='dupPeople'));
for(const fx of seats.fixes){
const E2=Engine.createFromSaved({...clone(f),visits:6});
E2.FIX[fx.op].run(fx);
E2.state.visitsWanted=6;E2.state.visits=6;
assert.ok(E2.capacityInfo({timeBudgetMs:800,noCache:true}).capacity>=6,'fix does not reach 6: '+JSON.stringify(fx));
}
});

test('R3: dup.people any gives a valid 6-visit plan with every location once',()=>{
const f=fixture();f.dup.people='any';
const r=Engine.solve(f,{seed:1,visitsWanted:6});
assert.ok(['optimal','feasible'].includes(r.status));
assert.equal(r.achieved,6);
const E=Engine.createFromSaved(f);
for(const p of r.plans){
assert.equal(E.checkPlan(p.rows,E.compileModel()).hardCount,0);
assert.equal(new Set(p.rows.map(x=>x.loc.id)).size,6);
}
});

test('R4: reducing location 121 to one admin seat still cannot reach 6 because of the gender rule; turning it off at 119/120/121 can',()=>{
const f=fixture();
f.locations.find(l=>l.id===121).seats={1:1,2:1};
const E=Engine.createFromSaved({...f,visits:6});
assert.equal(E.capacityInfo({timeBudgetMs:1500,noCache:true}).capacity,5);
const x=E.explain({visits:6});
assert.ok(x.findings.some(g=>g.family==='gender'));
const g2=clone(f);
for(const id of[119,120,121])g2.locations.find(l=>l.id===id).genderRule=false;
const r=Engine.solve(g2,{seed:1,visitsWanted:6});
assert.equal(r.achieved,6);
});

test('R5: structural facts of the fixture plan',()=>{
const f=fixture();
for(const seed of[1,2,3]){
const r=Engine.solve(f,{seed,visitsWanted:5});
for(const p of r.plans){
const rows=p.rows;
for(const row of byLoc(rows,116)){assert.equal(row.day,2);assert.ok(row.team.includes(101));}
for(const row of byLoc(rows,117)){assert.equal(row.day,2);assert.ok(row.team.every(id=>[106,104,111].includes(id)));}
for(const row of byLoc(rows,118)){assert.equal(row.day,4);assert.ok(row.team.includes(109));}
const clin=new Set([101,102,103,104,105,106]);
const A=new Set(rows.filter(x=>[118,119].includes(x.loc.id)).flatMap(x=>x.team).filter(id=>clin.has(id)));
const B=new Set(rows.filter(x=>[116,117].includes(x.loc.id)).flatMap(x=>x.team).filter(id=>clin.has(id)));
for(const id of A)assert.ok(!B.has(id),'conflict 122 violated by '+id);
}
}
});

test('R6: fixture member restrictions',()=>{
const f=fixture();
for(const seed of[1,2,3]){
const r=Engine.solve(f,{seed,visitsWanted:5});
for(const p of r.plans){
const days=id=>p.rows.filter(x=>x.team.includes(id)).map(x=>x.day);
assert.ok(!days(105).includes(2));
assert.ok(!days(107).includes(5));
assert.ok(!days(108).includes(1)&&!days(108).includes(3));
assert.ok(!days(110).includes(4));
assert.equal(days(107).length,1);
assert.equal(days(110).length,1);
}
}
});

test('S1: 3 clinical + 3 admin, 6 main locations, default seats, 5 days',()=>{
const s=blank({days:5});
for(let i=0;i<3;i++){s.members.push(member(101+i,1,i%2?'F':'M'));s.members.push(member(111+i,2,i%2?'M':'F'));}
for(let i=0;i<6;i++)s.locations.push(loc(201+i,null));
const E=Engine.createFromSaved(s,{seed:1});
const c=E.capacityInfo({timeBudgetMs:1500,noCache:true});
assert.ok(c.exact);
assert.ok(c.capacity<=c.ub);
assert.ok(c.capacity>=1);
const o=oracleCapacity(s,{maxV:3,maxNodes:3e6});
assert.ok(c.capacity>=Math.min(o,3));
});

test('S2: 20 members, 10 locations: same exact capacity across 5 seeds, hard = 0',()=>{
const s=genInstance(77,{members:20,locations:10,days:5,offP:0.3,conflictP:0});
s.pairs={enabled:false,mode:'soft',rules:[]};
const caps=new Set();
for(const seed of[1,2,3,4,5]){
const E=Engine.createFromSaved(s,{seed});
const c=E.capacityInfo({timeBudgetMs:1500,noCache:true,seed});
assert.ok(c.exact,'not exact for seed '+seed);
caps.add(c.capacity);
if(c.plan)assert.equal(E.checkPlan(c.plan.rows,E.compileModel()).hardCount,0);
}
assert.equal(caps.size,1);
});

test('S3: 30 members, 20 locations, all rule families on, solved within the extended budget',()=>{
const s=genInstance(31,{members:30,locations:20,days:5,offP:0.2,conflictP:1,genderP:1});
s.pairs={enabled:true,mode:'hard',rules:[{id:9001,kind:'avoid',a:101,b:102},{id:9002,kind:'avoid',a:103,b:104}]};
s.goals=[{id:9100,on:true,mode:'pool',size:2,allowed:[],loc:s.locations[3].id,days:[],people:[],exclude:[]}];
for(const l of s.locations){l.only=[];l.ban=[];l.maxWeek=0;l.closed=l.closed.slice(0,1);}
s.dup.people='any';s.dup.mode='banned';
const t0=performance.now();
const r=Engine.solve(s,{seed:1,visitsWanted:8,timeBudgetMs:8000});
assert.ok(performance.now()-t0<9000);
assert.notEqual(r.status,'search_exhausted');
assert.ok(r.plans.length>0);
const E=Engine.createFromSaved(s);
assert.equal(E.checkPlan(r.plans[0].rows,E.compileModel()).hardCount,0);
});

test('S4: one member, one location of one seat, separate repeats',()=>{
const s=blank({days:5,dupMode:'separate',visits:3});
s.members.push(member(101,1,'M'));
s.locations.push(loc(201,{1:1,2:0}));
const E=Engine.createFromSaved(s,{seed:1});
const c=E.capacityInfo({timeBudgetMs:1000,noCache:true});
assert.equal(c.capacity,oracleCapacity(s,{maxV:5}));
assert.equal(c.capacity,3);
});

test('S5: degenerate inputs give a clear Arabic message and no exception',()=>{
const cases=[];
cases.push(blank());
{const s=blank();s.members.push(member(101,1,'M'));cases.push(s);}
{const s=blank();s.members.push(member(101,1,'M'));s.locations.push(loc(201,{1:1,2:0}));s.days.forEach(d=>d.on=false);cases.push(s);}
{const s=blank();s.members.push(member(101,1,'M'));s.locations.push(loc(201,{1:1,2:0},{closed:[1,2,3,4,5]}));cases.push(s);}
{const s=blank();s.members.push(member(101,1,'M'));s.locations.push(loc(201,{1:0,2:0}));cases.push(s);}
for(const s of cases){
const r=Engine.solve(s,{seed:1,visitsWanted:3,timeBudgetMs:500});
assert.equal(r.status,'infeasible_proven');
assert.equal(r.plans.length,0);
assert.ok(/[\u0600-\u06FF]/.test(r.message||''),'no Arabic message');
}
});

test('S6: invalid goals are flagged and the rest of the plan is still produced',()=>{
const s=blank({days:5,visits:2});
for(let i=0;i<3;i++){s.members.push(member(101+i,1,i%2?'F':'M'));s.members.push(member(111+i,2,i%2?'M':'F'));}
s.members[0].off=[2];
for(let i=0;i<4;i++)s.locations.push(loc(201+i,{1:1,2:1}));
s.locations[0].closed=[3];
s.goals=[
{id:9101,on:true,mode:'pool',size:2,allowed:[],loc:201,days:[3],people:[],exclude:[]},
{id:9102,on:true,mode:'pool',size:2,allowed:[],loc:202,days:[2],people:[101],exclude:[]}
];
const E=Engine.createFromSaved(s);
const M=E.compileModel();
const gi=E.compileGoals();
assert.ok(gi.issues.has(9101));
assert.ok(gi.issues.has(9102));
const r=Engine.solve(s,{seed:1,visitsWanted:2});
assert.ok(r.plans.length>0);
assert.equal(r.achieved,2);
});

test('S7: only:[x] on two consecutive open days counts one visit there',()=>{
const s=blank({days:5,dupMode:'separate',visits:2});
s.members.push(member(101,1,'M'),member(102,1,'M'));
s.locations.push(loc(201,{1:1,2:0},{only:[101],closed:[3,4,5]}));
const E=Engine.createFromSaved(s,{seed:1});
const c=E.capacityInfo({timeBudgetMs:800,noCache:true});
assert.equal(c.capacity,1);
assert.equal(c.ub,1);
assert.equal(oracleCapacity(s,{maxV:3}),1);
});

test('S8: gender rule whose only valid mix needs the 9th-ranked candidate',()=>{
const s=blank({days:3,visits:1});
for(let i=0;i<9;i++)s.members.push(member(101+i,1,'M'));
s.members.push(member(110,1,'F'));
s.members.push(member(120,2,'M'));
s.locations.push(loc(201,{1:3,2:0},{genderRule:true}));
s.members.forEach(m=>{if(m.pool===1&&m.gender==='F')m.pref='';});
const r=Engine.solve(s,{seed:1,visitsWanted:1,timeBudgetMs:1500});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
const row=r.plans[0].rows[0];
assert.ok(row.team.includes(110));
});
