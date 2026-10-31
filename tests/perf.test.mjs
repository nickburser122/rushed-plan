import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,fixture} from './helpers.mjs';
import {genInstance} from './gen.mjs';

test('perf: fixture first plan under 300 ms, capacity under 500 ms',()=>{
const t0=performance.now();
const r=Engine.solve(fixture(),{seed:1,visitsWanted:5});
assert.ok(r.firstPlanMs!=null&&r.firstPlanMs<300,'first plan '+r.firstPlanMs);
const E=Engine.createFromSaved(fixture(),{seed:1});
const t1=performance.now();
E.capacityInfo({noCache:true});
assert.ok(performance.now()-t1<500,'capacity '+(performance.now()-t1));
});

test('perf: S2-sized instance capacity under 1.5 s',()=>{
const s=genInstance(77,{members:20,locations:10,days:5,offP:0.3,conflictP:0});
const E=Engine.createFromSaved(s,{seed:1});
const t=performance.now();
E.capacityInfo({noCache:true,timeBudgetMs:1400});
assert.ok(performance.now()-t<1500);
});

test('perf: S3-sized instance finishes inside the 8 s extended budget',()=>{
const s=genInstance(31,{members:30,locations:20,days:5,conflictP:1,genderP:1});
const t=performance.now();
Engine.solve(s,{seed:1,visitsWanted:8,timeBudgetMs:8000});
assert.ok(performance.now()-t<9000);
});

test('perf: wide seats (up to 8 per pool) stay inside the capacity and solve budgets',()=>{
const s=genInstance(5,{members:24,locations:5,days:5,offP:0.2,conflictP:0,custom:false});
s.locations.forEach((l,i)=>{l.seats={1:6+(i%3),2:5+(i%4)};l.genderRule=false;l.only=[];l.ban=[];l.closed=[];});
s.cap={mainPerDay:3,conPerDay:2,dayMax:0,even:true};
s.dup={mode:'separate',people:'any',spread:'avoid'};
s.gmaxOn=false;
const E=Engine.createFromSaved(s,{seed:1});
const t=performance.now();
const c=E.capacityInfo({noCache:true,timeBudgetMs:1400});
assert.ok(performance.now()-t<4000,'capacity '+(performance.now()-t));
const t1=performance.now();
const r=Engine.solve(s,{seed:1,visitsWanted:Math.max(1,c.capacity),timeBudgetMs:3000});
assert.ok(performance.now()-t1<7000,'solve '+(performance.now()-t1));
assert.ok(['optimal','feasible','search_exhausted'].includes(r.status));
});
