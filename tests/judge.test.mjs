import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,clone} from './helpers.mjs';
import {judge} from './judge.mjs';
import {planted,SMALL_N,MEDIUM_N} from './planted.mjs';

const engineHard=(saved,rows)=>{
const E=Engine.createFromSaved(clone(saved),{seed:1});
return E.checkPlan(rows.map(r=>({day:r.day,locId:r.locId,team:r.team.slice()}))).hardCount;
};

test('T-JUDGE-0 planted plans are valid for the judge: small',()=>{
for(let s=1;s<=SMALL_N;s++){
const {saved,plantedPlan}=planted(s,'small');
const j=judge(saved,plantedPlan);
assert.equal(j.ok,true,'seed '+s+' '+JSON.stringify(j.violations.slice(0,2)));
}
});

test('T-JUDGE-0 planted plans are valid for the judge: medium',()=>{
for(let s=1;s<=MEDIUM_N;s++){
const {saved,plantedPlan}=planted(s,'medium');
const j=judge(saved,plantedPlan);
assert.equal(j.ok,true,'seed '+s+' '+JSON.stringify(j.violations.slice(0,2)));
}
});

test('T-JUDGE-0 planted plans are valid for the current engine checker too',()=>{
for(let s=1;s<=60;s++){
const {saved,plantedPlan}=planted(s,'small');
assert.equal(engineHard(saved,plantedPlan.rows),0,'seed '+s);
}
});

const other=pool=>pool===1?2:1;

const MUTATIONS={
dropMember:(saved,rows)=>{
const i=rows.findIndex(r=>r.team.length>1);
if(i<0)return null;
rows[i].team.pop();
return{saved,rows};
},
wrongPool:(saved,rows)=>{
for(let i=0;i<rows.length;i++){
const byId=new Map(saved.members.map(m=>[m.id,m]));
const victim=rows[i].team[0];
const target=saved.members.find(m=>m.pool===other(byId.get(victim).pool)&&!rows[i].team.includes(m.id));
if(!target)continue;
rows[i].team[0]=target.id;
return{saved,rows};
}
return null;
},
memberDayOff:(saved,rows)=>{
const r=rows[0];
const m=saved.members.find(x=>x.id===r.team[0]);
m.off=[...new Set([...m.off,r.day])];
return{saved,rows};
},
breakRest:(saved,rows)=>{
const byId=new Map(saved.members.map(m=>[m.id,m]));
for(let i=0;i<rows.length;i++)for(let j=0;j<rows.length;j++){
if(i===j||Math.abs(rows[i].day-rows[j].day)!==1)continue;
const mid=rows[i].team[0];
if(rows[j].team.includes(mid))continue;
const k=rows[j].team.findIndex(id=>byId.get(id).pool===byId.get(mid).pool);
if(k<0)continue;
rows[j].team[k]=mid;
return{saved,rows};
}
return null;
},
hardAvoidTogether:(saved,rows)=>{
const r=rows.find(x=>x.team.length>=2);
if(!r)return null;
saved.pairs={enabled:true,mode:'hard',rules:[...(saved.pairs.rules||[]),{id:9001,kind:'avoid',a:r.team[0],b:r.team[1]}]};
return{saved,rows};
},
exceedDayCap:(saved,rows)=>{
const perDay=new Map();
for(const r of rows){
if(!perDay.has(r.day))perDay.set(r.day,new Set());
perDay.get(r.day).add(r.locId);
}
const busiest=[...perDay.values()].reduce((a,b)=>Math.max(a,b.size),0);
if(busiest<2)return null;
saved.cap={...saved.cap,dayMax:busiest-1,mainPerDay:Math.max(saved.cap.mainPerDay,busiest),conPerDay:Math.max(saved.cap.conPerDay,busiest)};
return{saved,rows};
},
genderViolation:(saved,rows)=>{
const r=rows.find(x=>x.team.length>=2);
if(!r)return null;
for(const id of r.team)saved.members.find(m=>m.id===id).gender='M';
const l=saved.locations.find(x=>x.id===r.locId);
l.genderRule=true;l.genderMode='mixed';
return{saved,rows};
},
closedDay:(saved,rows)=>{
const r=rows[0];
const l=saved.locations.find(x=>x.id===r.locId);
l.closed=[...new Set([...l.closed,r.day])];
return{saved,rows};
}
};

