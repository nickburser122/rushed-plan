import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SMALL_N,MEDIUM_N} from './planted.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');
const read=p=>fs.readFileSync(p,'utf8');
const engineSrc=()=>read(path.join(root,'engine.js'));
const testFiles=()=>fs.readdirSync(here).filter(f=>f.endsWith('.test.mjs')).map(f=>path.join(here,f));
const phase=()=>Number(read(path.join(here,'PHASE')).trim());

const FIXTURE_SHA256='c432725086ca25b63e1437a355efca0de597b4f2e30532c68f972b4ce296526a';

test('guard: engine.js has no special-casing of fixture ids, names or seeds',()=>{
const src=engineSrc();
const patterns=[
/(?:\.id|\bid|locId|memberId)\s*[=!]==?\s*1(?:0[1-9]|1[0-9]|2[0-2])\b/,
/\[\s*1(?:0[1-9]|1[0-9]|2[0-2])\s*(?:,|\])/,
/\bseed\s*===?\s*(?!null|undefined)[\w'"-]/,
/شوقي/
];
for(const re of patterns)assert.equal(re.test(src),false,'forbidden pattern '+re);
});

test('guard: no skipped, todo or exclusive tests',()=>{
const bad=['.sk'+'ip(','.to'+'do(','sk'+'ip:true','sk'+'ip: true','on'+'ly:true','on'+'ly: true','.on'+'ly('];
for(const f of testFiles()){
const src=read(f).replace(/\s+/g,' ');
if(path.basename(f)==='guard.test.mjs')continue;
for(const b of bad)assert.equal(src.includes(b),false,path.basename(f)+' contains '+b);
}
});

test('guard: the number of tests never drops below MIN_TESTS',()=>{
let n=0;
for(const f of testFiles())n+=(read(f).match(/^\s*(?:test|knownFailing)\(/gm)||[]).length;
const min=Number(read(path.join(here,'MIN_TESTS')).trim());
assert.ok(Number.isInteger(min)&&min>0);
assert.ok(n>=min,'found '+n+' tests, MIN_TESTS is '+min);
});

test('guard: judge.mjs is independent of the engine checker',()=>{
const src=read(path.join(here,'judge.mjs'));
assert.equal(/evaluatePlan|checkPlan|compileModel|solveNow|solveExact/.test(src),false);
const imports=[...src.matchAll(/(?:import\s+[^;]*?from\s+|require\()\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
const fromEngine=imports.filter(i=>/engine(\.js)?$/.test(i));
assert.ok(fromEngine.length<=1);
const destructured=src.match(/const\s*\{([^}]*)\}\s*=\s*require\(\s*['"][^'"]*engine\.js['"]\s*\)/);
assert.ok(destructured,'judge must destructure its engine imports');
const names=destructured[1].split(',').map(s=>s.trim()).filter(Boolean).sort();
assert.deepEqual(names,['DAYS','createFromSaved']);
assert.equal(/engine\.js/.test(src.replace(/require\(\s*['"][^'"]*engine\.js['"]\s*\)/,'')),false);
});

test('guard: property and planted sizes are not reduced',()=>{
const prop=read(path.join(here,'property.test.mjs'));
const m=prop.match(/PROP_N[^;\n]*?(\d+)/);
assert.ok(m&&Number(m[1])>=500,'PROP_N default must stay at 500 or more');
assert.ok(SMALL_N>=300);
assert.ok(MEDIUM_N>=150);
});

test('guard: fixture file is unchanged',()=>{
const h=crypto.createHash('sha256').update(fs.readFileSync(path.join(here,'fixtures','user-backup-2026-10-24.json'))).digest('hex');
assert.equal(h,FIXTURE_SHA256);
});

test('guard: KNOWN_FAILING repros are only allowed in the phases that expect them',()=>{
const file=path.join(here,'repro.test.mjs');
const src=fs.existsSync(file)?read(file):'';
const names=[...src.matchAll(/knownFailing\(\s*'([^']+)'/g)].map(m=>m[1]);
const p=phase();
if(p>=3)assert.equal(names.length,0,'all repros must be promoted to real tests by phase 3');
else if(p===2)assert.equal(names.some(n=>n.startsWith('B4 ')),false,'B4 repro must be promoted in phase 2');
});

test('guard: removed UI controls stay removed once the UI phase is done',()=>{
if(phase()<5)return;
const html=read(path.join(root,'index.html'));
for(const s of['data-act="lmax"','data-act="ldup"','data-act="lminw"','id="ratioseg"','changeVisits('])assert.equal(html.includes(s),false,'index.html still contains '+s);
});
