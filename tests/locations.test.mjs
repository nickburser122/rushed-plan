import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,clone} from './helpers.mjs';
import {easyState} from './build.mjs';

const v3=(saved,visits,extra=0)=>{
const s=clone(saved);
s.v=3;
s.extraVisits=extra;
s.locations.forEach((l,i)=>{l.visits=visits[i];l.repeat={people:'different',days:'separate'};l.maxExtra=0;});
return s;
};

test('T-LOC-4 totalRequested equals the sum of location visits plus extras for 200 random states',()=>{
const r=Engine.mulberry32(4242);
for(let n=0;n<200;n++){
const nl=1+Math.floor(r()*6);
const base=easyState({main:nl});
const visits=base.locations.map(()=>Math.floor(r()*8));
const extra=Math.floor(r()*11);
const E=Engine.createFromSaved(v3(base,visits,extra));
const expect=visits.reduce((a,b)=>a+b,0)+extra;
assert.equal(E.totalRequested(),expect,'case '+n);
visits.forEach((v,i)=>{if(v===0)assert.equal(E.state.locations[i].visits,0);});
}
});

test('T-LOC-4 the total follows location changes immediately',()=>{
const E=Engine.createFromSaved(v3(easyState({main:3}),[1,1,1]));
assert.equal(E.totalRequested(),3);
E.state.locations[0].visits=3;
assert.equal(E.totalRequested(),5);
E.state.locations.pop();
assert.equal(E.totalRequested(),4);
E.state.extraVisits=2;
assert.equal(E.totalRequested(),6);
});

test('T-LOC-5 per-type setter changes only that type and updates the total',()=>{
const E=Engine.createFromSaved(v3(easyState({main:3,contracted:2}),[1,1,1,1,1]));
assert.equal(E.setTypeVisits('main',2),8);
assert.deepEqual(E.state.locations.map(l=>l.visits),[2,2,2,1,1]);
assert.equal(E.totalRequested(),8);
assert.equal(E.setTypeVisits('contracted',0),6);
assert.deepEqual(E.state.locations.map(l=>l.visits),[2,2,2,0,0]);
assert.equal(E.setTypeVisits('main',99),21);
});

test('T-LOC-6 goals raise a location visits to the number of active goals',()=>{
const E=Engine.createFromSaved(v3(easyState({main:2}),[1,1]));
const id=E.state.locations[0].id;
const goal=n=>({id:9000+n,on:true,mode:'pool',size:2,allowed:[],loc:id,days:[],people:[],exclude:[]});
E.state.goals.push(goal(1),goal(2));
const raised=E.normalizeVisits();
assert.deepEqual(raised,[{key:'visitsRaisedForGoals',locId:id,n:2}]);
assert.equal(E.state.locations[0].visits,2);
assert.equal(E.state.locations[1].visits,1);
assert.equal(E.totalRequested(),3);
assert.deepEqual(E.normalizeVisits(),[]);
});

test('T-LOC-6 inactive goals do not raise visits and loading applies the rule',()=>{
const saved=v3(easyState({main:1}),[1]);
const id=saved.locations[0].id;
saved.goals=[
{id:1,on:true,mode:'pool',size:2,allowed:[],loc:id,days:[],people:[],exclude:[]},
{id:2,on:false,mode:'pool',size:2,allowed:[],loc:id,days:[],people:[],exclude:[]},
{id:3,on:true,mode:'pool',size:2,allowed:[],loc:id,days:[],people:[],exclude:[]}
];
const E=Engine.createFromSaved(saved);
assert.equal(E.state.locations[0].visits,2);
});
