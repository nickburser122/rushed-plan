import {Engine} from './helpers.mjs';

const MONOTONE=['rest','pairHard','locCap','offDay','doubleBook','gender','conflict','dup','dayCap','tags','pairMust','dayNot','gap'];

function* combos(arr,k){
const cur=[];
function* rec(s){
if(cur.length===k){yield cur.slice();return;}
for(let i=s;i<=arr.length-(k-cur.length);i++){cur.push(arr[i]);yield* rec(i+1);cur.pop();}
}
yield* rec(0);
}

export function oracleFeasible(saved,V,{maxNodes=4e6}={}){
const E=Engine.createFromSaved(saved,{seed:1});
const st=E.state;
E.state.visits=V;
const M=E.compileModel();
const days=M.days;
const slots=[];
const cgoals=M.goals.filter(g=>g.custom);
for(const g of M.goals.filter(x=>!x.custom))for(const d of g.days){
if(E.closedOn(g.loc,d))continue;
slots.push({l:g.loc,d,sh:E.shapeOf(g.loc),pg:g});
}
for(const g of cgoals){
for(const d of days){
if(E.closedOn(g.loc,d))continue;
slots.push({l:g.loc,d,sh:{1:0,2:0},custom:g});
}
}
for(const l of st.locations){
const sh=E.shapeOf(l);
if(sh[1]+sh[2]<1)continue;
for(const d of days){
if(E.closedOn(l,d))continue;
slots.push({l,d,sh});
}
}
const c1=st.members.filter(m=>m.pool===1),c2=st.members.filter(m=>m.pool===2);
let nodes=0;
const rowOf=(s,team)=>({day:s.d,loc:s.l,team:team.map(m=>m.id),shape:{1:s.sh[1],2:s.sh[2]},custom:s.custom?{size:s.custom.custom.size}:null,goal:s.custom?s.custom.id:(s.pg?s.pg.id:null),req:[]});
function partialOK(rows,full){
const gs=rows.filter(r=>r.goal!=null).map(r=>r.goal);
if(new Set(gs).size!==gs.length)return false;
const ev=E.checkPlan(rows,M);
for(const k of MONOTONE)if(ev.hard[k]>0)return false;
if(full)return ev.hardCount===0;
return true;
}
const rows=[];
function chooseSlots(start,left){
if(nodes++>maxNodes)throw new Error('oracle budget');
if(left===0)return partialOK(rows,true);
for(let i=start;i<=slots.length-left;i++){
const s=slots[i];
if(s.custom){
const allowed=s.custom.custom.allowed,pool=st.members.filter(m=>allowed.includes(m.id));
for(const t of combos(pool,s.custom.custom.size)){
rows.push(rowOf(s,t));
if(partialOK(rows,false)&&chooseSlots(i+1,left-1))return true;
rows.pop();
}
continue;
}
for(const a of combos(c1,s.sh[1]))for(const b of combos(c2,s.sh[2])){
rows.push(rowOf(s,a.concat(b)));
if(partialOK(rows,false)&&chooseSlots(i+1,left-1))return true;
rows.pop();
}
}
return false;
}
if(V===0)return true;
return chooseSlots(0,V);
}

export function oracleCapacity(saved,{maxV=12,maxNodes}={}){
let best=0;
const E=Engine.createFromSaved(saved,{seed:1});
const M=E.compileModel(),g=M.goals.length;
const top=Math.min(maxV,E.flowBound(M).ub);
for(let V=Math.max(1,g);V<=top;V++){
if(oracleFeasible(saved,V,{maxNodes}))best=V;
}
return best;
}
