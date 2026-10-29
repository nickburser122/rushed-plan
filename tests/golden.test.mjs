import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,fixture,clone} from './helpers.mjs';
import {legacyRun} from './legacy.mjs';

function newRun(saved,{seed,attempts,visits}){
const s=clone(saved);
if(visits!=null)s.visits=visits;
const E=Engine.createFromSaved(s,{seed});
E.reseed(seed);
const M=E.compileModel();
const out=[];
for(let i=1;i<=attempts;i++){
const slots=E.buildSlots(M,null,i);
if(!slots)continue;
const sol=E.solveTeams(M,slots,{soft:new Set()});
if(!sol)continue;
const pl=E.makePlan(M,sol,null);
out.push({hash:E.hashSol(sol),hard:pl.eval.hardCount});
}
return{visits:E.state.visits,plans:out};
}

const variants={
fixture:f=>f,
dupAny:f=>{const s=clone(f);s.dup.people='any';return s;},
noConflict:f=>{const s=clone(f);s.conflicts=[];s.dup.mode='separate';return s;}
};

for(const [name,mk] of Object.entries(variants)){
for(const seed of [1,7,42]){
test(`golden: legacy and extracted engine agree (${name}, seed ${seed})`,()=>{
const saved=mk(fixture());
const a=legacyRun(saved,{seed,attempts:150});
const b=newRun(saved,{seed,attempts:150});
assert.equal(b.visits,a.visits);
assert.deepEqual(b.plans,a.plans);
});
}
}
