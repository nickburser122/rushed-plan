import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,fixture,clone} from './helpers.mjs';

const canon=o=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:1)):v);

test('loading the fixture keeps members, locations, goals, conflicts, days, rest and history',()=>{
const f=fixture();
const out=Engine.migrate(f);
assert.deepEqual(out.members,f.members);
assert.deepEqual(out.locations,f.locations);
assert.deepEqual(out.goals,f.goals);
assert.deepEqual(out.conflicts,f.conflicts);
assert.deepEqual(out.days,f.days);
assert.deepEqual(out.rest,f.rest);
assert.deepEqual(out.history,f.history);
assert.equal(out.visits,f.visits);
assert.deepEqual(out.dup,f.dup);
assert.deepEqual(out.cap,f.cap);
});

test('export, import, export is byte-identical after sorting keys',()=>{
const a=Engine.migrate(fixture());
const b=Engine.migrate(JSON.parse(JSON.stringify(a)));
assert.equal(canon(a),canon(b));
});

test('a v1 sample still migrates',()=>{
const f=fixture();
const v1=clone(f);
v1.v=1;
delete v1.dup;
v1.locRepeat='banned';
const E=Engine.createFromSaved(v1);
assert.equal(E.state.members.length,11);
assert.equal(E.state.locations.length,6);
assert.ok(['banned','separate','merged'].includes(E.state.dup.mode));
const r=Engine.solve(v1,{seed:1,visitsWanted:3,timeBudgetMs:300});
assert.ok(r.plans.length>0);
});
