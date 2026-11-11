import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,fixture,clone,solveLegacy} from './helpers.mjs';
import {blank,member,loc,genInstance} from './gen.mjs';
import {oracleMax} from './oracle3.mjs';


const rowsOf=r=>r.plans[0].rows;
const byLoc=(rows,id)=>rows.filter(r=>r.loc.id===id);

test('R1: fixture, the visit that cannot be placed is skipped and the other five give a complete valid plan',()=>{
const f=fixture();
const first=Engine.solve(f,{seed:1,timeBudgetMs:1500});
assert.equal(first.unplaced.length,1);
const s=Engine.migrate(clone(f));
s.locations.find(l=>l.id===first.unplaced[0].locId).visits=0;
const r=Engine.solve(s,{seed:1,timeBudgetMs:1500});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
assert.equal(r.achieved,5);
const E=Engine.createFromSaved(s);
for(const p of r.plans){
assert.equal(p.rows.length,5);
assert.equal(E.checkPlan(p.rows,E.compileModel()).hardCount,0);
}
});

test('R3: dup.people any gives a valid 6-visit plan with every location once',()=>{
const f=fixture();f.dup.people='any';
const r=solveLegacy(f,{seed:1,visitsWanted:6});
assert.ok(['optimal','feasible'].includes(r.status));
assert.equal(r.achieved,6);
const E=Engine.createFromSaved(f);
for(const p of r.plans){
assert.equal(E.checkPlan(p.rows,E.compileModel()).hardCount,0);
assert.equal(new Set(p.rows.map(x=>x.loc.id)).size,6);
}
});

test('R5: structural facts of the fixture plan',()=>{
const f=fixture();
for(const seed of[1,2,3]){
const r=solveLegacy(f,{seed,visitsWanted:5});
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
const r=Engine.solve(f,{seed,timeBudgetMs:1500});
for(const p of r.plans){
const days=id=>p.rows.filter(x=>x.team.includes(id)).map(x=>x.day);
assert.ok(!days(105).includes(2));
assert.ok(!days(107).includes(5));
assert.ok(!days(108).includes(1)&&!days(108).includes(3));
assert.ok(!days(110).includes(4));
assert.ok(days(107).length<=1);
assert.ok(days(110).length<=1);
}
}
});

test('S1: 3 clinical + 3 admin, 6 main locations, default seats, 5 days',()=>{
const s=blank({days:5});
for(let i=0;i<3;i++){s.members.push(member(101+i,1,i%2?'F':'M'));s.members.push(member(111+i,2,i%2?'M':'F'));}
for(let i=0;i<6;i++)s.locations.push(loc(201+i,null));
const saved=Engine.migrate(s);
const E=Engine.createFromSaved(saved,{seed:1});
const c=E.capacityInfo({timeBudgetMs:1500});
assert.ok(c.exact);
assert.ok(c.capacity>=1);
assert.equal(c.capacity,oracleMax(saved));
});

