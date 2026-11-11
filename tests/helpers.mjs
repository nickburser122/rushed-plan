import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
export const Engine=require(path.join(here,'..','engine.js'));

export const fixture=()=>JSON.parse(fs.readFileSync(path.join(here,'fixtures','user-backup-2026-10-24.json'),'utf8'));
export const clone=o=>JSON.parse(JSON.stringify(o));

export function withVisits(saved,n){const s=clone(saved);s.visits=n;return s;}

export function solveLegacy(saved,o){
o=o||{};
const s=Engine.migrate(clone(saved));
const E0=Engine.createFromSaved(s);
const locs=E0.state.locations;
const n=o.visitsWanted;
if(n!=null){
const base=locs.map(()=>0);
let left=n;
for(let i=0;i<locs.length&&left>0;i++){base[i]=1;left--;}
for(let i=0;left>0&&locs.length;i=(i+1)%locs.length){if(base[i]<7){base[i]++;left--;}else if(base.every(v=>v>=7))break;}
s.locations.forEach((l,i)=>{l.visits=base[i];});
}
const rest={...o};
delete rest.visitsWanted;
delete rest.visits;
return Engine.solve(s,rest);
}
