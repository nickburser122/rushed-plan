import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,fixture,clone} from './helpers.mjs';

const REMOVED=new Set(['maxWeek','minWeek','dup']);
const keeps=(out,src)=>{
if(Array.isArray(src)){assert.equal(out.length,src.length);src.forEach((s,i)=>keeps(out[i],s));return;}
if(src&&typeof src==='object'){for(const k of Object.keys(src)){if(REMOVED.has(k))continue;keeps(out[k],src[k]);}return;}
assert.equal(out,src);
};
const canon=o=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:1)):v);

test('loading the fixture keeps members, locations, goals, conflicts, days, rest and history',()=>{
const f=fixture();
const out=Engine.migrate(f);
keeps(out.members,f.members);
keeps(out.locations,f.locations);
assert.deepEqual(out.goals,f.goals);
assert.deepEqual(out.conflicts,f.conflicts);
assert.deepEqual(out.days,f.days);
assert.deepEqual(out.rest,f.rest);
assert.deepEqual(out.history,f.history);
assert.equal(out.v,3);
assert.equal(out.visits,undefined);
assert.deepEqual(out.dup,{spread:f.dup.spread});
assert.equal(out.migrationNote.oldVisits,f.visits);
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
assert.ok(E.state.locations.every(l=>l.visits===1));
const r=Engine.solve(v1,{seed:1,timeBudgetMs:600});
assert.ok(r.plans.length>0);
});

const oldSave=(over={})=>({v:2,days:Array.from({length:7},(_,i)=>({on:i>=1&&i<=4,fav:'',dist:'',max:0})),members:[{id:1,name:'أ',pool:1,gender:'M',off:[]},{id:2,name:'ب',pool:2,gender:'F',off:[]}],locations:[{id:11,name:'ر1',type:'main',closed:[],only:[],ban:[]},{id:12,name:'ر2',type:'main',closed:[],only:[],ban:[]},{id:13,name:'ع1',type:'contracted',closed:[],only:[],ban:[]}],visits:5,dup:{mode:'separate',people:'any',spread:'avoid'},...over});

test('T-MIG-1 an old save with five visits and three locations becomes one visit each with a note',()=>{
const E=Engine.createFromSaved(oldSave());
assert.deepEqual(E.state.locations.map(l=>l.visits),[1,1,1]);
assert.equal(E.state.extraVisits,0);
assert.equal(E.totalRequested(),3);
assert.deepEqual(E.state.migrationNote,{oldVisits:5,newTotal:3});
});

test('T-MIG-1 no note when the old total already matches',()=>{
const E=Engine.createFromSaved(oldSave({visits:3}));
assert.equal(E.state.migrationNote,null);
});

test('T-MIG-2 minWeek, maxWeek, merged, people and banned map to the new settings',()=>{
const a=oldSave();
a.locations[0].minWeek=2;
a.locations[1].maxWeek=3;a.locations[1].minWeek=0;
a.locations[2].dup='merged';
let E=Engine.createFromSaved(a);
assert.deepEqual(E.state.locations.map(l=>l.visits),[2,1,1]);
assert.equal(E.state.locations[2].repeat.days,'same');
assert.equal(E.state.locations[0].repeat.days,'separate');
E=Engine.createFromSaved(oldSave({dup:{mode:'separate',people:'different',spread:'avoid'}}));
assert.ok(E.state.locations.every(l=>l.repeat.people==='different'));
assert.equal(E.state.oneVisitPerMember,false);
E=Engine.createFromSaved(oldSave({dup:{mode:'separate',people:'all',spread:'avoid'}}));
assert.equal(E.state.oneVisitPerMember,true);
const b=oldSave({dup:{mode:'banned',people:'any',spread:'avoid'}});
b.locations[0].minWeek=3;
E=Engine.createFromSaved(b);
assert.deepEqual(E.state.locations.map(l=>l.visits),[1,1,1]);
});

test('T-MIG-3 the save version is 3 and a v3 save round-trips identically',()=>{
const a=Engine.migrate(oldSave());
assert.equal(a.v,3);
const b=Engine.migrate(JSON.parse(JSON.stringify(a)));
assert.equal(canon(a),canon(b));
assert.equal(b.locations.every(l=>Number.isInteger(l.visits)&&l.repeat&&Number.isInteger(l.maxExtra)),true);
assert.deepEqual(b.migrationNote,a.migrationNote);
});

test('T-MIG-3 applySaved stays atomic with the new fields',()=>{
const E=Engine.createFromSaved(oldSave());
const before=canon(E.saveObject());
const bad=Engine.migrate(oldSave());
bad.extraVisits=4;
bad.oneVisitPerMember=true;
bad.locations.forEach(l=>{l.visits=6;l.maxExtra=3;});
Object.defineProperty(bad,'dayRules',{get(){throw new Error('boom');},enumerable:true});
assert.throws(()=>E.applySaved(bad,false),/boom/);
assert.equal(canon(E.saveObject()),before);
assert.equal(E.totalRequested(),3);
assert.throws(()=>E.applySaved(null));
assert.equal(canon(E.saveObject()),before);
});

test('T-MIG-3 the storage key is unchanged',()=>{
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.ok(html.includes("localStorage.setItem('visitplan.v2'"));
assert.ok(html.includes("localStorage.getItem('visitplan.v2')"));
assert.equal(html.includes('visitplan.v3'),false);
});

test('T-MIG-4 member, location and goal ids and names survive migration',()=>{
const f=fixture();
const out=Engine.migrate(f);
const pick=a=>a.map(x=>[x.id,x.name]);
assert.deepEqual(pick(out.members),pick(f.members));
assert.deepEqual(pick(out.locations),pick(f.locations));
assert.deepEqual(out.goals.map(g=>g.id),f.goals.map(g=>g.id));
});
