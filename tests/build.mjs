import {Engine} from './helpers.mjs';

export function easyState({main=4,contracted=0,clinical=6,admin=6,days=[1,2,3,4,5]}={}){
const dayCfg=Array.from({length:7},(_,i)=>({on:days.includes(i),fav:'',dist:'',max:0}));
let id=100;
const members=[];
for(let i=0;i<clinical+admin;i++)members.push({id:++id,name:'م'+i,pool:i<clinical?1:2,gender:i%2?'F':'M',off:[],pref:'',types:'any',prefDays:[]});
const locations=[];
for(let i=0;i<main;i++)locations.push({id:++id,name:'ر'+i,type:'main',dist:'',maxWeek:0,closed:[],seats:null,dup:null,only:[],ban:[]});
for(let i=0;i<contracted;i++)locations.push({id:++id,name:'ع'+i,type:'contracted',dist:'',maxWeek:0,closed:[],seats:null,dup:null,only:[],ban:[]});
return{v:2,days:dayCfg,members,locations,pairs:{enabled:false,mode:'soft',rules:[]},goals:[],conflicts:[],weekStart:'2026-10-24'};
}

export function rowsOf(result){
const p=result&&result.plans&&result.plans[0];
return p?p.rows.map(r=>({day:r.day,locId:r.loc.id,team:r.team.slice()})):[];
}

export function solveRows(saved,seed,ms=800){
return rowsOf(Engine.solve(saved,{seed,timeBudgetMs:ms}));
}
