import {Engine} from './helpers.mjs';

export function rngOf(seed){return Engine.mulberry32(seed>>>0);}

export function genInstance(seed,opt={}){
const r=rngOf(seed*7919+13);
const ri=(a,b)=>a+Math.floor(r()*(b-a+1));
const chance=p=>r()<p;
const pick=a=>a[Math.floor(r()*a.length)];
const nm=opt.members||ri(opt.minMembers||3,opt.maxMembers||6);
const nl=opt.locations||ri(opt.minLocs||2,opt.maxLocs||4);
const nd=opt.days||ri(opt.minDays||2,opt.maxDays||4);
const first=1;
const days=Array.from({length:7},(_,i)=>({on:i>=first&&i<first+nd,fav:'',dist:'',max:0}));
const wd=days.map((d,i)=>d.on?i:-1).filter(i=>i>=0);
let id=100;
const members=[];
for(let i=0;i<nm;i++){
const m={id:++id,name:'م'+i,pool:i%2===0?1:2,gender:chance(0.5)?'M':'F',off:[],pref:'',types:'any',prefDays:[]};
if(chance(opt.offP==null?0.3:opt.offP))m.off=[pick(wd)];
members.push(m);
}
if(!members.some(m=>m.pool===1)&&members.length)members[0].pool=1;
if(!members.some(m=>m.pool===2)&&members.length>1)members[1].pool=2;
const locations=[];
for(let i=0;i<nl;i++){
const l={id:++id,name:'ل'+i,type:'main',dist:'',genderRule:chance(opt.genderP==null?0.5:opt.genderP),maxWeek:0,closed:[],seats:null,dup:null,only:[],ban:[]};
const s1=ri(0,2),s2=ri(0,2);
if(s1+s2===0)l.seats={1:1,2:0};else l.seats={1:s1,2:s2};
if(chance(0.4))l.closed=[pick(wd)];
if(chance(0.25)){
const k=ri(1,Math.min(3,members.length));
l.only=members.slice().sort(()=>r()-0.5).slice(0,k).map(m=>m.id);
}else if(chance(0.2)){
l.ban=[pick(members).id];
}
if(chance(0.15))l.maxWeek=ri(1,2);
locations.push(l);
}
const restPick=pick([{rest:1,maxRun:1},{rest:1,maxRun:1},{rest:1,maxRun:2},{rest:0,maxRun:1}]);
const dupMode=pick(['banned','separate']);
const dupPeople=pick(['any','any','all','different']);
const saved={
v:2,rest:restPick,restCalendar:chance(0.7),days,members,locations,
visits:3,ratioIdx:1,useAllDays:false,bulk:{main:3,cont:1},
pairs:{enabled:false,mode:'soft',rules:[]},goals:[],
cap:{mainPerDay:ri(1,2),conPerDay:1,dayMax:chance(0.5)?ri(1,2):0,even:true},
dup:{mode:dupMode,people:dupPeople,spread:'avoid'},
conflicts:[],autoRegen:true,minChanges:true,weekStart:'2026-10-24',view:'day',priority:'balance',carryWeek:false,history:{},
gmaxOn:chance(0.25),gmax:ri(1,2)
};
if(locations.length>=2&&chance(opt.conflictP==null?0.25:opt.conflictP)){
saved.conflicts=[{id:++id,on:true,a:[locations[0].id],b:[locations[1].id],scope:'all',pool:1,ids:[],hard:true}];
}
if(members.length>=4&&chance(0.2)){
saved.pairs={enabled:true,mode:'hard',rules:[{id:++id,kind:'avoid',a:members[0].id,b:members[1].id}]};
}
return saved;
}

export function blank(o={}){
const nd=o.days==null?5:o.days;
const days=Array.from({length:7},(_,i)=>({on:i>=1&&i<1+nd,fav:'',dist:'',max:0}));
return{
v:2,rest:o.rest||{rest:1,maxRun:1},restCalendar:o.restCalendar!==false,days,members:[],locations:[],
visits:o.visits||3,ratioIdx:1,useAllDays:false,bulk:{main:3,cont:1},
pairs:{enabled:false,mode:'soft',rules:[]},goals:[],
cap:{mainPerDay:o.mainPerDay||2,conPerDay:o.conPerDay||1,dayMax:o.dayMax||0,even:true},
dup:{mode:o.dupMode||'banned',people:o.dupPeople||'any',spread:'avoid'},
conflicts:[],autoRegen:true,minChanges:true,weekStart:'2026-10-24',view:'day',priority:'balance',carryWeek:false,history:{},gmaxOn:false,gmax:2
};
}
export function member(id,pool,gender,extra={}){return{id,name:'م'+id,pool,gender,off:[],pref:'',types:'any',prefDays:[],...extra};}
export function loc(id,seats,extra={}){return{id,name:'ل'+id,type:'main',dist:'',genderRule:false,maxWeek:0,closed:[],seats,dup:null,only:[],ban:[],...extra};}