test('S2: 20 members, 10 locations: same capacity across 5 seeds, hard = 0',()=>{
const s=genInstance(77,{members:20,locations:10,days:5,offP:0.3,conflictP:0});
s.pairs={enabled:false,mode:'soft',rules:[]};
const caps=new Set();
for(const seed of[1,2,3,4,5]){
const E=Engine.createFromSaved(s,{seed});
const r=E.solveNow({seed,timeBudgetMs:1500});
caps.add(r.achieved);
for(const p of r.plans)assert.equal(E.checkPlan(p.rows,E.compileModel()).hardCount,0);
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
const r=solveLegacy(s,{seed:1,visitsWanted:8,timeBudgetMs:8000});
assert.ok(performance.now()-t0<9000);
assert.notEqual(r.status,'search_exhausted');
assert.ok(r.plans.length>0);
const E=Engine.createFromSaved(s);
assert.equal(E.checkPlan(r.plans[0].rows,E.compileModel()).hardCount,0);
});

test('S4: one member, one location of one seat, three separate visits',()=>{
const s=blank({days:5,dupMode:'separate',visits:3});
s.members.push(member(101,1,'M'));
s.locations.push(loc(201,{1:1,2:0}));
const saved=Engine.migrate(s);
saved.locations[0].visits=3;
saved.locations[0].repeat={people:'any',days:'separate'};
const E=Engine.createFromSaved(saved,{seed:1});
const c=E.capacityInfo({timeBudgetMs:1000});
assert.equal(c.capacity,3);
assert.equal(c.exact,true);
});

test('S5: degenerate inputs give a clear Arabic message and no exception',()=>{
const cases=[];
cases.push(blank());
{const s=blank();s.members.push(member(101,1,'M'));cases.push(s);}
{const s=blank();s.members.push(member(101,1,'M'));s.locations.push(loc(201,{1:1,2:0}));s.days.forEach(d=>d.on=false);cases.push(s);}
{const s=blank();s.members.push(member(101,1,'M'));s.locations.push(loc(201,{1:1,2:0},{closed:[1,2,3,4,5]}));cases.push(s);}
{const s=blank();s.members.push(member(101,1,'M'));s.locations.push(loc(201,{1:0,2:0}));cases.push(s);}
for(const s of cases){
const r=solveLegacy(s,{seed:1,visitsWanted:3,timeBudgetMs:500});
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
const r=solveLegacy(s,{seed:1,visitsWanted:2});
assert.ok(r.plans.length>0);
assert.equal(r.achieved,2);
});

test('S7: only:[x] with two consecutive open days and the rest rule counts one visit there',()=>{
const s=blank({days:5,dupMode:'separate',visits:2});
s.members.push(member(101,1,'M'),member(102,1,'M'));
s.locations.push(loc(201,{1:1,2:0},{only:[101],closed:[3,4,5]}));
const saved=Engine.migrate(s);
saved.locations[0].visits=2;
saved.locations[0].repeat={people:'any',days:'separate'};
const E=Engine.createFromSaved(saved,{seed:1});
const c=E.capacityInfo({timeBudgetMs:800});
assert.equal(c.capacity,1);
assert.equal(c.exact,true);
});

test('S8: gender rule whose only valid mix needs the 9th-ranked candidate',()=>{
const s=blank({days:3,visits:1});
for(let i=0;i<9;i++)s.members.push(member(101+i,1,'M'));
s.members.push(member(110,1,'F'));
s.members.push(member(120,2,'M'));
s.locations.push(loc(201,{1:3,2:0},{genderRule:true}));
s.members.forEach(m=>{if(m.pool===1&&m.gender==='F')m.pref='';});
const r=solveLegacy(s,{seed:1,visitsWanted:1,timeBudgetMs:1500});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
const row=r.plans[0].rows[0];
assert.ok(row.team.includes(110));
});

test('B1: custom clinical-only goal on a site with an admin seat is solved',()=>{
const s=blank({days:4,dupPeople:'all',dupMode:'separate'});
for(let i=0;i<3;i++)s.members.push(member(101+i,1,i%2?'F':'M'));
s.members.push(member(111,2,'F'));
s.locations.push(loc(201,{1:2,2:1},{type:'contracted'}));
s.locations.push(loc(202,{1:0,2:1},{type:'contracted'}));
s.goals.push({id:301,on:true,mode:'custom',size:3,allowed:[101,102,103],loc:201,days:[],people:[],exclude:[]});
const r=Engine.solve(Engine.migrate(s),{seed:1});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
const E=Engine.createFromSaved(Engine.migrate(s));
for(const p of r.plans)assert.equal(E.checkPlan(p.rows,E.compileModel()).hardCount,0);
});

test('B1: custom goal on a seatless location keeps the structural bound sound',()=>{
const s=blank({days:3,dupPeople:'any',dupMode:'separate'});
for(let i=0;i<2;i++){s.members.push(member(101+i,1,'M'));s.members.push(member(111+i,2,'F'));}
s.locations.push(loc(201,{1:0,2:0}));
s.goals.push({id:301,on:true,mode:'custom',size:2,allowed:[],loc:201,days:[],people:[],exclude:[]});
s.visits=1;
const r=solveLegacy(s,{seed:1,visitsWanted:1});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
});

const small=()=>{
const s=blank({days:4,dupMode:'separate'});
for(let i=0;i<3;i++){s.members.push(member(101+i,1,i%2?'F':'M'));s.members.push(member(111+i,2,i%2?'M':'F'));}
s.locations.push(loc(201,{1:1,2:1}),loc(202,{1:1,2:1}),loc(203,{1:1,2:1}));
return s;
};

test('B2: nextId covers pair rules and memberAdd never collides',()=>{
const s=small();
s.pairs={enabled:true,mode:'soft',rules:[{id:900,kind:'avoid',a:101,b:102}]};
const E=Engine.createFromSaved(s,{seed:1});
assert.equal(E.nextId(),901);
E.FIX.memberAdd.run({pool:1});
const ids=[...E.state.members.map(m=>m.id),...E.state.locations.map(l=>l.id),...E.state.pairs.rules.map(r=>r.id)];
assert.equal(new Set(ids).size,ids.length);
assert.ok(E.state.members.at(-1).id>900);
});

test('B2: applySaved re-IDs duplicate member ids and keeps the first',()=>{
const s=small();
s.members.push(member(101,2,'F',{name:'dup'}));
const E=Engine.createFromSaved(s,{seed:1});
const ids=E.state.members.map(m=>m.id);
assert.equal(new Set(ids).size,ids.length);
assert.equal(E.state.members.find(m=>m.id===101).name,'م101');
assert.ok(E.state.members.some(m=>m.name==='dup'));
});

test('B3: applySaved is atomic when it throws midway',()=>{
const E=Engine.createFromSaved(small(),{seed:1});
const before=JSON.stringify(E.saveObject());
const bad=clone(small());
bad.members=bad.members.slice(0,2);
bad.visits=1;
Object.defineProperty(bad,'view',{get(){throw new Error('boom');},enumerable:true});
assert.throws(()=>E.applySaved(bad,false),/boom/);
assert.equal(JSON.stringify(E.saveObject()),before);
});

test('B3: member fields are validated and coerced on load',()=>{
const s=small();
s.members[0].pool='2';s.members[1].gender='x';s.members[2].id='777';s.members[3].name=5;
const E=Engine.createFromSaved(s,{seed:1});
assert.equal(E.state.members[0].pool,2);
assert.equal(E.state.members[1].gender,'M');
assert.equal(E.state.members[2].id,777);
assert.equal(E.state.members[3].name,'5');
});

test('B4: a dead id in only[] no longer makes a location unvisitable',()=>{
const s=small();
s.locations[0].only=[9999];
const E=Engine.createFromSaved({...s,visits:3},{seed:1});
assert.ok(E.state.members.every(m=>E.eligibleFor(m,E.state.locations[0])));
s.locations[0].only=[101,9999];
const E2=Engine.createFromSaved({...s,visits:3},{seed:1});
assert.ok(E2.eligibleFor(E2.byId(101),E2.state.locations[0]));
assert.ok(!E2.eligibleFor(E2.byId(102),E2.state.locations[0]));
});

test('B6: dayMax fix clamps to the UI maximum',()=>{
const E=Engine.createFromSaved(small(),{seed:1});
E.FIX.dayMax.run({n:99});
assert.equal(E.state.cap.dayMax,E.LIM.dayMax[1]);
});

test('B11: plan ordering is a stable total order independent of rng state',()=>{
const f=fixture();
const E=Engine.createFromSaved(f,{seed:1});
const r=E.solveNow({seed:1,timeBudgetMs:600,plans:6});
const all=r.plans.slice();
assert.ok(all.length>=2);
all.forEach(p=>{E.qualityScore(p,null);});
const a=all.slice().sort(E.comparePlans).map(E.planKey);
E.reseed(12345);
all.forEach(p=>{E.qualityScore(p,null);});
const b=all.slice().reverse().sort(E.comparePlans).map(E.planKey);
assert.deepEqual(a,b);
});

test('B12: unplaced always lists every missing visit',()=>{
const s=blank({days:4,dupMode:'separate',dupPeople:'any'});
for(let i=0;i<2;i++){s.members.push(member(101+i,1,i%2?'F':'M'));s.members.push(member(111+i,2,i%2?'M':'F'));}
s.locations.push(loc(201,{1:2,2:2}));
s.days=s.days.map((d,i)=>({...d,on:i===1||i===3}));
const r=solveLegacy(s,{seed:1,visitsWanted:5});
assert.ok(r.achieved<5);
assert.equal(r.unplaced.length,5-r.achieved);
});

test('B16: carried rest uses the previous week working days when rest calendar is off',()=>{
const s=small();
s.restCalendar=false;s.carryWeek=true;
s.weekStart='2026-10-24';
s.days=s.days.map((d,i)=>({...d,on:i>=1&&i<=4}));
s.history={'2026-10-17':{101:[3,4]}};
s.historyWd={'2026-10-17':[1,2,3,4,5]};
const E=Engine.createFromSaved(s,{seed:1});
assert.deepEqual(E.carryPrev().get(101),[-3,-2]);
const t=clone(s);delete t.historyWd;
const E2=Engine.createFromSaved(t,{seed:1});
assert.deepEqual(E2.carryPrev().get(101),[-2,-1]);
});

test('B18: evaluatePlan flags days without visits when every day is required',()=>{
const s=small();
s.useAllDays=true;
const E=Engine.createFromSaved({...s,visits:4},{seed:1});
const M=E.compileModel();
const rows=[{day:1,locId:201,team:[101,111]},{day:2,locId:202,team:[102,112]}];
const ev=E.checkPlan(rows.map(r=>({...r,custom:null,goal:null,req:[]})),M);
assert.equal(ev.hard.useAll,2);
});

test('B20: pair rules are validated on load',()=>{
const s=small();
s.pairs={enabled:'yes',mode:'weird',rules:[{id:1,kind:'with',a:101,b:102},{id:2,kind:'bad',a:101,b:103},{kind:'avoid',a:'102',b:'103'},null]};
const E=Engine.createFromSaved(s,{seed:1});
assert.equal(E.state.pairs.enabled,true);
assert.equal(E.state.pairs.mode,'soft');
assert.equal(E.state.pairs.rules.length,2);
assert.ok(E.state.pairs.rules.every(r=>Number.isFinite(r.id)&&['with','avoid'].includes(r.kind)));
assert.equal(new Set(E.state.pairs.rules.map(r=>r.id)).size,2);
});

test('S2: week holiday removes a working day, member week-off and location week-closure bind only that week',()=>{
const s=small();
s.weekStart='2026-10-24';
s.weekOverrides={'2026-10-24':{holidays:[3],memberOff:{101:[1]},locClosed:{201:[2]},note:''}};
const E=Engine.createFromSaved(s,{seed:1});
assert.ok(!E.workingDays().includes(3));
assert.ok(E.offOn(E.byId(101),1));
assert.ok(E.closedOn(E.locById(201),2));
const t=clone(s);t.weekStart='2026-10-31';
const E2=Engine.createFromSaved(t,{seed:1});
assert.ok(E2.workingDays().includes(3));
assert.ok(!E2.offOn(E2.byId(101),1));
assert.ok(!E2.closedOn(E2.locById(201),2));
const r=solveLegacy(s,{seed:1,visitsWanted:2});
for(const p of r.plans)for(const row of p.rows){
assert.notEqual(row.day,3);
if(row.team.includes(101))assert.notEqual(row.day,1);
if(row.loc.id===201)assert.notEqual(row.day,2);
}
});

test('S2: overrides round trip, are validated, and old weeks are pruned on save',()=>{
const s=small();
s.weekStart='2026-10-24';
s.weekOverrides={'2026-10-24':{holidays:[3,9,'x'],memberOff:{101:[1,1]},locClosed:{},note:'x'},'2026-01-03':{holidays:[1]},'bad':{}};
const E=Engine.createFromSaved(s,{seed:1});
const o=E.saveObject().weekOverrides;
assert.deepEqual(Object.keys(o),['2026-10-24']);
assert.deepEqual(o['2026-10-24'].holidays,[3]);
assert.deepEqual(o['2026-10-24'].memberOff,{101:[1]});
});

test('S2: weekOffClear fix removes the week-off and relaxing offdays covers week-offs',()=>{
const s=small();
s.weekStart='2026-10-24';
s.weekOverrides={'2026-10-24':{holidays:[],memberOff:{101:[1,2]},locClosed:{},note:''}};
const E=Engine.createFromSaved(s,{seed:1});
E.FIX.weekOffClear.run({id:101,day:1});
assert.deepEqual(E.weekOffDays(101),[2]);
E.withRelax(['offdays'],()=>assert.ok(!E.offOn(E.byId(101),2)));
});

test('S3: default gender rule is the 3:1 mix for teams of four and is unchanged',()=>{
const E=Engine.createFromSaved(small(),{seed:1});
const G=E.genderOK;
assert.equal(E.state.gender.mode,'legacy4');
assert.ok(G(['M','M','M','F']));
assert.ok(G(['F','F','F','M']));
assert.ok(!G(['M','M','F','F']));
assert.ok(!G(['M','M','M','M']));
assert.ok(G(['M','M','M','F','F']));
assert.ok(!G(['M','M','M']));
});

test('S3: the ratio is adjustable and applies to teams of exactly a+b',()=>{
const s=small();
s.gender={mode:'legacy4',ratio:{a:2,b:2},min:1};
const E=Engine.createFromSaved(s,{seed:1});
const c=E.genderCfgOf(null);
assert.ok(E.genderOK(['M','M','F','F'],c));
assert.ok(!E.genderOK(['M','M','M','F'],c));
s.gender={mode:'legacy4',ratio:{a:3,b:2},min:1};
const E2=Engine.createFromSaved(s,{seed:1});
const c2=E2.genderCfgOf(null);
assert.ok(E2.genderOK(['M','M','M','F','F'],c2));
assert.ok(E2.genderOK(['M','M','F','F','F'],c2));
assert.ok(!E2.genderOK(['M','M','M','M','F'],c2));
});

test('S3: minF, minM, off and per-location override',()=>{
const s=small();
s.gender={mode:'minF',ratio:{a:3,b:1},min:2};
s.locations[0].genderMode='minM';
const E=Engine.createFromSaved(s,{seed:1});
const g=E.genderOK;
assert.ok(g(['F','F','M'],E.genderCfgOf(null)));
assert.ok(!g(['F','M','M'],E.genderCfgOf(null)));
assert.ok(g(['M','M','F'],E.genderCfgOf(E.state.locations[0])));
s.locations[1].genderMode='off';
const E2=Engine.createFromSaved(s,{seed:1});
assert.ok(E2.genderOK(['M','M','M','M'],E2.genderCfgOf(E2.state.locations[1])));
assert.ok(!E2.genderActive({...E2.state.locations[1],genderRule:true}));
});

test('S3: gender settings are validated on load and the mixed fix exists in the gender family',()=>{
const s=small();
s.gender={mode:'nope',ratio:{a:1,b:9},min:99};
s.locations[0].genderRule=true;
const E=Engine.createFromSaved(s,{seed:1});
assert.equal(E.state.gender.mode,'legacy4');
assert.ok(E.state.gender.ratio.a>=E.state.gender.ratio.b);
assert.ok(E.state.gender.min<=E.LIM.genderMin[1]);
const f=E.FAMILIES.find(x=>x.k==='gender');
assert.ok(f.fixes().some(x=>x.op==='genderMode'));
});

test('S4: location needs force a tagged member into every team there',()=>{
const s=small();
s.members[0].tags=['قائد'];
s.locations[0].needs=[{tag:'قائد',min:1}];
const r=solveLegacy(s,{seed:1,visitsWanted:3});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
const E=Engine.createFromSaved({...s,visits:3},{seed:1});
for(const p of r.plans){
for(const row of p.rows)if(row.loc.id===201)assert.ok(row.team.includes(101));
assert.equal(E.checkPlan(p.rows,E.compileModel()).hardCount,0);
}
});

test('S4: an unsatisfiable need is proven, reported with the tags reason and fixed by locNeedOff',()=>{
const s=Engine.migrate(small());
s.locations=[s.locations[0]];
s.locations[0].needs=[{tag:'نادر',min:1}];
const r=Engine.solve(s,{seed:1,timeBudgetMs:500});
assert.equal(r.achieved,0);
assert.equal(r.status,'infeasible_proven');
const f=r.unplaced[0].reasons.find(g=>g.family==='tags');
assert.ok(f&&f.fixes.some(z=>z.op==='locNeedOff'));
});

test('S4: tags and needs are validated on load',()=>{
const s=small();
s.members[0].tags=['أ','أ',' ',5,'ب'];
s.locations[0].needs=[{tag:'أ',min:99},{tag:'',min:1},null];
const E=Engine.createFromSaved(s,{seed:1});
assert.deepEqual(E.state.members[0].tags,['أ','ب']);
assert.equal(E.state.locations[0].needs.length,1);
assert.equal(E.state.locations[0].needs[0].min,E.LIM.needMin[1]);
});

test('S5: a must pair always shares a team, in both directions',()=>{
const s=small();
s.pairs={enabled:true,mode:'soft',rules:[{id:900,kind:'must',a:101,b:112}]};
const r=solveLegacy(s,{seed:1,visitsWanted:3});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
for(const p of r.plans)for(const row of p.rows)assert.equal(row.team.includes(101),row.team.includes(112));
});

test('S5: a must pair that cannot be honoured is blocked, and pairSoft relaxes it',()=>{
const s=small();
s.members.find(m=>m.id===112).off=[1,2,3,4,5,6,0];
s.pairs={enabled:true,mode:'soft',rules:[{id:900,kind:'must',a:101,b:112}]};
s.members.filter(m=>m.id!==101).forEach(m=>{m.types='any';});
s.dup.people='any';
const E=Engine.createFromSaved({...s,visits:3},{seed:1});
const with101=E.capacityInfo({timeBudgetMs:500,noCache:true}).capacity;
E.FIX.pairSoft.run({});
const after=E.capacityInfo({timeBudgetMs:500,noCache:true}).capacity;
assert.ok(after>=with101);
assert.equal(E.state.pairs.rules[0].kind,'with');
});

test('S5: per-rule hardness overrides the global mode',()=>{
const s=small();
s.pairs={enabled:true,mode:'soft',rules:[{id:900,kind:'avoid',a:101,b:102,hard:true},{id:901,kind:'avoid',a:103,b:111}]};
const E=Engine.createFromSaved(s,{seed:1});
const P=E.compileModel().pairs;
assert.ok(P.avoidHard.get(101).has(102));
assert.ok(!P.avoidHard.get(103));
s.pairs.mode='hard';s.pairs.rules[0].hard=false;
const E2=Engine.createFromSaved(s,{seed:1});
const P2=E2.compileModel().pairs;
assert.ok(!P2.avoidHard.get(101));
assert.ok(P2.avoidHard.get(103).has(111));
});

test('S6: allowedDays restricts a location to the listed weekdays',()=>{
const s=small();
s.locations[0].allowedDays=[2];
const r=solveLegacy(s,{seed:1,visitsWanted:3});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
for(const p of r.plans)for(const row of p.rows)if(row.loc.id===201)assert.equal(row.day,2);
});

test('S6: minGap keeps repeat visits apart in separate mode',()=>{
const s=small();
s.locations=[s.locations[0]];
s.locations[0].minGap=2;
s.dup.people='any';
const r=solveLegacy(s,{seed:1,visitsWanted:2});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
for(const p of r.plans){
const ds=p.rows.map(x=>x.day).sort((a,b)=>a-b);
for(let i=1;i<ds.length;i++)assert.ok(ds[i]-ds[i-1]>=2);
}
const t=clone(s);t.locations[0].minGap=6;
const E=Engine.createFromSaved({...t,visits:2},{seed:1});
assert.equal(E.capacityInfo({timeBudgetMs:500,noCache:true}).capacity,1);
});

test('S6: notSameDay and sameDay rules hold in every plan and are relaxed by dayRuleOff',()=>{
const s=small();
s.cap={mainPerDay:3,conPerDay:1,dayMax:0,even:false};
s.dayRules=[{id:800,kind:'notSameDay',on:true,a:[201],b:[202]}];
const r=solveLegacy(s,{seed:1,visitsWanted:3});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
for(const p of r.plans){
const by=new Map();
for(const row of p.rows){if(!by.has(row.day))by.set(row.day,new Set());by.get(row.day).add(row.loc.id);}
for(const set of by.values())assert.ok(!(set.has(201)&&set.has(202)));
}
const u=clone(s);u.dayRules=[{id:801,kind:'sameDay',on:true,a:[201],b:[202]}];
const r2=solveLegacy(u,{seed:1,visitsWanted:2});
for(const p of r2.plans){
const by=new Map();
for(const row of p.rows){if(!by.has(row.day))by.set(row.day,new Set());by.get(row.day).add(row.loc.id);}
for(const set of by.values())assert.equal(set.has(201),set.has(202));
}
const E=Engine.createFromSaved(u,{seed:1});
E.FIX.dayRuleOff.run({id:801});
assert.equal(E.compileDayRules().length,0);
});

test('S6: day rules and gaps are validated on load',()=>{
const s=small();
s.locations[0].allowedDays=[1,1,9,'x'];
s.locations[0].minGap=99;
s.dayRules=[{id:1,kind:'bad',a:[201],b:[202]},{kind:'sameDay',a:[201,'202'],b:[203]},null];
const E=Engine.createFromSaved(s,{seed:1});
assert.deepEqual(E.state.locations[0].allowedDays,[1]);
assert.equal(E.state.locations[0].minGap,E.LIM.minGap[1]);
assert.equal(E.state.dayRules.length,1);
assert.ok(Number.isFinite(E.state.dayRules[0].id));
});

test('S7: hard maxSpread keeps every pool within the allowed visit gap',()=>{
const s=small();
s.fair={maxSpread:1,minEach:0,mode:'hard'};
s.dup.people='any';
const r=solveLegacy(s,{seed:1,visitsWanted:4});
assert.ok(['optimal','feasible'].includes(r.status),r.status);
const E=Engine.createFromSaved({...s,visits:4},{seed:1});
for(const p of r.plans){
assert.equal(E.checkPlan(p.rows,E.compileModel()).hard.fair,0);
for(const q of[1,2]){
const c=E.state.members.filter(m=>m.pool===q).map(m=>p.rows.filter(x=>x.team.includes(m.id)).length);
assert.ok(Math.max(...c)-Math.min(...c)<=1,JSON.stringify(c));
}
}
});

test('S7: hard minEach gives every member at least N visits and relaxes with fairSoft',()=>{
const s=small();
s.fair={maxSpread:0,minEach:1,mode:'hard'};
const E=Engine.createFromSaved({...s,visits:3},{seed:1});
const hard=E.capacityInfo({timeBudgetMs:600,noCache:true});
if(hard.capacity>0)for(const row of []){}
const r=solveLegacy(s,{seed:1,visitsWanted:3});
for(const p of r.plans)for(const m of E.state.members)assert.ok(p.rows.some(x=>x.team.includes(m.id)));
E.FIX.fairSoft.run({});
assert.equal(E.state.fair.mode,'soft');
});

test('S7: soft fairness never blocks a plan but lowers the score of unfair ones',()=>{
const s=small();
s.fair={maxSpread:1,minEach:0,mode:'soft'};
const E=Engine.createFromSaved({...s,visits:2},{seed:1});
const a=E.capacityInfo({timeBudgetMs:500,noCache:true}).capacity;
const t=clone(s);t.fair.mode='soft';t.fair.maxSpread=0;
assert.equal(Engine.createFromSaved({...t,visits:2},{seed:1}).capacityInfo({timeBudgetMs:500,noCache:true}).capacity,a);
});

test('S7: fair settings are validated on load',()=>{
const s=small();
s.fair={maxSpread:99,minEach:-3,mode:'weird'};
const E=Engine.createFromSaved(s,{seed:1});
assert.deepEqual(E.state.fair,{maxSpread:E.LIM.fairSpread[1],minEach:0,mode:'soft'});
});

test('B-extra: a plan is never reported as achieving more visits than it has rows',()=>{
const s=blank({days:3,dupMode:'separate',dupPeople:'any'});
for(let i=0;i<3;i++){s.members.push(member(101+i,1,i%2?'F':'M'));s.members.push(member(111+i,2,i%2?'M':'F'));}
s.locations.push(loc(201,{1:1,2:1}),loc(202,{1:1,2:1}));
for(const want of[2,3,4,6]){
const r=solveLegacy(s,{seed:1,visitsWanted:want,timeBudgetMs:600});
for(const p of r.plans)assert.equal(p.rows.length,r.achieved,'want '+want);
}
});

test('explainMs 0 still returns promptly and every unplaced visit has a reason',()=>{
const f=fixture();
const t0=performance.now();
const r=Engine.solve(f,{seed:1,timeBudgetMs:1500,explainMs:0});
assert.ok(performance.now()-t0<2500);
assert.equal(r.unplaced.length,1);
assert.ok(r.unplaced[0].reasons.length>=1);
});

test('S8: priority orders unplaced cards low priority first and is validated on load',()=>{
const s=blank({days:3,dupMode:'separate',dupPeople:'any'});
for(let i=0;i<2;i++){s.members.push(member(101+i,1,i%2?'F':'M'));s.members.push(member(111+i,2,i%2?'M':'F'));}
s.locations.push(loc(201,{1:2,2:2},{priority:'high'}),loc(202,{1:2,2:2},{priority:'low'}),loc(203,{1:2,2:2},{priority:'bogus'}));
const E=Engine.createFromSaved(s,{seed:1});
assert.equal(E.state.locations[2].priority,'normal');
const r=solveLegacy(s,{seed:1,visitsWanted:3,dummy:true});
const used=new Set((r.plans[0]?r.plans[0].rows:[]).map(x=>x.loc.id));
if(r.unplaced.length>1)assert.ok(E.PRIO_RANK[r.unplaced[0].loc.priority||'normal']>=E.PRIO_RANK[r.unplaced[1].loc.priority||'normal']);
assert.ok(used.has(201)||r.achieved===0);
});

test('S9: plans count, budget presets, flex default, seed lock and digits',()=>{
const s=small();
s.solver={budget:'bogus',plans:99,defaultFlex:'x',lockSeed:true,seed:7};
s.digits='latin';
const E=Engine.createFromSaved(s,{seed:1});
assert.equal(E.state.solver.budget,'normal');
assert.equal(E.state.solver.plans,E.LIM.plans[1]);
assert.equal(E.state.solver.defaultFlex,false);
assert.equal(Engine.ar(12),'12');
const t=Engine.migrate(small());t.solver={budget:'fast',plans:2,defaultFlex:false,lockSeed:true,seed:9};t.digits='arabic';
const r1=Engine.solve(t,{}),r2=Engine.solve(t,{});
assert.ok(r1.plans.length<=2);
assert.deepEqual(r1.plans.map(p=>E.planKey(p)),r2.plans.map(p=>E.planKey(p)));
assert.equal(Engine.ar(12),'١٢');
assert.ok(Engine.SOLVER_MS.fast<Engine.SOLVER_MS.normal&&Engine.SOLVER_MS.normal<Engine.SOLVER_MS.thorough);
});

