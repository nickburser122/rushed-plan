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
