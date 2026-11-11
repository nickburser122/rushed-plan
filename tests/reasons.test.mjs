import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,fixture,clone} from './helpers.mjs';
import {easyState} from './build.mjs';
import {judge} from './judge.mjs';

const v3=(saved,visits)=>{
const s=clone(saved);
s.v=3;
s.extraVisits=0;
s.locations.forEach((l,i)=>{l.visits=visits?visits[i]:1;l.repeat={people:'different',days:'separate'};l.maxExtra=0;});
return s;
};

const solve=(saved,ms=1200)=>Engine.createFromSaved(clone(saved),{seed:1}).solveNow({seed:1,timeBudgetMs:ms});

function applyFix(saved,fx){
const E=Engine.createFromSaved(clone(saved),{seed:1});
E.FIX[fx.op].run(fx);
return E.solveNow({seed:1,timeBudgetMs:800,plans:1});
}

test('T-REAL-1 the user fixture: six requested, five proven, one unplaced with a verified fix',()=>{
const f=fixture();
const E=Engine.createFromSaved(clone(f),{seed:1});
assert.equal(E.totalRequested(),6);
const r=E.solveNow({seed:1,timeBudgetMs:3000});
assert.equal(r.status,'partial_proven');
assert.equal(r.achieved,5);
assert.equal(r.exact,true);
assert.equal(r.unplaced.length,1);
const reasons=r.unplaced[0].reasons;
const people=reasons.find(x=>x.family==='dupPeople');
assert.ok(people,'dupPeople reason');
assert.ok(people.fixes.some(z=>z.op==='dupPeople'));
const after=applyFix(E.saveObject(),{op:'dupPeople'});
assert.ok(after.status==='optimal'||after.status==='feasible');
assert.equal(after.achieved,6);
for(const p of r.plans)assert.equal(judge(E.saveObject(),p,{complete:false,coverage:true}).ok,true);
});

test('T-REP the second visit of a location is explained by the repeat-people rule and the fix works',()=>{
const base=easyState({main:1,clinical:2,admin:2});
const saved=v3(base,[2]);
const r=solve(saved);
assert.equal(r.status,'partial_proven');
assert.equal(r.achieved,1);
assert.equal(r.unplaced.length,1);
const rp=r.unplaced[0].reasons.find(x=>x.family==='repPeople');
assert.ok(rp,'repPeople reason');
const fx=rp.fixes.find(z=>z.op==='locRepeatPeople'&&z.id===saved.locations[0].id);
assert.ok(fx);
const after=applyFix(saved,fx);
assert.ok(after.status==='optimal'||after.status==='feasible');
assert.equal(after.achieved,2);
});

test('T-FIX every listed fix is verified: applying it completes the plan or places more visits',()=>{
const cases=[
v3(easyState({main:4,days:[1]})),
v3(easyState({main:1,clinical:2,admin:2}),[2]),
v3(easyState({main:3,clinical:3,admin:2,days:[1,2]}),[2,2,2])
];
cases[2].gmaxOn=true;
cases[2].gmax=1;
cases.push(fixture());
let checked=0;
for(const saved of cases){
const r=solve(saved);
if(r.status!=='partial'&&r.status!=='partial_proven')continue;
for(const u of r.unplaced){
assert.ok(u.reasons.length>0,'every unplaced visit has at least one reason');
for(const reason of u.reasons)for(const fx of reason.fixes){
const after=applyFix(saved,fx);
assert.ok(after.status==='optimal'||after.status==='feasible'||after.achieved>r.achieved,JSON.stringify(fx));
checked++;
}
}
}
assert.ok(checked>=6,'checked '+checked);
});

function fixtureNoOneVisit(){
const s=Engine.migrate(clone(fixture()));
s.oneVisitPerMember=false;
return s;
}

test('T-REAL-2 without one-visit-per-member the fixture gets six visits at six distinct locations on seeds 1..10',()=>{
const s=fixtureNoOneVisit();
for(let seed=1;seed<=10;seed++){
const r=Engine.solve(s,{seed,timeBudgetMs:1500,explain:false});
assert.ok(r.status==='optimal'||r.status==='feasible','seed '+seed+' '+r.status);
assert.equal(r.achieved,6);
for(const p of r.plans){
assert.equal(p.rows.length,6);
assert.equal(new Set(p.rows.map(x=>x.loc.id)).size,6);
assert.equal(judge(s,p).ok,true,'seed '+seed);
}
}
});

test('T-REAL-3 the fixture structural facts: pinned people, day, team limits, conflict and day-off rules',()=>{
const s=fixtureNoOneVisit();
for(let seed=1;seed<=5;seed++){
const r=Engine.solve(s,{seed,timeBudgetMs:1500,explain:false});
for(const p of r.plans){
assert.equal(judge(s,p).ok,true);
const at=id=>p.rows.find(x=>x.loc.id===id);
assert.equal(at(116).day,2);
assert.ok(at(116).team.includes(101));
assert.ok(at(117).team.every(id=>[106,104,111].includes(id)));
assert.equal(at(118).day,4);
assert.ok(at(118).team.includes(109));
const a=new Set([...at(119).team,...at(118).team]);
assert.equal([...at(117).team,...at(116).team].some(id=>a.has(id)),false);
const visits=id=>p.rows.filter(x=>x.team.includes(id)).length;
assert.ok(visits(107)<=2&&visits(110)<=2);
}
}
});
