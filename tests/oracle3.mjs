import {judger} from './judge.mjs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);

function combos(arr,k){
const out=[];
(function rec(s,cur){
if(cur.length===k){out.push(cur.slice());return;}
for(let i=s;i<=arr.length-(k-cur.length);i++){cur.push(arr[i]);rec(i+1,cur);cur.pop();}
})(0,[]);
return out;
}

export function oracleMax(saved,{maxNodes=Infinity}={}){
let nodes=0;
const check=judger(saved);
const days=[0,1,2,3,4,5,6].filter(d=>saved.days[d].on);
const clin=saved.members.filter(m=>m.pool===1).map(m=>m.id);
const adm=saved.members.filter(m=>m.pool===2).map(m=>m.id);
const BASE={main:{1:2,2:2},contracted:{1:2,2:1}};
const locs=saved.locations.filter(l=>(l.visits==null?1:l.visits)>0);
const options=locs.map(l=>{
const b=BASE[l.type];
const s1=l.seats&&l.seats[1]!=null?l.seats[1]:b[1],s2=l.seats&&l.seats[2]!=null?l.seats[2]:b[2];
const opts=[];
for(const d of days)for(const a of combos(clin,s1))for(const c of combos(adm,s2)){
const row={day:d,locId:l.id,team:a.concat(c)};
if(check({rows:[row]},{complete:false,ignore:['fairSpread','dayRuleSame']}).ok)opts.push(row);
}
return opts;
});
let best=0;
const cur=[];
function rec(i){
if(++nodes>maxNodes)throw new Error('oracle limit');
const left=locs.length-i;
if(cur.length+left<=best)return;
if(i===locs.length){
if(cur.length>best&&check({rows:cur},{complete:false}).ok)best=cur.length;
return;
}
for(const row of options[i]){
cur.push(row);
if(check({rows:cur},{complete:false,ignore:['fairSpread','dayRuleSame']}).ok)rec(i+1);
cur.pop();
}
rec(i+1);
}
rec(0);
return best;
}
