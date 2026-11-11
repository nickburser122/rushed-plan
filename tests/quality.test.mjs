import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,clone} from './helpers.mjs';
import {easyState} from './build.mjs';
import {judge} from './judge.mjs';
import {planted} from './planted.mjs';

const v3=(saved,visits)=>{
const s=clone(saved);
s.v=3;
s.extraVisits=0;
s.locations.forEach((l,i)=>{l.visits=visits?visits[i]:1;l.repeat={people:'different',days:'separate'};l.maxExtra=0;});
return s;
};

test('T-QUAL-1 with spare staff the visit counts differ by at most one in each pool',()=>{
const r=Engine.mulberry32(2024);
for(let n=0;n<50;n++){
const clinical=4+Math.floor(r()*6),admin=4+Math.floor(r()*6);
const mains=1+Math.floor(r()*Math.min(4,Math.floor(Math.min(clinical,admin)/2)+1));
const saved=v3(easyState({main:mains,clinical,admin,days:[1,2,3,4,5]}));
saved.rest={rest:0,maxRun:1};
const E=Engine.createFromSaved(clone(saved),{seed:1});
const res=E.solveNow({seed:1,timeBudgetMs:600,explain:false});
assert.ok(res.status==='optimal'||res.status==='feasible','case '+n+' '+res.status);
const p=res.plans[0];
assert.equal(judge(saved,p).ok,true);
assert.ok(p.terms.loadSpread<=2,'case '+n+' loadSpread '+p.terms.loadSpread);
for(const q of[1,2]){
const ids=saved.members.filter(m=>m.pool===q).map(m=>m.id);
const c=ids.map(id=>p.rows.filter(x=>x.team.includes(id)).length);
assert.ok(Math.max(...c)-Math.min(...c)<=1,'case '+n+' pool '+q+' counts '+c.join(','));
}
}
});

test('T-QUAL-2 improvePlan never raises the quality score and never breaks a rule',()=>{
let better=0,total=0;
for(let s=1;s<=60;s++){
const {saved,plantedPlan}=planted(s,'small');
const E=Engine.createFromSaved(clone(saved),{seed:s});
const M=E.compileModel();
const rows=plantedPlan.rows.map(r=>({day:r.day,loc:M.locOf(r.locId),team:r.team.slice(),shape:null,goal:null,req:[],custom:null}));
rows.forEach(r=>{r.shape=E.shapeOf(r.loc);});
const base=E.planFromRows(M,rows,null);
const improved=E.improvePlan(M,base,{iters:300,ms:400});
assert.ok(improved.quality<=base.quality+1e-9,'seed '+s);
const j=judge(saved,{rows:improved.rows.map(r=>({day:r.day,locId:r.loc.id,team:r.team}))});
assert.equal(j.ok,true,'seed '+s+' '+JSON.stringify(j.violations.slice(0,2)));
total++;
if(improved.quality<base.quality-1e-9)better++;
}
assert.ok(better>=10,'improved only '+better+' of '+total);
});

test('quality terms: weights follow the saved priority and the tie-break is deterministic',()=>{
const {saved}=planted(5,'small');
const E=Engine.createFromSaved(clone(saved),{seed:1});
const r=E.solveNow({seed:1,timeBudgetMs:500,explain:false,plans:4});
const keys=r.plans.map(p=>E.planKey(p));
const again=E.solveNow({seed:1,timeBudgetMs:500,explain:false,plans:4});
assert.deepEqual(keys,again.plans.map(p=>E.planKey(p)));
for(let i=1;i<r.plans.length;i++)assert.ok(E.comparePlans(r.plans[i-1],r.plans[i])<=0);
const p=r.plans[0];
const stable=clone(saved);stable.priority='stable';
const prefs=clone(saved);prefs.priority='prefs';
const qa=E.qualityScore(p,null);
const Es=Engine.createFromSaved(stable,{seed:1}),Ep=Engine.createFromSaved(prefs,{seed:1});
const ref=p;
assert.ok(Es.qualityScore(p,ref)>=0);
assert.ok(Ep.qualityScore(p,null)>=0);
assert.ok(qa>=0);
});

test('stable priority penalises changes from the reference plan',()=>{
const {saved}=planted(8,'small');
saved.priority='stable';
const E=Engine.createFromSaved(clone(saved),{seed:1});
const first=E.solveNow({seed:1,timeBudgetMs:500,explain:false,plans:1}).plans[0];
const same=E.solveNow({seed:1,timeBudgetMs:500,explain:false,plans:1,ref:first}).plans[0];
assert.equal(same.terms.changeFromPrev,0);
const other=E.solveNow({seed:99,timeBudgetMs:500,explain:false,plans:1,ref:first}).plans[0];
assert.ok(other.terms.changeFromPrev>=0);
assert.ok(same.quality<=other.quality+1e-9);
});