const JUDGE_ONLY={
visitsExceeded:(saved,rows)=>{
const l=saved.locations.find(x=>x.visits===1&&rows.some(r=>r.locId===x.id));
if(!l)return null;
const src=rows.find(r=>r.locId===l.id);
const day=[1,2,3,4,5].find(d=>d!==src.day&&saved.days[d].on);
rows.push({day,locId:l.id,team:src.team.slice()});
return{saved,rows};
},
repeatPeopleReused:(saved,rows)=>{
const l=saved.locations.find(x=>x.visits===2);
if(!l)return null;
const mine=rows.filter(r=>r.locId===l.id);
mine[1].team=mine[0].team.slice();
return{saved,rows};
}
};

const sample=n=>{
const out=[];
for(let s=1;out.length<n&&s<400;s++){
const p=planted(s,'small');
if(p.saved.locations.length>=2&&p.plantedPlan.rows.length>=3)out.push(p);
}
return out;
};

test('T-JUDGE-1 every mutation is rejected by the judge and by the engine checker',()=>{
const base=sample(30);
for(const [name,fn] of Object.entries(MUTATIONS)){
let applied=0;
for(const {saved,plantedPlan} of base){
const m=fn(clone(saved),clone(plantedPlan.rows));
if(!m)continue;
applied++;
const j=judge(m.saved,{rows:m.rows});
assert.equal(j.ok,false,name+' accepted by judge');
assert.ok(engineHard(m.saved,m.rows)>0,name+' accepted by engine checker');
}
assert.ok(applied>=10,name+' applied only '+applied+' times');
}
});

test('T-JUDGE-1 model mutations are rejected by the judge and the engine checker',()=>{
const pool=[];
for(let s=1;pool.length<30&&s<600;s++){
const p=planted(s,'small');
if(p.saved.locations.some(l=>l.visits===2))pool.push(p);
}
for(const [name,fn] of Object.entries(JUDGE_ONLY)){
let applied=0;
for(const {saved,plantedPlan} of pool){
const m=fn(clone(saved),clone(plantedPlan.rows));
if(!m)continue;
applied++;
assert.equal(judge(m.saved,{rows:m.rows}).ok,false,name+' accepted by judge');
assert.ok(engineHard(m.saved,m.rows)>0,name+' accepted by engine checker');
}
assert.ok(applied>=5,name+' applied only '+applied+' times');
}
});

const RANDOM_OPS=[
(saved,rows,r)=>{
if(rows.length<2)return;
const a=Math.floor(r()*rows.length),b=Math.floor(r()*rows.length);
if(a===b)return;
const ia=Math.floor(r()*rows[a].team.length),ib=Math.floor(r()*rows[b].team.length);
const t=rows[a].team[ia];rows[a].team[ia]=rows[b].team[ib];rows[b].team[ib]=t;
},
(saved,rows,r)=>{
const i=Math.floor(r()*rows.length);
const days=[1,2,3,4,5].filter(d=>saved.days[d].on);
rows[i].day=days[Math.floor(r()*days.length)];
},
(saved,rows,r)=>{
const i=Math.floor(r()*rows.length);
const cand=saved.members.filter(m=>!rows[i].team.includes(m.id));
if(cand.length)rows[i].team.push(cand[Math.floor(r()*cand.length)].id);
},
(saved,rows,r)=>{
const i=Math.floor(r()*rows.length);
if(rows[i].team.length>1)rows[i].team.splice(Math.floor(r()*rows[i].team.length),1);
},
(saved,rows,r)=>{
const i=Math.floor(r()*rows.length);
const k=Math.floor(r()*rows[i].team.length);
const cand=saved.members.filter(m=>!rows[i].team.includes(m.id));
if(cand.length)rows[i].team[k]=cand[Math.floor(r()*cand.length)].id;
}
];

test('T-JUDGE-2 judge and engine checker agree on 500 valid and mutated plans',()=>{
const r=Engine.mulberry32(777);
let rejected=0,accepted=0;
for(let n=0;n<500;n++){
const size=n%5===0?'medium':'small';
const {saved,plantedPlan}=planted(1+(n%90),size);
const s=clone(saved),rows=clone(plantedPlan.rows);
const ops=n%4===0?0:1+Math.floor(r()*3);
for(let k=0;k<ops;k++)RANDOM_OPS[Math.floor(r()*RANDOM_OPS.length)](s,rows,r);
const j=judge(s,{rows});
const e=engineHard(s,rows)===0;
assert.equal(j.ok,e,'case '+n+' judge='+j.ok+' engine='+e+' '+JSON.stringify(j.violations.slice(0,2)));
if(j.ok)accepted++;else rejected++;
}
assert.ok(accepted>=100&&rejected>=100,'mix '+accepted+'/'+rejected);
});
