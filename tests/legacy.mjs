import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const src=fs.readFileSync(path.join(here,'fixtures','legacy-engine.js'),'utf8');

export function loadLegacy(saved){
const store={'visitplan.v2':JSON.stringify(saved)};
const ctx={
location:{search:''},
localStorage:{getItem:k=>store[k]??null,setItem(k,v){store[k]=v;},removeItem(k){delete store[k];}},
performance,console,Math,Date,JSON,Set,Map,Array,Object,Number,String,URLSearchParams,
document:{querySelector:()=>null,createElement:()=>({})},
window:{},setTimeout,clearTimeout
};
vm.createContext(ctx);
const tail=`
;globalThis.__L={state,loadState,compileModel,buildSlots,solveTeams,makePlan,hashSol,practicalCap,visitCap,reseed,evaluatePlan,withRelax,capLimiters,resetCaches,workingDays};
`;
vm.runInContext(src+tail,ctx,{filename:'legacy-engine.js'});
const L=ctx.__L;
L.loadState();
L.state.vcap=L.visitCap();
return L;
}

export function legacyRun(saved,{seed,attempts,visits}){
const L=loadLegacy(saved);
if(visits!=null){L.state.visitsWanted=visits;L.state.visits=visits;}
L.reseed(seed);
const M=L.compileModel();
const out=[];
for(let i=1;i<=attempts;i++){
const slots=L.buildSlots(M,null,i);
if(!slots)continue;
const sol=L.solveTeams(M,slots,{soft:new Set()});
if(!sol)continue;
const pl=L.makePlan(M,sol,null);
out.push({hash:L.hashSol(sol),hard:pl.eval.hardCount});
}
return{vcap:L.state.vcap,visits:L.state.visits,plans:out};
}
