(function(root,factory){
const api=factory();
if(typeof module==='object'&&module.exports)module.exports=api;
else root.Engine=api;
if(typeof importScripts==='function'&&typeof WorkerGlobalScope!=='undefined'&&root instanceof WorkerGlobalScope){
root.onmessage=ev=>{
const m=ev.data;
try{
if(m.op==='solve'){
const r=api.solve(m.saved,{...m.opts,onProgress:p=>root.postMessage({id:m.id,type:'progress',p})});
root.postMessage({id:m.id,type:'done',r});
}else if(m.op==='capacity'){
const E=api.createFromSaved(m.saved,{seed:1});
const c=E.capacityInfo({timeBudgetMs:m.opts&&m.opts.timeBudgetMs,noCache:true});
root.postMessage({id:m.id,type:'done',r:{capacity:c.capacity,exact:c.exact,ub:c.ub,struct:c.struct}});
}else if(m.op==='explain'){
const E=api.createFromSaved(m.saved,{seed:1});
root.postMessage({id:m.id,type:'done',r:E.explain(m.opts||{})});
}
}catch(e){root.postMessage({id:m.id,type:'error',e:String(e&&e.message||e)});}
};
}
})(typeof self!=='undefined'?self:this,function(){
const DAYS=['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
const DAY_SHORT=['سبت','أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة'];
const THU=5;
const DISTL={near:'قريب',mid:'متوسط',far:'بعيد'};
const RATIOS=[{rm:1,rc:1,l:'١:١'},{rm:2,rc:1,l:'٢:١'},{rm:3,rc:1,l:'٣:١'}];
const AR='٠١٢٣٤٥٦٧٨٩';
const ar=n=>String(n).replace(/\d/g,d=>AR[+d]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mulberry32(a){return function(){a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const isoD=dt=>dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');

function Dinic(n){
const g=Array.from({length:n},()=>[]),to=[],cap=[];
function add(u,v,c){g[u].push(to.length);to.push(v);cap.push(c);g[v].push(to.length);to.push(u);cap.push(0);}
function flow(s,t){
let total=0;
const level=new Int32Array(n),it=new Int32Array(n);
const bfs=()=>{level.fill(-1);level[s]=0;const q=[s];for(let h=0;h<q.length;h++){const u=q[h];for(const e of g[u])if(cap[e]>0&&level[to[e]]<0){level[to[e]]=level[u]+1;q.push(to[e]);}}return level[t]>=0;};
const dfs=(u,f)=>{
if(u===t)return f;
for(;it[u]<g[u].length;it[u]++){
const e=g[u][it[u]];
if(cap[e]>0&&level[to[e]]===level[u]+1){
const r=dfs(to[e],Math.min(f,cap[e]));
if(r>0){cap[e]-=r;cap[e^1]+=r;return r;}
}
}
return 0;
};
while(bfs()){it.fill(0);let f;while((f=dfs(s,1e9))>0)total+=f;}
return total;
}
return{add,flow};
}

function baseState(){
return{
visits:5,visitsWanted:5,ratioIdx:1,vcap:6,bulk:{main:3,cont:1},minChanges:true,useAllDays:false,autoRegen:true,priority:'balance',carryWeek:false,history:{},gmaxOn:false,gmax:2,rest:{rest:1,maxRun:1},restCalendar:true,restCustom:false,view:'day',weekStart:'2026-01-03',
cap:{mainPerDay:2,conPerDay:1,dayMax:0,even:true},
dup:{mode:'separate',people:'any',spread:'avoid'},
conflicts:[],
pairs:{enabled:false,mode:'soft',rules:[]},
goals:[],
days:Array.from({length:7},(_,i)=>({on:i>=2&&i<=5,fav:'',dist:i===THU?'near':'',max:0})),
members:[],
locations:[]
};
}

function createEngine(state,opts){
opts=opts||{};
let rng=mulberry32(opts.seed==null?1:opts.seed>>>0);
function reseed(v){rng=mulberry32(v>>>0);}
function shuffled(a){const r=a.slice();for(let i=r.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;}
function rand(){return rng();}
const byId=id=>state.members.find(m=>m.id===id);
const locById=id=>state.locations.find(l=>l.id===id);
const poolName=p=>p===1?'سريري':'إداري';
const workingDays=()=>state.days.map((d,i)=>d.on?i:-1).filter(i=>i>=0);
function kCombos(arr,k){const res=[];(function rec(s,cur){if(cur.length===k){res.push(cur.slice());return;}for(let i=s;i<=arr.length-(k-cur.length);i++){cur.push(arr[i]);rec(i+1,cur);cur.pop();}})(0,[]);return res;}
function pickWeighted(arr,ws){let s=0;for(const w of ws)s+=w;let r=rng()*s;for(let i=0;i<arr.length;i++){r-=ws[i];if(r<=0)return arr[i];}return arr[arr.length-1];}
const TYPE_SHAPE={main:{1:2,2:2},contracted:{1:2,2:1}};
const DUP_MODES=['banned','separate','merged'];
const typeShape=t=>TYPE_SHAPE[t]||TYPE_SHAPE.main;
function shapeOf(l){
const b=typeShape(l.type),s=l.seats;
if(!s)return b;
return{1:s[1]==null?b[1]:s[1],2:s[2]==null?b[2]:s[2]};
}
const shapeSize=s=>s[1]+s[2];
const seatsDiffer=(l,s)=>{const b=typeShape(l.type);return s[1]!==b[1]||s[2]!==b[2];};
const dupModeOf=l=>{const m=l&&DUP_MODES.includes(l.dup)?l.dup:state.dup.mode;return m==='banned'&&RX.has('dup')?'separate':m;};
const teamCap=()=>({c:state.members.filter(m=>m.pool===1).length,a:state.members.filter(m=>m.pool===2).length});
const globalDayMax=()=>state.cap.dayMax>0?state.cap.dayMax:state.cap.mainPerDay+state.cap.conPerDay;
const dayMaxOf=d=>{const v=state.days[d].max,b=v>0?v:globalDayMax();return RX.has('daycap')?b+1:b;};
function eligibleFor(m,l){
if(!RX.has('types')&&m.types&&m.types!=='any'&&m.types!==l.type)return false;
if(!RX.has('elig')){
if(l.ban&&l.ban.includes(m.id))return false;
if(l.only&&l.only.length&&!l.only.includes(m.id))return false;
}
return true;
}
function genderOK(genders){
const n=genders.length;
if(n<2)return true;
const men=genders.filter(x=>x==='M').length;
if(n===4)return men===1||men===3;
return men>=1&&men<=n-1;
}
const genderActive=l=>!!l.genderRule&&!RX.has('gender');
let _winCtx=null,_pos=null,RX=new Set(),RXSKIP=new Set(),RXEX=new Set();
const closedOn=(l,d)=>!RX.has('closed')&&l.closed.includes(d);
const offOn=(m,d)=>!RX.has('offdays')&&m.off.includes(d);
function resetCaches(){_winCtx=null;_pos=null;}
function withRelax(fams,fn,more){
const prev=[RX,RXSKIP,RXEX];
more=more||{};
RX=new Set(fams);RXSKIP=new Set(more.skip||[]);RXEX=new Set(more.exempt||[]);resetCaches();
try{return fn();}
finally{[RX,RXSKIP,RXEX]=prev;resetCaches();}
}
function goalDays(g){return g.days.length?g.days.filter(d=>state.days[d]&&state.days[d].on):workingDays();}
function locMax(l,gl){
if(RX.has('loc'))return Infinity;
const n=gl.filter(g=>g.loc.id===l.id).length;
if(l.maxWeek>0)return Math.max(l.maxWeek,n);
if(dupModeOf(l)==='banned'&&!RX.has('dup'))return Math.max(1,n);
if(n>0)return n;
return Infinity;
}
function typeCaps(gl){
const wd=workingDays(),t={main:0,contracted:0};
for(const l of state.locations)t[l.type]+=Math.min(locMax(l,gl),wd.filter(d=>!closedOn(l,d)).length*(dupModeOf(l)==='merged'?2:1));
return t;
}
function splitRange(V,gl){
const tc=typeCaps(gl);
const gm=gl.filter(g=>g.loc.type==='main').length,gc=gl.length-gm;
return{tc,gm,gc,lo:Math.max(gm,V-tc.contracted),hi:Math.min(tc.main,V-gc)};
}
function splitCandidates(V,gl){
const r=splitRange(V,gl),R=RATIOS[state.ratioIdx],want=R.rm/(R.rm+R.rc);
if(!state.locations.length)return{list:[],goalShort:false,capped:true};
const list=[];
for(let nm=r.lo;nm<=r.hi;nm++)list.push({nm,nc:V-nm});
if(!list.length){
const nm=clamp(Math.round(V*want),r.gm,r.tc.main),nc=Math.min(V-nm,r.tc.contracted);
return{list:nm+nc>0?[{nm,nc}]:[],goalShort:gl.length>0&&(r.gm>r.tc.main||r.gc>r.tc.contracted||r.gm+r.gc>V),capped:true};
}
list.sort((a,b)=>Math.abs(a.nm/V-want)-Math.abs(b.nm/V-want)||b.nm-a.nm);
return{list,goalShort:false,capped:false};
}
function effSplit(gl){
gl=gl||compileGoals().list;
const c=splitCandidates(state.visits,gl);
if(!c.list.length)return{nm:0,nc:0,capped:true,goalShort:c.goalShort};
return{nm:c.list[0].nm,nc:c.list[0].nc,capped:c.capped,goalShort:c.goalShort};
}
function compilePairs(){
const P={on:false,hard:false,list:[],with:new Map(),avoid:new Map()};
if(!state.pairs.enabled)return P;
const alive=new Set(state.members.map(m=>m.id)),seen=new Set();
for(const r of state.pairs.rules){
if(r.a===r.b||!alive.has(r.a)||!alive.has(r.b)||RXSKIP.has(r.id))continue;
const k=Math.min(r.a,r.b)+':'+Math.max(r.a,r.b)+':'+r.kind;
if(seen.has(k))continue;seen.add(k);
const M=r.kind==='avoid'?P.avoid:P.with;
if(!M.has(r.a))M.set(r.a,new Set());M.get(r.a).add(r.b);
if(!M.has(r.b))M.set(r.b,new Set());M.get(r.b).add(r.a);
P.list.push({a:r.a,b:r.b,kind:r.kind});
}
P.on=P.list.length>0;P.hard=state.pairs.mode==='hard'&&!RX.has('pairs');
return P;
}
function compileConflicts(){
const alive=new Set(state.locations.map(l=>l.id)),mem=new Set(state.members.map(m=>m.id));
const out=[];
if(RX.has('conflicts'))return out;
for(const r of state.conflicts){
if(!r.on||RXSKIP.has(r.id))continue;
const a=r.a.filter(id=>alive.has(id)),b=r.b.filter(id=>alive.has(id));
if(!a.length||!b.length)continue;
out.push({id:r.id,A:new Set(a),B:new Set(b),hard:r.hard!==false,scope:r.scope,pool:r.pool,ids:new Set((r.ids||[]).filter(id=>mem.has(id)))});
}
return out;
}
const conflictAppliesTo=(c,m)=>c.scope==='all'||(c.scope==='pool'&&m.pool===c.pool)||(c.scope==='members'&&c.ids.has(m.id));
function conflictHit(rules,m,visited,locId){
for(const c of rules){
if(!conflictAppliesTo(c,m))continue;
if(c.A.has(locId))for(const v of visited)if(c.B.has(v))return c;
if(c.B.has(locId))for(const v of visited)if(c.A.has(v))return c;
}
return null;
}
function conflictName(r){
const nm=ids=>ids.map(id=>{const l=locById(id);return l?l.name:'؟';}).join(' / ');
return nm(r.a)+' ↔ '+nm(r.b);
}
function conflictWho(r){
if(r.scope==='pool')return 'كل '+poolName(r.pool)+'';
if(r.scope==='members')return (r.ids||[]).map(id=>{const m=byId(id);return m?m.name:'؟';}).join('، ')||'أعضاء محددون';
return 'كل الأعضاء';
}

function goalLabel(g){const i=state.goals.indexOf(g);return (g.mode==='custom'?'زيارة خاصة ':'هدف ')+ar(i+1);}
const goalIsCustom=g=>g.mode==='custom';
const customSize=g=>clamp(Math.round(+g.size)||2,1,8);
const poolWord=q=>q===1?'سريريين':'إداريين';
function seatsFit(shapes,T){
let c=0,a=0;
for(const s of shapes){c+=s[1];a+=s[2];}
return c<=T.c&&a<=T.a;
}
function compileGoals(){
const list=[],issues=new Map();
const alive=new Set(state.members.map(m=>m.id));
const P=compilePairs(),CF=compileConflicts();
const add=(g,msg)=>{if(!issues.has(g.id))issues.set(g.id,[]);issues.get(g.id).push(msg);};
const active=RX.has('goals')?[]:state.goals.filter(g=>g.on&&!RXSKIP.has(g.id));
for(const g of active){
const people=g.people.filter(id=>alive.has(id));
const loc=locById(g.loc);
if(!loc){add(g,g.loc==null?'اختر موقعًا':'الموقع المحدد حُذف — اختر موقعًا آخر');continue;}
for(const d of g.days)if(!state.days[d].on){add(g,'يوم '+DAYS[d]+' ليس يوم عمل');break;}
if(g.exclude.some(id=>g.people.includes(id)))add(g,'عضو محدد ومستبعد معًا');
const gd=goalDays(g).filter(d=>!closedOn(loc,d));
if(g.days.length===1&&closedOn(loc,g.days[0]))add(g,'الموقع مغلق يوم '+DAYS[g.days[0]]);
else if(!gd.length&&!issues.has(g.id))add(g,'الموقع مغلق في كل الأيام المتاحة');
const ppl=people.map(byId);
const custom=goalIsCustom(g),sh=custom?null:shapeOf(loc);
for(const m of ppl){
if(m.types&&m.types!=='any'&&m.types!==loc.type)add(g,m.name+' لا يزور '+(loc.type==='main'?'المواقع الرئيسية':'المتعاقدة'));
else if(!eligibleFor(m,loc))add(g,m.name+' غير مؤهل لهذا الموقع');
}
let allowed=null;
if(custom){
const size=customSize(g);
allowed=(g.allowed&&g.allowed.length?g.allowed.filter(id=>alive.has(id)):state.members.map(m=>m.id));
for(const id of people)if(!allowed.includes(id))allowed.push(id);
allowed=allowed.filter(id=>!g.exclude.includes(id));
if(ppl.length>size)add(g,'الأعضاء المحددون أكثر من حجم الفريق ('+ar(size)+')');
const usable=allowed.filter(id=>{const m=byId(id);return m&&eligibleFor(m,loc);});
if(usable.length<size)add(g,'المؤهلون المتاحون ('+ar(usable.length)+') أقل من حجم الفريق ('+ar(size)+')');
}else{
if(shapeSize(sh)<1)add(g,'هذا الموقع بلا مقاعد — عدّل مقاعد الموقع');
const n1=ppl.filter(m=>m.pool===1).length,n2=ppl.length-n1;
if(n1>sh[1])add(g,sh[1]?'الفريق يتسع لـ '+ar(sh[1])+' سريريين فقط':'لا مقاعد سريرية في هذا الموقع');
if(n2>sh[2])add(g,sh[2]?'الفريق يتسع لـ '+ar(sh[2])+' إداريين فقط':'لا مقاعد إدارية في هذا الموقع');
}
if(ppl.length&&gd.length&&!gd.some(d=>ppl.every(m=>!m.off.includes(d)))){
if(g.days.length===1){for(const m of ppl)if(m.off.includes(g.days[0]))add(g,m.name+' في إجازة يوم '+DAYS[g.days[0]]);}
else add(g,'لا يوم عمل يتاح فيه كل الأعضاء المحددين');
}
if(P.on&&P.hard)for(let i=0;i<ppl.length;i++)for(let j=i+1;j<ppl.length;j++)if(P.avoid.get(ppl[i].id)&&P.avoid.get(ppl[i].id).has(ppl[j].id))add(g,'قاعدة «ليس مع» تمنع '+ppl[i].name+' و'+ppl[j].name);
if(!custom&&genderActive(loc)&&ppl.length===shapeSize(sh)&&shapeSize(sh)>=2&&!genderOK(ppl.map(m=>m.gender)))add(g,'تشكيل الفريق يخالف قاعدة الخلط النوعي');
if(!issues.has(g.id))list.push({id:g.id,loc,days:gd,people,excl:g.exclude.filter(id=>alive.has(id)),custom:custom?{size:customSize(g),allowed}:null});
}
const fixed=list.filter(g=>g.days.length===1);
const gobj=id=>state.goals.find(x=>x.id===id);
for(let i=0;i<fixed.length;i++)for(let j=i+1;j<fixed.length;j++){
const a=fixed[i],b=fixed[j],ga=gobj(a.id),gb=gobj(b.id),da=a.days[0],db=b.days[0];
const shared=a.people.filter(id=>b.people.includes(id));
if(a.loc.id===b.loc.id){
if(dupModeOf(a.loc)==='merged'){if(da!==db)add(gb,'سياسة «مدموج»: يجب أن يكون مع '+goalLabel(ga)+' في اليوم نفسه');else if(shared.length)add(gb,'يتكرر مع '+goalLabel(ga)+' بنفس الأعضاء');}
else if(da===db)add(gb,'يتكرر مع '+goalLabel(ga)+' في نفس الموقع واليوم');
}
if(a.loc.id===b.loc.id&&shared.length&&state.dup.people==='different'&&da!==db)add(gb,byId(shared[0]).name+' محدد في '+goalLabel(ga)+' لنفس الموقع — التكرار يتطلب أعضاء مختلفين');
if(shared.length){
if(da===db)add(gb,byId(shared[0]).name+' محدد في '+goalLabel(ga)+' بنفس اليوم');
else{const bad=shared.find(id=>!restOK([da,db],ruleOf(byId(id))));if(bad!=null)add(gb,byId(bad).name+' يخالف نمط الراحة مع '+goalLabel(ga));}
}
}
for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
const a=list[i],b=list[j];
const sh=a.people.filter(id=>b.people.includes(id));
if(!sh.length)continue;
for(const id of sh){
const m=byId(id);
if(a.loc.id!==b.loc.id&&conflictHit(CF.filter(c=>c.hard),m,[a.loc.id],b.loc.id))add(gobj(b.id),m.name+' محدد في موقعين متعارضين: '+a.loc.name+' و'+b.loc.name);
}
if(a.days.length===1&&b.days.length===1)continue;
if(!a.days.some(x=>b.days.some(y=>x!==y&&sh.every(id=>restOK([x,y],ruleOf(byId(id)))))))add(gobj(b.id),byId(sh[0]).name+' محدد في '+goalLabel(gobj(a.id))+' ولا يوجد يومان مناسبان');
}
const byLoc=new Map();
for(const g of list){if(!byLoc.has(g.loc.id))byLoc.set(g.loc.id,[]);byLoc.get(g.loc.id).push(g);}
for(const gs of byLoc.values()){
const l=gs[0].loc;
if(l.maxWeek>0&&gs.length>l.maxWeek)for(const g of gs.slice(l.maxWeek))add(gobj(g.id),'عدد الأهداف في '+l.name+' يتجاوز حدها الأسبوعي');
else if(gs.length>1&&dupModeOf(l)==='banned'&&!(l.maxWeek>0))add(gobj(gs[gs.length-1].id),'تكرار '+l.name+' ممنوع في سياسة التكرار');
if(gs.length>1&&dupModeOf(l)!=='merged'&&new Set(gs.flatMap(g=>g.days)).size<gs.length)add(gobj(gs[gs.length-1].id),'أيام الأهداف في '+l.name+' لا تكفي');
}
const T=teamCap();
for(const d of workingDays()){
const fx=fixed.filter(g=>g.days[0]===d);
if(!fx.length)continue;
const trips=new Map();
for(const g of fx)trips.set(g.loc.id,g.loc);
const tm=[...trips.values()].filter(l=>l.type==='main').length,tcn=trips.size-tm;
const last=fx[fx.length-1];
if(trips.size>dayMaxOf(d)||tm>state.cap.mainPerDay||tcn>state.cap.conPerDay||!seatsFit(fx.filter(g=>!g.custom).map(g=>shapeOf(g.loc)),T))add(gobj(last.id),'أهداف يوم '+DAYS[d]+' تتجاوز الحد اليومي');
}
for(const m of state.members){
const gs=list.filter(g=>g.people.includes(m.id));
if(gs.length>memberMax(m))add(gobj(gs[gs.length-1].id),m.name+': أهدافه أكثر من حد زياراته');
}
const valid=list.filter(g=>!issues.has(g.id));
return{list:valid,issues,active:active.length};
}
function goalCounts(){
const G=compileGoals().list;
return{gm:G.filter(g=>g.loc.type==='main').length,gc:G.filter(g=>g.loc.type==='contracted').length,n:G.length};
}
function expectedSeats(sp){
const avg=t=>{
const ls=state.locations.filter(l=>l.type===t);
if(!ls.length)return{1:0,2:0};
return{1:ls.reduce((s,l)=>s+shapeOf(l)[1],0)/ls.length,2:ls.reduce((s,l)=>s+shapeOf(l)[2],0)/ls.length};
};
const a=avg('main'),b=avg('contracted');
return{1:Math.round(sp.nm*a[1]+sp.nc*b[1]),2:Math.round(sp.nm*a[2]+sp.nc*b[2])};
}
const PRESETS=[{k:'11',rest:1,maxRun:1,l:'زيارة ثم راحة يوم'},{k:'12',rest:1,maxRun:2,l:'يومان ثم راحة يوم'},{k:'21',rest:2,maxRun:1,l:'زيارة ثم راحة يومين'},{k:'01',rest:0,maxRun:1,l:'بلا قيود (أيام متتالية)'}];
const presetKey=r=>{const p=r&&PRESETS.find(x=>x.rest===r.rest&&(r.rest===0||x.maxRun===r.maxRun));return p?p.k:null;};
function ruleText(R){
if(R.rest===0)return 'بلا قيود: يجوز للعضو العمل في أيام متتالية';
const run=['','يوم عمل واحد متتالٍ','يومي عمل متتاليين','ثلاثة أيام عمل متتالية'][R.maxRun];
const rs=['','راحة يوم','راحة يومين','راحة ثلاثة أيام'][R.rest];
return 'كل عضو: حتى '+run+' ثم '+rs+' على الأقل';
}
function calOn(){return RX.has('rest')?true:state.restCalendar;}
function ruleOf(m){if(RX.has('rest')||RXEX.has(m.id))return{rest:0,maxRun:1};return m.rest||state.rest;}
function memberMin(m){return RX.has('members')?0:(m.vmode==='exact'||m.vmode==='range'?m.vmin:0);}
function globalMax(){return state.gmaxOn&&!RX.has('members')?state.gmax:Infinity;}
function memberMax(m){if(RX.has('members'))return Infinity;return Math.min(m.vmode==='exact'?m.vmin:m.vmode==='range'?m.vmax:Infinity,globalMax(),state.dup.people==='all'&&!RX.has('dupPeople')?1:Infinity);}
function maxVisitDays(m,wd){
const av=wd.filter(d=>!offOn(m,d)),rule=ruleOf(m);
let best=0;
for(let mask=1;mask<(1<<av.length);mask++){
const pick=[];
for(let i=0;i<av.length;i++)if(mask&(1<<i))pick.push(av[i]);
if(pick.length>best&&restOK(pick,rule))best=pick.length;
}
return best;
}
function compileMembers(seats){
const issues=[],wd=workingDays();
const names={1:'السريريين',2:'الإداريين'};
const lo={1:0,2:0},hi={1:0,2:0},custom={1:false,2:false};
for(const m of state.members){
const mn=memberMin(m),cap=Math.min(maxVisitDays(m,wd),globalMax());
if(mn>maxVisitDays(m,wd))issues.push(m.name+': الحد الأدنى أكبر من أيامه المتاحة');
else if(mn>cap)issues.push(m.name+': الحد الأدنى أكبر من الحد العام لزيارات الأعضاء');
lo[m.pool]+=mn;hi[m.pool]+=Math.min(memberMax(m),cap);
if(m.vmode==='exact'||m.vmode==='range')custom[m.pool]=true;
}
for(const q of[1,2]){
if(lo[q]>seats[q])issues.push('مجموع الحد الأدنى للأعضاء '+names[q]+' ('+ar(lo[q])+') أكبر من مقاعد الخطة ('+ar(seats[q])+') — ارفع الزيارات أو خفّض الأعداد');
else if((custom[q]||state.gmaxOn)&&hi[q]<seats[q])issues.push('مجموع الحد الأقصى للأعضاء '+names[q]+' ('+ar(hi[q])+') أقل من مقاعد الخطة ('+ar(seats[q])+') — خفّض الزيارات أو ارفع الحدود');
}
return{issues,lo,hi,seats,custom:custom[1]||custom[2]||state.gmaxOn};
}
function compileModel(opts){
opts=opts||{};
resetCaches();
const days=workingDays().sort((a,b)=>a-b);
const locs=state.locations.slice();
const G=compileGoals();
const goals=G.list;
const splits=splitCandidates(state.visits,goals);
const lmax=new Map(locs.map(l=>[l.id,locMax(l,goals)]));
const avail=new Map(days.map(d=>[d,{c:state.members.filter(m=>m.pool===1&&!offOn(m,d)).length,a:state.members.filter(m=>m.pool===2&&!offOn(m,d)).length}]));
const eligCache=new Map();
const budget={1:0,2:0};
for(const m of state.members)budget[m.pool]+=Math.min(maxVisitDays(m,days),memberMax(m));
const M={
days,dayCfg:state.days,locs,mains:locs.filter(l=>l.type==='main'),cons:locs.filter(l=>l.type==='contracted'),
members:state.members,visits:state.visits,useAll:state.useAllDays,even:state.cap.even,
pairs:compilePairs(),conflicts:compileConflicts(),goals,lmax,splits:splits.list,goalShort:splits.goalShort,
cap:{main:state.cap.mainPerDay,con:state.cap.conPerDay},dayMax:dayMaxOf,
dup:dupModeOf,dupPeople:RX.has('dupPeople')&&state.dup.people!=='any'?'any':state.dup.people,spreadPen:state.dup.spread==='avoid'?4:1.2,
avail,budget,win:winCtx(),relax:new Set(opts.relax||[])
};
M.locOf=id=>locs.find(l=>l.id===id);
M.elig=(l,d)=>{
const k=l.id+':'+d;
let e=eligCache.get(k);
if(!e){
e={1:0,2:0};
for(const m of state.members)if(!offOn(m,d)&&eligibleFor(m,l))e[m.pool]++;
eligCache.set(k,e);
}
return e;
};
return M;
}

function dayPos(d){
if(d<0)return d;
if(calOn())return d;
if(!_pos){let k=0;_pos=state.days.map(x=>x.on?k++:null);}
return _pos[d];
}
function restOK(days,rule){
if(rule.rest===0)return true;
const p=[];
for(const d of days){const x=dayPos(d);if(x!==null&&p.indexOf(x)<0)p.push(x);}
p.sort((a,b)=>a-b);
let run=1;
for(let i=1;i<p.length;i++){
const gap=p[i]-p[i-1]-1;
if(gap===0){if(++run>rule.maxRun)return false;}
else{if(gap<rule.rest)return false;run=1;}
}
return true;
}
function winCap(rule,W){
if(rule.rest===0)return W;
const per=rule.maxRun+rule.rest;
return Math.floor(W/per)*rule.maxRun+Math.min(W%per,rule.maxRun);
}
function windowSpan(){
let w=1;
for(const m of state.members){const r=ruleOf(m);if(r.rest>0)w=Math.max(w,r.maxRun+r.rest+1);}
return Math.min(4,w);
}
function poolWinCap(pool,W){
let t=0;
for(const m of state.members)if(m.pool===pool)t+=Math.min(winCap(ruleOf(m),W),memberMax(m));
return t;
}
function seqDays(on){return calOn()?[0,1,2,3,4,5,6]:[0,1,2,3,4,5,6].filter(d=>on[d]);}
function winCtx(){
if(_winCtx)return _winCtx;
const seq=seqDays(state.days.map(d=>d.on)),W=windowSpan();
const caps=seq.map((d,k)=>{
const c=[],a=[];
for(let w=1;w<=Math.min(W,k+1);w++){c.push(poolWinCap(1,w));a.push(poolWinCap(2,w));}
return{c,a};
});
return _winCtx={seq,W,caps};
}
function windowLoadOK(loadAt,d,sc,sa,ctx){
const seq=ctx.seq,k=seq.indexOf(d);
if(k<0)return true;
const get=i=>{if(i===k)return[sc,sa];const L=loadAt(seq[i]);return L?[L.c,L.a]:[0,0];};
for(let w=1;w<=ctx.W;w++)for(let st=k-w+1;st<=k;st++){
if(st<0||st+w>seq.length)continue;
let c=0,a=0;
for(let i=st;i<st+w;i++){const q=get(i);c+=q[0];a+=q[1];}
const cp=ctx.caps[st+w-1];
if(c>cp.c[w-1]||a>cp.a[w-1])return false;
}
return true;
}
const goalShape=g=>g.custom?{1:0,2:0}:shapeOf(g.loc);
function makeBoard(M){
const load=new Map(M.days.map(d=>[d,{c:0,a:0,trips:0,main:0,con:0}]));
const dayLocs=new Map(M.days.map(d=>[d,new Map()]));
const usage=new Map(),slots=[];
let tc=0,ta=0;
const mult=(same)=>M.dupPeople==='different'?same+1:1;
return{
load,dayLocs,usage,slots,
fits(l,d,sh,customSize){
const L=load.get(d);
if(!L||closedOn(l,d))return false;
if(!customSize&&sh[1]+sh[2]<1)return false;
if((usage.get(l.id)||0)>=M.lmax.get(l.id))return false;
const same=dayLocs.get(d).get(l.id)||0;
if(same&&M.dup(l)!=='merged')return false;
if(!same&&usage.get(l.id)&&M.dup(l)==='merged')return false;
if(!same){
if(L.trips>=M.dayMax(d))return false;
if(l.type==='main'?L.main>=M.cap.main:L.con>=M.cap.con)return false;
}
const A=M.avail.get(d),E=M.elig(l,d),k=mult(same);
if(L.c+sh[1]>A.c||L.a+sh[2]>A.a)return false;
if(tc+sh[1]>M.budget[1]||ta+sh[2]>M.budget[2])return false;
if(customSize?E[1]+E[2]<customSize*k:(E[1]<sh[1]*k||E[2]<sh[2]*k))return false;
return windowLoadOK(x=>load.get(x),d,L.c+sh[1],L.a+sh[2],M.win);
},
add(l,d,sh,extra){
const L=load.get(d),dl=dayLocs.get(d),same=dl.get(l.id)||0;
if(!same){L.trips++;if(l.type==='main')L.main++;else L.con++;}
dl.set(l.id,same+1);
L.c+=sh[1];L.a+=sh[2];tc+=sh[1];ta+=sh[2];
usage.set(l.id,(usage.get(l.id)||0)+1);
const s={loc:l,day:d,shape:{1:sh[1],2:sh[2]},custom:null,...extra};
slots.push(s);
return s;
}
};
}
function goalDayOK(M,g,d,taken){
if(!g.days.includes(d))return false;
if(g.people.some(id=>offOn(byId(id),d)))return false;
for(const t of taken){
if(t.loc.id!==g.loc.id)continue;
if(M.dup(g.loc)!=='merged'){if(t.day===d)return false;}
else if(t.day!==d||t.people.some(id=>g.people.includes(id)))return false;
}
for(const id of g.people){
const ds=taken.filter(t=>t.people.includes(id)).map(t=>t.day);
if(!ds.length)continue;
if(ds.includes(d))return false;
if(!restOK(ds.concat(d),ruleOf(byId(id))))return false;
}
return true;
}
function attachGoals(M,slots){
const cand=g=>slots.filter(s=>s.loc.id===g.loc.id&&g.days.includes(s.day));
const gs=M.goals.slice().sort((a,b)=>cand(a).length-cand(b).length||b.people.length-a.people.length);
const taken=[];
function rec(i){
if(i===gs.length)return true;
const g=gs[i];
const opts=shuffled(cand(g).filter(s=>!s.goal&&goalDayOK(M,g,s.day,taken)));
for(const s of opts){
s.goal=g.id;s.req=g.people.slice();s.excl=g.excl.slice();s.custom=g.custom;
taken.push({loc:g.loc,day:s.day,people:g.people});
if(rec(i+1))return true;
taken.pop();
delete s.goal;delete s.req;delete s.excl;s.custom=null;
}
return false;
}
return rec(0)?slots:null;
}
function replaySlots(M,ref){
const B=makeBoard(M);
for(const s of ref){
const l=M.locOf(s.loc.id);
if(!l)return null;
const sh=shapeOf(l);
if(!B.fits(l,s.day,sh,0))return null;
B.add(l,s.day,sh,{});
}
if(B.slots.length!==M.visits)return null;
if(M.useAll&&M.days.some(d=>!B.load.get(d).trips))return null;
return attachGoals(M,B.slots);
}
function pickSplit(M){
if(!M.splits.length)return null;
let i=0;
while(i<M.splits.length-1&&rng()<0.3)i++;
return M.splits[i];
}
function placeGoals(M,B,rem){
const pre=[];
if(!M.goals.length)return pre;
const gs=shuffled(M.goals);
gs.sort((a,b)=>a.days.length-b.days.length||b.people.length-a.people.length);
for(const g of gs){
const t=g.loc.type;
if(rem&&rem[t]<=0)return null;
const sh=goalShape(g),cs=g.custom?g.custom.size:0;
const cands=M.days.filter(d=>goalDayOK(M,g,d,pre)&&B.fits(g.loc,d,sh,cs));
if(!cands.length)return null;
const ws=cands.map(d=>{
const dp=M.dayCfg[d],L=B.load.get(d);
let w=dp.fav===t?3:(dp.fav?0.6:1.5);
if(dp.dist&&g.loc.dist===dp.dist)w*=2.5;
w*=1-L.trips*0.3;
return Math.max(0.05,w)*(0.4+rng());
});
const d=pickWeighted(cands,ws);
B.add(g.loc,d,sh,{goal:g.id,req:g.people.slice(),excl:g.excl.slice(),custom:g.custom});
if(rem)rem[t]--;
pre.push({loc:g.loc,day:d,people:g.people});
}
return pre;
}
const strictChance=n=>n<150?0.8:n<500?0.4:0.12;
function buildSlots(M,ref,attempt){
if(ref&&rng()<0.45){
const ok=replaySlots(M,ref);
if(ok)return ok;
}
const sp=pickSplit(M);
if(!sp)return null;
if(M.useAll&&M.days.length>M.visits)return null;
const B=makeBoard(M),rem={main:sp.nm,contracted:sp.nc};
if(placeGoals(M,B,rem)===null)return null;
const strict=(M.even||M.useAll)&&rng()<strictChance(attempt||0);
const tokens=shuffled([...Array(Math.max(0,rem.main)).fill('main'),...Array(Math.max(0,rem.contracted)).fill('contracted')]);
for(const t of tokens){
const cands=[],pool=t==='main'?M.mains:M.cons;
for(const d of M.days){
const trips=B.load.get(d).trips;
for(const l of pool)if(B.fits(l,d,shapeOf(l),0))cands.push({l,d,trips});
}
if(!cands.length)return null;
let sel=cands;
if(strict){
let mn=Infinity;
for(const c of cands)if(c.trips<mn)mn=c.trips;
sel=cands.filter(c=>c.trips===mn);
}
const ws=sel.map(c=>{
const dp=M.dayCfg[c.d];
let w=dp.fav===t?6:(dp.fav?0.45:2);
if(!strict)w*=Math.max(0.05,1-c.trips*0.3);
let s=3-(B.usage.get(c.l.id)||0)*M.spreadPen+rng()*1.6;
if(dp.dist){
if(c.l.dist===dp.dist)s+=5;
else if(c.l.dist&&c.l.dist!=='mid')s-=2;
else s+=0.3;
}
return Math.max(0.05,w)*Math.max(0.05,s);
});
const c=pickWeighted(sel,ws);
B.add(c.l,c.d,shapeOf(c.l),{});
}
if(M.useAll&&M.days.some(d=>!B.load.get(d).trips))return null;
return B.slots;
}

function solveTeams(M,slots,opts){
const soft=opts.soft||new Set();
const vs=slots.slice().sort((a,b)=>a.day-b.day);
const n=vs.length,teams=new Array(n),missRows=new Array(n),violRows=new Array(n),cvRows=new Array(n);
const busy=new Set(),md=new Map(),cnt=new Map(),vis=new Map(),locMem=new Map();
const minMembers=M.members.filter(m=>memberMin(m)>0);
const custom=state.gmaxOn||M.members.some(m=>m.vmode==='exact'||m.vmode==='range');
let steps=custom?(M.pairs.hard?7000:5200):(M.pairs.hard?5200:3600),prefMiss=0,consecViol=0,conflictViol=0;
const hardRules=M.conflicts.filter(c=>c.hard),softRules=M.conflicts.filter(c=>!c.hard);
const defi=m=>Math.max(0,memberMin(m)-(cnt.get(m.id)||0));
const resv=new Map(),resvDays=new Map(),resvLocs=new Map(),prevMap=carryPrev();
vs.forEach((s,i)=>{
if(!s.req)return;
for(const id of s.req){
resv.set(id+':'+s.day,i);
if(!resvDays.has(id))resvDays.set(id,[]);
resvDays.get(id).push({d:s.day,i});
if(!resvLocs.has(id))resvLocs.set(id,[]);
resvLocs.get(id).push({l:s.loc.id,i});
}
});
const pinnedAfter=(id,i)=>{
const a=resvDays.get(id);
if(!a)return 0;
let k=0;
for(const q of a)if(q.i>i)k++;
return k;
};
const seatTotals=j=>{
let a=0,b=0,c=0;
for(let q=j;q<n;q++){
if(vs[q].custom)c+=vs[q].custom.size;
else{a+=vs[q].shape[1];b+=vs[q].shape[2];}
}
return[a,b,c];
};
const pruned=i=>{
for(const [id,a] of resvDays){
const m=byId(id),mx=memberMax(m);
if(a.length>mx)continue;
if((cnt.get(id)||0)+pinnedAfter(id,i)>mx)return true;
}
if(!minMembers.length)return false;
const [R1,R2,RC]=seatTotals(i+1);
let D1=0,D2=0;
for(const m of minMembers){
const df=defi(m);if(!df)continue;
if(m.pool===1)D1+=df;else D2+=df;
const days=new Set(),asg=md.get(m.id),base=(asg?[...asg]:[]).concat(prevMap.get(m.id)||[]),rule=ruleOf(m);
for(let j=i+1;j<n;j++){
const d=vs[j].day;
if(offOn(m,d)||busy.has(m.id+':'+d)||(vs[j].excl&&vs[j].excl.includes(m.id))||!eligibleFor(m,vs[j].loc))continue;
if(!soft.has('rest')&&rule.rest>0&&!restOK(base.concat(d),rule))continue;
days.add(d);
}
if(days.size<df)return true;
}
return D1>R1+RC||D2>R2+RC||D1+D2>R1+R2+RC;
};
const reservedElse=(id,d,i)=>{const r=resv.get(id+':'+d);return r!=null&&r!==i;};
const visitedFor=(id,i)=>{
const out=new Set(vis.has(id)?vis.get(id).keys():[]);
for(const q of(resvLocs.get(id)||[]))if(q.i!==i)out.add(q.l);
return out;
};
const bump=(map,k,sub,d)=>{
let s=map.get(k);
if(!s){s=new Map();map.set(k,s);}
const v=(s.get(sub)||0)+d;
if(v<=0)s.delete(sub);else s.set(sub,v);
};
function dfs(i){
if(i===n)return minMembers.every(m=>(cnt.get(m.id)||0)>=memberMin(m));
if(--steps<0){if(opts.info)opts.info.stepsOut=true;return false;}
const v=vs[i],cu=v.custom,sh=v.shape;
const req=v.req&&v.req.length?new Set(v.req):null;
const c1=[],c2=[],cc=[];
const lm=locMem.get(v.loc.id);
for(const m of M.members){
if(offOn(m,v.day)||busy.has(m.id+':'+v.day))continue;
if(v.excl&&v.excl.includes(m.id))continue;
if(!eligibleFor(m,v.loc))continue;
const isReq=!!(req&&req.has(m.id));
if(cu&&cu.allowed&&!cu.allowed.includes(m.id)&&!isReq)continue;
if(reservedElse(m.id,v.day,i))continue;
if(!isReq&&(cnt.get(m.id)||0)+1+pinnedAfter(m.id,i)>memberMax(m))continue;
if(!isReq&&M.dupPeople==='different'&&lm&&lm.has(m.id))continue;
const rule=ruleOf(m),s=md.get(m.id),base=s?[...s]:[];
for(const q of(resvDays.get(m.id)||[]))if(q.i!==i)base.push(q.d);
for(const q of(prevMap.get(m.id)||[]))base.push(q);
const viol=restOK(base.concat(v.day),rule)?0:1;
if(viol&&!soft.has('rest'))continue;
let cf=0;
if(hardRules.length||softRules.length){
const seen=visitedFor(m.id,i);
if(hardRules.length&&conflictHit(hardRules,m,seen,v.loc.id)){
if(!soft.has('conflicts')&&!isReq)continue;
cf=2;
}else if(softRules.length&&conflictHit(softRules,m,seen,v.loc.id))cf=1;
}
let pv=0;
if(m.pref&&v.loc.dist&&v.loc.dist!=='mid'&&(m.pref==='near'||m.pref==='far'))pv=m.pref===v.loc.dist?1:-1;
let rb=0;
if(opts.refMD&&opts.refMD.has(m.id+':'+v.day))rb-=16;
if(opts.refTR&&opts.refTR.has(m.id+':'+v.day+':'+v.loc.id))rb-=26;
if(isReq)rb-=5000;
let rem=0;
for(const d of M.days){
if(d<v.day||offOn(m,d)||busy.has(m.id+':'+d))continue;
if(rule.rest>0&&!restOK(base.concat(d),rule))continue;
rem++;
}
const rec={m,pv,viol,rem,rb,cf};
if(cu)cc.push(rec);else(m.pool===1?c1:c2).push(rec);
}
if(cu){if(cc.length<cu.size)return false;}
else if(c1.length<sh[1]||c2.length<sh[2])return false;
if(req){const ok=new Set(c1.concat(c2,cc).map(x=>x.m.id));for(const id of req)if(!ok.has(id))return false;}
const P=M.pairs;
const availSet=P.on?new Set(c1.concat(c2,cc).map(x=>x.m.id)):null;
const rankKey=x=>(cnt.get(x.m.id)||0)*8+x.viol*140+x.cf*120+x.rb-90*defi(x.m)-52*(x.pv===1?1:0)+52*(x.pv===-1?1:0)+(x.m.prefDays&&x.m.prefDays.length?(x.m.prefDays.includes(v.day)?-20:20):0);
const wide=opts.wide|0;
const trunc=(arr,k)=>{
if(wide>=2)return arr;
const keep=wide===1?Math.max(16,k+8):Math.max(8,k+4),thr=wide===1?Math.max(12,k+6):Math.max(6,k+3);
if(arr.length>thr){if(opts.info)opts.info.truncated=true;return arr.slice().sort((p,q)=>rankKey(p)-rankKey(q)).slice(0,keep);}
return arr;
};
const combos=[];
const teamSets=[];
if(cu){for(const t of kCombos(trunc(cc,cu.size),cu.size))teamSets.push(t);}
else{
const A=trunc(c1,sh[1]),B=trunc(c2,sh[2]);
for(const a of kCombos(A,sh[1]))for(const b of kCombos(B,sh[2]))teamSets.push(a.concat(b));
}
for(const team of teamSets){
if(req&&team.filter(x=>req.has(x.m.id)).length!==req.size)continue;
if(!cu&&genderActive(v.loc)&&!genderOK(team.map(x=>x.m.gender)))continue;
let sc=0,miss=0,vio=0,cfv=0;
for(const x of team){
if(req&&req.has(x.m.id)){sc+=x.viol*140+x.cf*120;if(x.viol)vio++;if(x.cf)cfv++;continue;}
sc+=(cnt.get(x.m.id)||0)*8+x.rem*3+x.viol*140+x.cf*120+x.rb-90*defi(x.m)+rng()*7;
if(x.pv===1)sc-=52;else if(x.pv===-1){sc+=52;miss++;}
if(x.m.prefDays&&x.m.prefDays.length)sc+=x.m.prefDays.includes(v.day)?-20:20;
if(x.viol)vio++;
if(x.cf)cfv++;
}
if(P.on){
const ids=team.map(x=>x.m.id);
let pb=0,skip=false;
for(let a=0;a<ids.length-1&&!skip;a++)for(let b=a+1;b<ids.length;b++){
const A=ids[a],B=ids[b];
if(P.with.get(A)&&P.with.get(A).has(B))pb-=48;
else if(P.avoid.get(A)&&P.avoid.get(A).has(B)){
if(P.hard&&!soft.has('pairs')){skip=true;break;}
pb+=170;
}
}
if(skip)continue;
const inTeam=new Set(ids);
for(const id of ids){
const w=P.with.get(id);if(!w)continue;
for(const pid of w)if(availSet.has(pid)&&!inTeam.has(pid))pb+=22;
}
sc+=pb;
}
combos.push({team,sc,miss,vio,cfv});
}
if(!combos.length)return false;
combos.sort((p,q)=>p.sc-q.sc);
for(const c of combos){
for(const x of c.team){
const id=x.m.id;
busy.add(id+':'+v.day);
let s=md.get(id);
if(!s){s=new Set();md.set(id,s);}
s.add(v.day);
cnt.set(id,(cnt.get(id)||0)+1);
bump(vis,id,v.loc.id,1);
bump(locMem,v.loc.id,id,1);
}
teams[i]=c.team.map(x=>x.m.id);
missRows[i]=c.team.filter(x=>x.pv===-1).map(x=>x.m.id);
violRows[i]=c.team.filter(x=>x.viol).map(x=>x.m.id);
cvRows[i]=c.team.filter(x=>x.cf).map(x=>x.m.id);
prefMiss+=c.miss;consecViol+=c.vio;conflictViol+=c.cfv;
if(!pruned(i)&&dfs(i+1))return true;
for(const x of c.team){
const id=x.m.id;
busy.delete(id+':'+v.day);
md.get(id).delete(v.day);
cnt.set(id,cnt.get(id)-1);
bump(vis,id,v.loc.id,-1);
bump(locMem,v.loc.id,id,-1);
}
teams[i]=undefined;missRows[i]=undefined;violRows[i]=undefined;cvRows[i]=undefined;
prefMiss-=c.miss;consecViol-=c.vio;conflictViol-=c.cfv;
}
return false;
}
return dfs(0)?{teams,missRows,violRows,cvRows,prefMiss,consecViol,conflictViol,order:vs}:null;
}
function hashSol(sol){
return sol.order.map((s,i)=>s.day+':'+s.loc.id+':'+sol.teams[i].slice().sort((x,y)=>x-y).join('.')).sort().join('|');
}
function triples(p){const s=new Set();for(const r of p.rows)for(const id of r.team)s.add(r.day+':'+r.loc.id+':'+id);return s;}
function diffPlans(a,b){
const A=triples(a),B=triples(b);let inter=0;
for(const t of A)if(B.has(t))inter++;
const un=A.size+B.size-inter;
return un?1-inter/un:1;
}
function makePlan(M,sol,ref){
const rows=sol.order.map((s,i)=>({day:s.day,loc:{...s.loc},team:sol.teams[i],miss:sol.missRows[i]||[],viol:sol.violRows[i]||[],cviol:sol.cvRows[i]||[],goal:s.goal||null,req:s.req||[],shape:s.shape,custom:s.custom?{size:s.custom.size}:null}));
const counts=new Map();
for(const r of rows)for(const id of r.team)counts.set(id,(counts.get(id)||0)+1);
let pairHit=0,pairTotal=0,pairBreak=0;
if(M.pairs.on){
for(const r of rows){
r.pbreak=[];
for(const {a,b,kind} of M.pairs.list){
if(kind!=='avoid')continue;
if(r.team.includes(a)&&r.team.includes(b)){r.pbreak.push(a,b);pairBreak++;}
}
}
for(const {a,b,kind} of M.pairs.list){
if(kind!=='with')continue;
let both=0;
for(const r of rows)if(r.team.includes(a)&&r.team.includes(b))both++;
pairHit+=both;
pairTotal+=Math.min(counts.get(a)||0,counts.get(b)||0);
}
}
let prefHit=0,prefTotal=0,favHit=0,favTotal=0,distHit=0,distTotal=0;
const seenTrip=new Set();
for(const r of rows){
const dp=M.dayCfg[r.day],tk=r.day+':'+r.loc.id;
if(!seenTrip.has(tk)){
seenTrip.add(tk);
if(dp.fav){favTotal++;if(r.loc.type===dp.fav)favHit++;}
if(dp.dist){distTotal++;if(r.loc.dist===dp.dist)distHit++;}
}
for(const id of r.team){
const m=byId(id);if(!m)continue;
if(m.pref&&(r.loc.dist==='near'||r.loc.dist==='far')){prefTotal++;if(m.pref===r.loc.dist)prefHit++;}
if(m.prefDays&&m.prefDays.length){prefTotal++;if(m.prefDays.includes(r.day))prefHit++;}
}
}
let sim=null;
if(ref){
const B=new Set();
for(const r of ref.rows)for(const id of r.team)B.add(id+':'+r.day);
let inter=0,total=0;
for(const r of rows)for(const id of r.team){total++;if(B.has(id+':'+r.day))inter++;}
sim=inter/Math.max(total,B.size);
}
const am=state.members.filter(m=>m.vmode!=='exact'&&m.vmode!=='range'),tm=state.members.filter(m=>m.vmode==='exact'||m.vmode==='range');
const cs=am.map(m=>counts.get(m.id)||0);
const targetOK=tm.filter(m=>{const c=counts.get(m.id)||0;return c>=memberMin(m)&&c<=memberMax(m);}).length;
const tot=cs.reduce((a,b)=>a+b,0),avg=cs.length?tot/cs.length:0;
let vr=0,ss=0;
for(const c of cs){vr+=(c-avg)**2;ss+=c*c;}
const fair=ss&&cs.length?clamp(1-vr/ss,0,1):1;
const trips=new Map();
for(const r of rows)trips.set(r.day,(trips.get(r.day)||new Set()).add(r.loc.id));
const tl=[...trips.values()].map(s=>s.size);
const evenness=tl.length?1-(Math.max(...tl)-Math.min(...tl))/Math.max(1,Math.max(...tl)):1;
const plan={rows,counts,fair,evenness,prefHit,prefTotal,dayHit:favHit+distHit,dayTotal:favTotal+distTotal,sim,consecViol:sol.consecViol,prefMiss:sol.prefMiss,days:M.days.slice(),pairHit,pairTotal,pairBreak,goalHit:rows.filter(r=>r.goal).length,goalTotal:M.goals.length,targetOK,targetTotal:tm.length};
plan.eval=evaluatePlan(plan,M);
return plan;
}
function evaluatePlan(p,M){
const rows=p.rows,prev=carryPrev(),P=M.pairs;
const hard={rest:0,pairHard:0,targets:0,goals:0,locCap:0,offDay:0,doubleBook:0,teamShape:0,gender:0,conflict:0,dup:0,dayCap:0};
const soft={pairAvoid:0,prefMiss:0,withMiss:0,dayMiss:0,conflictSoft:0};
const days=new Map(),counts=new Map(),lcnt=new Map(),visited=new Map(),perLoc=new Map(),tripsByDay=new Map();
for(const r of rows){
lcnt.set(r.loc.id,(lcnt.get(r.loc.id)||0)+1);
if((r.loc.closed||[]).includes(r.day))hard.locCap++;
const live=M.locOf(r.loc.id)||r.loc;
const seen=new Set();
let c1=0,c2=0;
for(const id of r.team){
const m=byId(id);
if(!m||seen.has(id)){hard.teamShape++;continue;}
seen.add(id);
if(m.pool===1)c1++;else c2++;
if(m.off.includes(r.day)||!eligibleFor(m,live))hard.offDay++;
const ds=days.get(id)||[];
if(ds.includes(r.day))hard.doubleBook++;
ds.push(r.day);days.set(id,ds);
counts.set(id,(counts.get(id)||0)+1);
if(!visited.has(id))visited.set(id,new Set());
visited.get(id).add(r.loc.id);
}
if(r.custom){
if(r.team.length!==r.custom.size)hard.teamShape++;
}else if(c1!==r.shape[1]||c2!==r.shape[2])hard.teamShape++;
if(!r.custom&&genderActive(live)&&!genderOK(r.team.map(id=>{const m=byId(id);return m?m.gender:null;})))hard.gender++;
if(P.on)for(const q of P.list){
if(q.kind==='avoid'&&r.team.includes(q.a)&&r.team.includes(q.b)){if(P.hard)hard.pairHard++;else soft.pairAvoid++;}
}
if(!perLoc.has(r.loc.id))perLoc.set(r.loc.id,[]);
perLoc.get(r.loc.id).push(r);
if(!tripsByDay.has(r.day))tripsByDay.set(r.day,new Map());
tripsByDay.get(r.day).set(r.loc.id,live);
}
for(const [id,ds] of days){
const rule=ruleOf(byId(id));
if(rule.rest===0)continue;
const pts=new Map();
for(const x of prev.get(id)||[])pts.set(x,false);
for(const d of ds){const x=dayPos(d);if(x!==null&&x!==undefined)pts.set(x,true);}
const seq=[...pts.entries()].sort((a,b)=>a[0]-b[0]);
let run=1;
for(let i=1;i<seq.length;i++){
const gap=seq[i][0]-seq[i-1][0]-1;
if(gap===0){run++;if(run>rule.maxRun&&seq[i][1])hard.rest++;}
else{if(gap<rule.rest&&seq[i][1])hard.rest++;run=1;}
}
}
for(const m of M.members){
const c=counts.get(m.id)||0;
if(c<memberMin(m)||c>memberMax(m))hard.targets++;
}
for(const g of M.goals){
const r=rows.find(x=>x.goal===g.id);
if(!r||r.loc.id!==g.loc.id||!g.days.includes(r.day)||g.people.some(id=>!r.team.includes(id))||g.excl.some(id=>r.team.includes(id))||(g.custom&&(!r.custom||r.team.length!==g.custom.size)))hard.goals++;
}
for(const [id,k] of lcnt){
const mx=M.lmax.get(id);
if(mx!=null&&k>mx)hard.locCap+=k-mx;
}
for(const [id,rs] of perLoc){
if(rs.length<2)continue;
const l=M.locOf(id)||rs[0].loc,mode=M.dup(l);
if(mode==='banned')hard.dup+=rs.length-1;
else if(mode==='separate'){
const byDay=new Map();
for(const r of rs)byDay.set(r.day,(byDay.get(r.day)||0)+1);
for(const k of byDay.values())if(k>1)hard.dup+=k-1;
}
if(M.dupPeople==='different'){
const who=new Map();
for(const r of rs)for(const m of r.team)who.set(m,(who.get(m)||0)+1);
for(const k of who.values())if(k>1)hard.dup+=k-1;
}
}
for(const [d,ls] of tripsByDay){
let tm=0;
for(const l of ls.values())if(l.type==='main')tm++;
if(ls.size>M.dayMax(d))hard.dayCap++;
if(tm>M.cap.main||ls.size-tm>M.cap.con)hard.dayCap++;
}
for(const c of M.conflicts){
for(const [id,set] of visited){
const m=byId(id);
if(!conflictAppliesTo(c,m))continue;
let a=false,b=false;
for(const l of set){if(c.A.has(l))a=true;if(c.B.has(l))b=true;}
if(a&&b){if(c.hard)hard.conflict++;else soft.conflictSoft++;}
}
}
soft.prefMiss=p.prefTotal-p.prefHit;
soft.withMiss=p.pairTotal-p.pairHit;
soft.dayMiss=p.dayTotal-p.dayHit;
const hardCount=Object.values(hard).reduce((a,b)=>a+b,0);
return{hard,soft,hardCount,ruleBreaks:soft.pairAvoid+soft.conflictSoft+hard.targets,clean:hardCount===0&&soft.pairAvoid===0&&soft.prefMiss===0&&soft.conflictSoft===0};
}
const WEIGHTS={balance:{f:0.55,d:0.15,p:0.3,sim:0.32},prefs:{f:0.35,d:0.2,p:0.45,sim:0.32},stable:{f:0.55,d:0.15,p:0.3,sim:0.6}};
function scorePlan(p){
const W=WEIGHTS[state.priority]||WEIGHTS.balance;
let s=W.f*p.fair+W.d*(p.dayTotal?p.dayHit/p.dayTotal:0.5);
if(p.prefTotal)s+=W.p*(p.prefHit/p.prefTotal);
if(p.pairTotal)s+=0.28*(p.pairHit/p.pairTotal);
if(p.pairBreak)s-=0.45*Math.min(1,p.pairBreak/Math.max(1,p.rows.length));
if(state.cap.even)s+=0.12*p.evenness;
if(p.sim!=null)s=(1-W.sim)*s+W.sim*p.sim;
return s+rng()*0.001;
}
function rankTuple(p){
const e=p.eval;
return[e.hardCount,e.clean?0:1,e.ruleBreaks,state.priority==='prefs'?e.soft.prefMiss+e.soft.dayMiss:0,-p.score];
}
function comparePlans(a,b){
const x=rankTuple(a),y=rankTuple(b);
for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;
return 0;
}

const FIX={
memberExempt:{label:f=>'استثناء '+nm(f.id)+' من قاعدة الراحة',run:f=>{const m=byId(f.id);if(m){m.rest={rest:0,maxRun:1};m.restCustom=false;}}},
memberOffClear:{label:f=>'إلغاء إجازة '+nm(f.id)+' يوم '+DAYS[f.day],run:f=>{const m=byId(f.id);if(m)m.off=m.off.filter(d=>d!==f.day);}},
membersAuto:{label:f=>'إلغاء عدد الزيارات المحدد لـ'+nm(f.id),run:f=>{const m=byId(f.id);if(m){m.vmode='auto';m.vmin=0;m.vmax=0;}}},
gmaxOff:{label:()=>'إلغاء الحد العام لزيارات الأعضاء',run:()=>{state.gmaxOn=false;}},
restPreset:{label:f=>'نمط الراحة العام: '+PRESETS.find(p=>p.k===f.k).l,run:f=>{const p=PRESETS.find(x=>x.k===f.k);state.rest={rest:p.rest,maxRun:p.maxRun};state.restCustom=false;}},
goalOff:{label:f=>'تعطيل '+goalNameById(f.id),run:f=>{const g=state.goals.find(x=>x.id===f.id);if(g)g.on=false;}},
dupMode:{label:f=>f.id?'تكرار '+locName(f.id)+': '+DUPL[f.mode]:(f.mode==='banned'?'منع تكرار المواقع':'السماح بتكرار المواقع ('+DUPL[f.mode]+')'),run:f=>{if(f.id){const l=locById(f.id);if(l)l.dup=f.mode;}else state.dup.mode=f.mode;}},
dupPeople:{label:()=>'السماح لنفس العضو بأكثر من زيارة',run:()=>{state.dup.people='any';}},
visits:{label:f=>'ضبط الزيارات على '+ar(f.n),run:f=>{state.visitsWanted=f.n;}},
conflictSoft:{label:f=>'جعل قاعدة التعارض مرنة',run:f=>{const r=state.conflicts.find(x=>x.id===f.id);if(r)r.hard=false;}},
conflictOff:{label:f=>'إيقاف قاعدة التعارض',run:f=>{const r=state.conflicts.find(x=>x.id===f.id);if(r)r.on=false;}},
pairSoft:{label:()=>'جعل قواعد الاقتران مرنة',run:()=>{state.pairs.mode='soft';}},
locCapClear:{label:f=>'إزالة الحد الأسبوعي لـ'+locName(f.id),run:f=>{const l=locById(f.id);if(l)l.maxWeek=0;}},
locGenderOff:{label:f=>'إيقاف الخلط النوعي في '+locName(f.id),run:f=>{const l=locById(f.id);if(l)l.genderRule=false;}},
locOnlyClear:{label:f=>'إزالة تقييد المؤهلين عن '+locName(f.id),run:f=>{const l=locById(f.id);if(l){l.only=[];l.ban=[];}}},
locSeatsFit:{label:f=>'ملاءمة مقاعد '+locName(f.id)+' للمؤهلين',run:f=>{
const l=locById(f.id);if(!l)return;
const sh=shapeOf(l),av={1:0,2:0};
for(const m of state.members)if(eligibleFor(m,l))av[m.pool]++;
const s={1:Math.min(sh[1],av[1]),2:Math.min(sh[2],av[2])};
l.seats=seatsDiffer(l,s)?s:null;
}},
dayMax:{label:f=>'رفع الحد اليومي إلى '+ar(f.n),run:f=>{state.cap.dayMax=f.n;}},
locSeatsSet:{label:f=>'مقاعد '+locName(f.id)+' ('+poolName(f.pool)+'): '+ar(f.n),run:f=>{
const l=locById(f.id);if(!l)return;
const sh=shapeOf(l),s={1:sh[1],2:sh[2]};
s[f.pool]=f.n;
l.seats=seatsDiffer(l,s)?s:null;
}},
locOpenDay:{label:f=>'فتح '+locName(f.id)+' يوم '+DAYS[f.day],run:f=>{const l=locById(f.id);if(l)l.closed=l.closed.filter(d=>d!==f.day);}},
locEligClear:{label:f=>'إزالة قيود المؤهلين عن '+locName(f.id),run:f=>{const l=locById(f.id);if(!l)return;if(f.mode!=='ban')l.only=[];if(f.mode!=='only')l.ban=[];}},
gmaxSet:{label:f=>'رفع الحد العام لزيارات الأعضاء إلى '+ar(f.n),run:f=>{state.gmaxOn=true;state.gmax=f.n;}},
multi:{label:f=>'تطبيق '+ar(f.fixes.length)+' تعديلات معًا',run:f=>{for(const x of f.fixes)FIX[x.op].run(x);}},
memberAdd:{label:f=>'إضافة عضو '+(f.pool===1?'سريري':'إداري'),run:f=>{
const ids=[100,...state.members.map(m=>m.id),...state.locations.map(l=>l.id),...state.goals.map(g=>g.id),...state.conflicts.map(r=>r.id)];
const n=state.members.filter(m=>m.pool===f.pool).length+1;
state.members.push({id:Math.max(...ids)+1,name:(f.pool===1?'سريري ':'إداري ')+ar(n),pool:f.pool,gender:'M',off:[],pref:'',types:'any',prefDays:[],vmode:'auto',vmin:0,vmax:0});
}},
};
const DUPL={banned:'ممنوع',separate:'منفصل',merged:'مدموج'};
const locName=id=>{const l=locById(id);return l?l.name:'؟';};
const goalNameById=id=>{const g=state.goals.find(x=>x.id===id);return g?goalLabel(g):'الهدف';};
const fixLabel=f=>FIX[f.op].label(f);
function memberRestImpact(m,wd){
if(m.rest&&m.rest.rest===0)return null;
const rule=ruleOf(m);
if(rule.rest===0)return null;
const av=wd.filter(d=>!m.off.includes(d));
if(!m.off.length||av.length<1)return null;
const ruled=maxVisitDays(m,wd);
const full=maxVisitDays({off:[],rest:m.rest},wd);
if(ruled>=full||ruled>=av.length)return null;
const consecutive=av.length>=2&&av.every((d,i)=>i===0||dayPos(d)-dayPos(av[i-1])===1);
return{ruled,full,free:av.length,av,consecutive};
}
const visitsAcc=n=>n===1?'زيارة واحدة':n===2?'زيارتين':n<11?ar(n)+' زيارات':ar(n)+' زيارة';
function memberRestNote(m){
const wd=workingDays();
const r=memberRestImpact(m,wd);
if(!r)return null;
const days=r.av.map(d=>DAY_SHORT[d]).join('، ');
const text=r.consecutive
?'متاح '+(r.av.length===2?'يومين متتاليين فقط':ar(r.av.length)+' أيام متتالية فقط')+' ('+days+') — نمط الراحة يسمح له ب'+visitsAcc(r.ruled)+' بدل '+visitsAcc(r.av.length)
:'أيامه المتاحة ('+days+') مع نمط الراحة تسمح ب'+visitsAcc(r.ruled)+' فقط بدل '+visitsAcc(r.full)+' المعتادة';
return{text,fix:{op:'memberExempt',id:m.id},r};
}
function advise(M){
const out=[];
const add=(level,id,text,fixes)=>out.push({level,id,text,fixes:fixes||[]});
const wd=workingDays();
if(!state.members.length||!state.locations.length||!wd.length)return out;
const G=compileGoals();
for(const g of state.goals){
if(!g.on)continue;
const iss=G.issues.get(g.id);
if(iss&&iss.length)add('error','goal'+g.id,goalLabel(g)+': '+iss[0],[{op:'goalOff',id:g.id}]);
}
const sp=effSplit(G.list);
for(const s of compileMembers(expectedSeats(sp)).issues.slice(0,3))add('warn','budget'+s,s,[]);
for(const m of state.members){
const note=memberRestNote(m);
const mn=memberMin(m),ruled=maxVisitDays(m,wd);
if(note){
const exemptMax=wd.filter(d=>!m.off.includes(d)).length;
const level=mn>ruled&&mn<=exemptMax?'warn':'info';
add(level,'rest'+m.id,m.name+': '+note.text,[note.fix]);
}else if(mn>ruled){
const exemptMax=wd.filter(d=>!m.off.includes(d)).length;
if(mn<=exemptMax&&!(m.rest&&m.rest.rest===0))add('warn','restmin'+m.id,m.name+': الحد الأدنى ('+ar(mn)+') أكبر مما تسمح به قاعدة الراحة ('+ar(ruled)+')',[{op:'memberExempt',id:m.id}]);
}
}
for(const l of state.locations){
const sh=shapeOf(l);
if(shapeSize(sh)<1){add('error','noseat'+l.id,l.name+': بلا مقاعد',[]);continue;}
const av={1:0,2:0};
for(const m of state.members)if(eligibleFor(m,l))av[m.pool]++;
if(av[1]<sh[1]||av[2]<sh[2])add('error','elig'+l.id,l.name+': المؤهلون ('+ar(av[1])+' سريري، '+ar(av[2])+' إداري) لا يغطون المقاعد المطلوبة',[{op:'locSeatsFit',id:l.id},...((l.only&&l.only.length)||(l.ban&&l.ban.length)?[{op:'locOnlyClear',id:l.id}]:[])]);
}
if(M){
for(const d of wd){
const open=state.locations.filter(l=>!closedOn(l,d)&&(M.elig(l,d)[1]>=shapeOf(l)[1]&&M.elig(l,d)[2]>=shapeOf(l)[2]));
if(!open.length){
const offs=state.members.filter(m=>m.off.includes(d));
add(state.useAllDays?'error':'info','day'+d,'يوم '+DAYS[d]+': لا يمكن تكوين أي زيارة (المتاحون لا يغطون مقاعد أي موقع)',offs.slice(0,2).map(m=>({op:'memberOffClear',id:m.id,day:d})));
}
}
}
const dp=diagnosePairs(M||compileModel());
for(const s of dp)add('warn','pairs'+s,s,[{op:'pairSoft'}]);
const rank={error:0,warn:1,info:2};
out.sort((a,b)=>rank[a.level]-rank[b.level]);
return out;
}

function diagnosePairs(M){
const P=M.pairs,out=[];
if(!P.on||!P.hard)return out;
const blocked=(a,b)=>P.avoid.get(a)&&P.avoid.get(a).has(b);
const hasPair=(pool,d)=>{
const c=M.members.filter(m=>m.pool===pool&&!m.off.includes(d));
for(let i=0;i<c.length-1;i++)for(let j=i+1;j<c.length;j++)if(!blocked(c[i].id,c[j].id))return true;
return false;
};
for(const d of M.days)if(!hasPair(1,d)){out.push('«ليس مع» تمنع ثنائيًا سريريًا يوم '+DAYS[d]);break;}
if(M.mains.some(l=>shapeOf(l)[2]>=2))for(const d of M.days)if(!hasPair(2,d)){out.push('«ليس مع» تمنع ثنائيًا إداريًا يوم '+DAYS[d]);break;}
return out;
}

function saveObject(){
return{
v:2,rest:state.rest,restCalendar:state.restCalendar,days:state.days,members:state.members,locations:state.locations,
visits:state.visitsWanted,ratioIdx:state.ratioIdx,useAllDays:state.useAllDays,
bulk:state.bulk,pairs:state.pairs,goals:state.goals,cap:state.cap,dup:state.dup,conflicts:state.conflicts,autoRegen:state.autoRegen,minChanges:state.minChanges,weekStart:state.weekStart,view:state.view,
priority:state.priority,carryWeek:state.carryWeek,history:state.history,gmaxOn:state.gmaxOn,gmax:state.gmax
};
}
function prevWeekKey(){
const t=new Date(state.weekStart+'T00:00:00');
t.setDate(t.getDate()-7);
return isoD(t);
}
function carryPrev(){
const mp=new Map();
if(!state.carryWeek)return mp;
const h=state.history[prevWeekKey()];
if(!h)return mp;
const wd=workingDays();
for(const id of Object.keys(h)){
const out=[];
for(const d of h[id]){
if(state.restCalendar)out.push(d-7);
else{const k=wd.indexOf(d);if(k>=0)out.push(k-wd.length);}
}
if(out.length)mp.set(+id,out);
}
return mp;
}
const nm=id=>{const m=byId(id);return m?m.name:'؟';};

const BIG=1e6;
function slotTeamsMax(M,l,d,sh){
const E=M.elig(l,d);
let k=BIG;
if(sh[1]>0)k=Math.min(k,Math.floor(E[1]/sh[1]));
if(sh[2]>0)k=Math.min(k,Math.floor(E[2]/sh[2]));
return k;
}
function locVisitCap(M,l){
const sh=shapeOf(l);
if(shapeSize(sh)<1)return{vl:0,open:[],mode:M.dup(l)};
const open=M.days.filter(d=>!closedOn(l,d)&&slotTeamsMax(M,l,d,sh)>=1);
const mode=M.dup(l),lm=M.lmax.get(l.id);
if(!open.length)return{vl:0,open,mode};
let vl;
if(mode==='merged'){
let best=0;
for(const d of open)best=Math.max(best,slotTeamsMax(M,l,d,sh));
vl=Math.min(lm,best);
}else if(mode==='banned')vl=Math.min(1,lm,open.length);
else vl=Math.min(lm,open.length);
return{vl,open,mode};
}
function memberCap(M,m){
return Math.min(maxVisitDays(m,M.days),memberMax(m));
}
function flowBound(M,V){
const info=M.locs.map(l=>({l,sh:shapeOf(l),...locVisitCap(M,l)}));
const structMax=info.reduce((s,x)=>s+x.vl,0);
let daySum=0;
for(const d of M.days){
const open=info.filter(x=>x.open.includes(d));
const om=open.filter(x=>x.l.type==='main').length,oc=open.length-om;
const cm=state.cap.mainPerDay,cc=state.cap.conPerDay;
daySum+=Math.min(M.dayMax(d),Math.min(cm,om)+Math.min(cc,oc));
}
let extras=0;
for(const x of info)if(x.mode==='merged'&&x.vl>1)extras+=x.vl-1;
const dayMaxVisits=daySum+extras;
const pools={};
for(const q of[1,2]){
const mem=M.members.filter(m=>m.pool===q);
const S=0,T=1;
let nid2=2;
const locNode=new Map(),slotNode=[],mdNode=new Map(),memNode=new Map(),memDays=new Map();
for(const x of info)if(x.vl>0)locNode.set(x.l.id,nid2++);
for(const x of info)if(x.vl>0)for(const d of x.open)slotNode.push({x,d,id:nid2++});
for(const m of mem){memNode.set(m.id,nid2++);for(const d of M.days)if(!offOn(m,d))mdNode.set(m.id+':'+d,nid2++);}
const F=Dinic(nid2);
for(const x of info){
if(x.vl<=0||x.sh[q]===0)continue;
F.add(S,locNode.get(x.l.id),x.vl*x.sh[q]);
}
for(const s of slotNode){
const {x,d}=s,need=x.sh[q];
if(need===0)continue;
F.add(locNode.get(x.l.id),s.id,x.mode==='merged'?x.vl*need:need);
for(const m of mem){
if(offOn(m,d)||!eligibleFor(m,x.l))continue;
F.add(s.id,mdNode.get(m.id+':'+d),1);
if(!memDays.has(m.id))memDays.set(m.id,new Set());
memDays.get(m.id).add(d);
}
}
for(const m of mem){
for(const d of M.days)if(mdNode.has(m.id+':'+d))F.add(mdNode.get(m.id+':'+d),memNode.get(m.id),1);
const dm=[...(memDays.get(m.id)||[])].sort((a,b)=>a-b);
F.add(memNode.get(m.id),T,Math.min(maxVisitDays(m,dm),memberMax(m)));
}
const have=F.flow(S,T);
const demands=[];
for(const x of info)for(let i=0;i<x.vl;i++)demands.push(x.sh[q]);
demands.sort((a,b)=>a-b);
let k=0,sum=0;
for(const dm of demands){if(sum+dm>have)break;sum+=dm;k++;}
pools[q]={have,kmax:k,demands,members:mem.length};
}
const ub=Math.max(0,Math.min(structMax,dayMaxVisits,pools[1].kmax,pools[2].kmax));
let need=null;
if(V!=null){
need={};
for(const q of[1,2]){
const dm=pools[q].demands;
need[q]=V<=dm.length?dm.slice(0,V).reduce((a,b)=>a+b,0):Infinity;
}
}
return{ub,structMax,dayMaxVisits,pools,need,info};
}
function* combosOf(arr,k){
const n=arr.length,cur=[];
function* rec(s){
if(cur.length===k){yield cur.slice();return;}
for(let i=s;i<=n-(k-cur.length);i++){cur.push(arr[i]);yield* rec(i+1);cur.pop();}
}
yield* rec(0);
}
function solveExact(M,V,o){
o=o||{};
const deadline=o.deadline==null?Infinity:o.deadline;
const days=M.days,goals=M.goals,members=M.members,prev=carryPrev();
const hardC=M.conflicts.filter(c=>c.hard);
const P=M.pairs,pairsHard=P.on&&P.hard;
const minM=members.filter(m=>memberMin(m)>0);
const mdays=new Map(members.map(m=>[m.id,[]])),cnt=new Map(members.map(m=>[m.id,0]));
const visited=new Map(members.map(m=>[m.id,new Map()]));
const locMem=new Map(M.locs.map(l=>[l.id,new Map()]));
const usage=new Map(M.locs.map(l=>[l.id,0]));
const lastDay=new Map();
const goalDone=new Set();
const rows=[];
let visits=0,nodes=0,timedOut=false;
const tick=()=>{if((++nodes&255)===0&&performance.now()>deadline)timedOut=true;return timedOut;};
const dcapStatic=days.map(d=>{
const open=M.locs.filter(l=>shapeSize(shapeOf(l))>0&&!closedOn(l,d));
const om=open.filter(l=>l.type==='main').length,oc=open.length-om;
return Math.min(M.dayMax(d),Math.min(M.cap.main,om)+Math.min(M.cap.con,oc));
});
let mergedExtras=0;
for(const l of M.locs)if(M.dup(l)==='merged')mergedExtras+=Math.max(0,Math.min(M.lmax.get(l.id),members.length)-1);
const suffixCap=new Array(days.length+1).fill(0);
for(let i=days.length-1;i>=0;i--)suffixCap[i]=suffixCap[i+1]+dcapStatic[i];
const memberOK=(m,l,d,unit)=>{
if(offOn(m,d)||!eligibleFor(m,l))return false;
if(mdays.get(m.id).includes(d))return false;
if(unit.excl&&unit.excl.includes(m.id))return false;
const isReq=unit.req&&unit.req.includes(m.id);
if(unit.custom&&unit.custom.allowed&&!unit.custom.allowed.includes(m.id)&&!isReq)return false;
if(cnt.get(m.id)+1>memberMax(m))return false;
if(M.dupPeople==='different'&&locMem.get(l.id).has(m.id))return false;
const rule=ruleOf(m);
if(rule.rest>0){
const base=mdays.get(m.id).concat(prev.get(m.id)||[]);
if(!restOK(base.concat(d),rule))return false;
}
if(hardC.length&&conflictHit(hardC,m,new Set(visited.get(m.id).keys()),l.id))return false;
return true;
};
const futureDays=(m,di)=>{
let k=0;
const rule=ruleOf(m),base=mdays.get(m.id).concat(prev.get(m.id)||[]);
for(let j=di+1;j<days.length;j++){
const d=days[j];
if(offOn(m,d))continue;
if(rule.rest>0&&!restOK(base.concat(d),rule))continue;
k++;
}
return k;
};
function boundOK(di){
const need=V-visits;
if(need<0)return false;
if(need>suffixCap[di+1]+mergedExtras)return false;
for(const g of goals)if(!goalDone.has(g.id)){
let ok=false;
for(let j=di+1;j<days.length&&!ok;j++)if(g.days.includes(days[j])&&!closedOn(g.loc,days[j]))ok=true;
if(!ok)return false;
}
const resid={1:0,2:0};
for(const m of members){
const fd=futureDays(m,di),room=memberMax(m)-cnt.get(m.id);
if(room<0)return false;
const df=memberMin(m)-cnt.get(m.id);
if(df>0&&fd<df)return false;
resid[m.pool]+=Math.min(room,fd);
}
if(need>0){
const dem={1:[],2:[]};
for(const l of M.locs){
const sh=shapeOf(l);
if(shapeSize(sh)<1)continue;
let fut=0;
for(let j=di+1;j<days.length;j++)if(!closedOn(l,days[j]))fut++;
const mode=M.dup(l);
let copies=Math.min(M.lmax.get(l.id)-usage.get(l.id),mode==='merged'?BIG:fut);
if(mode==='banned')copies=Math.min(copies,1-usage.get(l.id));
if(mode==='merged'&&usage.get(l.id)>0)copies=0;
copies=Math.min(Math.max(0,copies),members.length);
for(let i=0;i<copies;i++){dem[1].push(sh[1]);dem[2].push(sh[2]);}
}
if(dem[1].length<need-0&&goals.length===0&&false)return false;
for(const q of[1,2]){
dem[q].sort((a,b)=>a-b);
let s=0;
for(let i=0;i<need&&i<dem[q].length;i++)s+=dem[q][i];
if(dem[q].length<need)return false;
if(s>resid[q])return false;
}
}
return true;
}
function apply(unit,team,sign){
const d=unit.day,l=unit.loc;
if(sign>0){
for(const m of team){
mdays.get(m.id).push(d);cnt.set(m.id,cnt.get(m.id)+1);
const v=visited.get(m.id);v.set(l.id,(v.get(l.id)||0)+1);
const lm=locMem.get(l.id);lm.set(m.id,(lm.get(m.id)||0)+1);
}
usage.set(l.id,usage.get(l.id)+1);visits++;
}else{
for(const m of team){
const a=mdays.get(m.id);a.splice(a.lastIndexOf(d),1);cnt.set(m.id,cnt.get(m.id)-1);
const v=visited.get(m.id),c=v.get(l.id)-1;if(c<=0)v.delete(l.id);else v.set(l.id,c);
const lm=locMem.get(l.id),c2=lm.get(m.id)-1;if(c2<=0)lm.delete(m.id);else lm.set(m.id,c2);
}
usage.set(l.id,usage.get(l.id)-1);visits--;
}
}
const staticSig=new Map();
const unique=new Set();
for(const c of M.conflicts)for(const id of c.ids)unique.add(id);
for(const [a,set] of P.avoid){unique.add(a);for(const b of set)unique.add(b);}
for(const g of goals){for(const id of g.people)unique.add(id);for(const id of g.excl)unique.add(id);if(g.custom&&g.custom.allowed)for(const id of g.custom.allowed)unique.add(id);}
for(const m of members){
staticSig.set(m.id,JSON.stringify([unique.has(m.id)?m.id:0,m.pool,m.gender,[...m.off].sort(),ruleOf(m),memberMin(m),memberMax(m),M.locs.map(l=>eligibleFor(m,l)?1:0).join('')]));
}
function sigKey(m){
const v=[...visited.get(m.id)].sort((a,b)=>a[0]-b[0]);
const lm=M.locs.filter(l=>locMem.get(l.id).has(m.id)).map(l=>l.id);
return staticSig.get(m.id)+JSON.stringify([mdays.get(m.id).slice().sort((a,b)=>a-b),(prev.get(m.id)||[]).slice().sort((a,b)=>a-b),v,lm]);
}
function canonOf(list){
const pos=new Map(),seen=new Map();
for(const m of list){const k=sigKey(m),i=seen.get(k)||0;pos.set(m.id,{k,i});seen.set(k,i+1);}
return combo=>{
const c=new Map(),mx=new Map();
for(const m of combo){
const q=pos.get(m.id);
if(!q)continue;
c.set(q.k,(c.get(q.k)||0)+1);
mx.set(q.k,Math.max(mx.has(q.k)?mx.get(q.k):-1,q.i));
}
for(const [k,n] of c)if(n!==mx.get(k)+1)return false;
return true;
};
}
function* teamsFor(unit,d){
const l=unit.loc;
const req=unit.req||[];
const reqM=req.map(id=>byId(id));
const pool=members.filter(m=>memberOK(m,l,d,unit)&&!req.includes(m.id));
for(const m of reqM)if(!m||!memberOK(m,l,d,unit))return;
const order=(a,b)=>cnt.get(a.id)-cnt.get(b.id)||a.id-b.id;
if(unit.custom){
const need=unit.custom.size-reqM.length;
if(need<0)return;
pool.sort(order);
const canonC=canonOf(pool);
for(const c of combosOf(pool,need)){
if(!canonC(c))continue;
const team=reqM.concat(c);
if(pairsHard&&pairBad(team))continue;
yield team;
}
return;
}
const sh=unit.shape;
const r1=reqM.filter(m=>m.pool===1),r2=reqM.filter(m=>m.pool===2);
if(r1.length>sh[1]||r2.length>sh[2])return;
const c1=pool.filter(m=>m.pool===1).sort(order),c2=pool.filter(m=>m.pool===2).sort(order);
const gen=genderActive(l);
const canon1=canonOf(c1),canon2=canonOf(c2);
for(const a of combosOf(c1,sh[1]-r1.length)){
if(!canon1(a))continue;
for(const b of combosOf(c2,sh[2]-r2.length)){
if(!canon2(b))continue;
const team=reqM.concat(a,b);
if(gen&&!genderOK(team.map(x=>x.gender)))continue;
if(pairsHard&&pairBad(team))continue;
yield team;
}
}
}
function pairBad(team){
for(let i=0;i<team.length-1;i++)for(let j=i+1;j<team.length;j++){
const a=team[i].id,b=team[j].id;
if(P.avoid.get(a)&&P.avoid.get(a).has(b))return true;
}
return false;
}
function unitOptions(l,d){
const opts=[{goal:null}];
for(const g of goals)if(!goalDone.has(g.id)&&g.loc.id===l.id&&g.days.includes(d))opts.push({goal:g});
return opts;
}
function teamRec(units,i,di){
if(timedOut)return false;
if(i===units.length)return dayRec(di+1);
const base=units[i];
for(const op of unitOptions(base.loc,base.day)){
if(tick())return false;
const g=op.goal;
const unit={loc:base.loc,day:base.day,shape:g&&g.custom?{1:0,2:0}:shapeOf(base.loc),req:g?g.people:[],excl:g?g.excl:[],custom:g?g.custom:null,goal:g?g.id:null};
if(!g&&unit.shape[1]+unit.shape[2]<1)continue;
for(const team of teamsFor(unit,base.day)){
if(tick())return false;
apply(unit,team,1);
if(g)goalDone.add(g.id);
rows.push({day:unit.day,loc:unit.loc,team:team.map(m=>m.id),shape:unit.shape,custom:unit.custom?{size:unit.custom.size}:null,goal:unit.goal,req:unit.req||[]});
if(teamRec(units,i+1,di))return true;
rows.pop();
if(g)goalDone.delete(g.id);
apply(unit,team,-1);
if(timedOut)return false;
}
}
return false;
}
function dayRec(di){
if(timedOut)return false;
if(tick())return false;
if(di===days.length){
if(visits!==V||goalDone.size!==goals.length)return false;
for(const m of minM)if(cnt.get(m.id)<memberMin(m))return false;
return true;
}
if(!boundOK(di-1))return false;
const d=days[di];
const cand=M.locs.filter(l=>shapeSize(shapeOf(l))>0||goals.some(g=>g.custom&&g.loc.id===l.id)).filter(l=>!closedOn(l,d));
const need=V-visits,fut=suffixCap[di+1]+mergedExtras;
const minToday=Math.max(M.useAll?1:0,need-fut);
function pick(idx,chosen,trips,mains,cons,vis){
if(timedOut)return false;
if(idx===cand.length){
if(chosen.length<minToday&&vis<minToday)return false;
if(vis<minToday)return false;
const units=[];
for(const c of chosen)for(let k=0;k<c.k;k++)units.push({loc:c.l,day:d});
if(!units.length)return dayRec(di+1);
const ok=teamRec(units,0,di);
return ok;
}
const l=cand[idx],mode=M.dup(l);
const remainingLocs=cand.length-idx-1;
const maxK=(()=>{
const room=M.lmax.get(l.id)-usage.get(l.id);
if(room<=0)return 0;
if(mode==='banned')return usage.get(l.id)>=1?0:1;
if(mode==='merged')return usage.get(l.id)>0?0:Math.min(room,need-vis);
return 1;
})();
const sh=shapeOf(l);
const tryK=[];
for(let k=Math.min(maxK,need-vis);k>=0;k--)tryK.push(k);
for(const k of tryK){
if(k>0){
if(trips+1>M.dayMax(d))continue;
if(l.type==='main'?mains+1>M.cap.main:cons+1>M.cap.con)continue;
if(vis+k>need)continue;
}
const nt=k>0?trips+1:trips,nm=k>0&&l.type==='main'?mains+1:mains,nc=k>0&&l.type!=='main'?cons+1:cons;
chosen.push({l,k});
const r=pick(idx+1,chosen,nt,nm,nc,vis+k);
chosen.pop();
if(r)return true;
if(timedOut)return false;
}
return false;
}
return pick(0,[],0,0,0,0);
}
const okTop=dayRec(0);
if(okTop)return{status:'feasible',rows:rows.slice(),nodes};
return{status:timedOut?'timeout':'infeasible',nodes};
}
function withSeed(seed,fn){
const keep=rng;
rng=mulberry32(seed>>>0);
try{return fn();}finally{rng=keep;}
}
function solFromRows(rows){
return{
order:rows.map(r=>({day:r.day,loc:r.loc,shape:r.shape,goal:r.goal||undefined,req:r.req&&r.req.length?r.req:undefined,custom:r.custom||null})),
teams:rows.map(r=>r.team.slice()),
missRows:rows.map(()=>[]),violRows:rows.map(()=>[]),cvRows:rows.map(()=>[]),
prefMiss:0,consecViol:0,conflictViol:0
};
}
function planFromRows(M,rows,ref){
return makePlan(M,solFromRows(rows),ref||null);
}
function checkPlan(rows,M){
M=M||compileModel();
const p={rows:rows.map(r=>({...r,loc:r.loc||M.locOf(r.locId),shape:r.shape||shapeOf(r.loc||M.locOf(r.locId))})),prefHit:0,prefTotal:0,pairHit:0,pairTotal:0,dayHit:0,dayTotal:0};
return evaluatePlan(p,M);
}
function probeV(V,o){
o=o||{};
const t0=performance.now();
const deadline=o.deadline==null?Infinity:o.deadline;
const keepV=state.visits;
let M;
try{
state.visits=V;
M=compileModel();
}finally{state.visits=keepV;resetCaches();}
if(M.splits.length&&!o.skipQuick){
const quickEnd=Math.min(deadline,t0+(o.quickMs==null?60:o.quickMs));
const found=withSeed(o.seed==null?20241028:o.seed,()=>{
let n=0;
while(performance.now()<quickEnd&&n<400){
n++;
const slots=buildSlots(M,null,n);
if(!slots)continue;
const sol=solveTeams(M,slots,{soft:new Set()});
if(!sol)continue;
const pl=makePlan(M,sol,null);
if(pl.eval.hardCount===0)return pl;
}
return null;
});
if(found)return{status:'feasible',plan:found,M,how:'search'};
}
const r=solveExact(M,V,{deadline});
if(r.status==='feasible'){
const pl=planFromRows(M,r.rows,null);
return{status:'feasible',plan:pl,M,how:'exact',nodes:r.nodes};
}
return{status:r.status==='timeout'?'timeout':'infeasible',M,nodes:r.nodes};
}
const capCache=new Map();
function capKey(o){
return JSON.stringify([saveObject(),[...RX].sort(),[...RXSKIP].sort(),[...RXEX].sort(),o.timeBudgetMs||0]);
}
function capacityInfo(o){
o=o||{};
const key=capKey(o);
if(!o.noCache&&capCache.has(key))return capCache.get(key);
resetCaches();
const M0=compileModel();
const fb=flowBound(M0);
const g=M0.goals.length;
const res={ub:fb.ub,struct:fb.structMax,capacity:0,exact:true,tries:[],fb,plan:null,how:null};
if(!M0.locs.length||!M0.days.length||!M0.members.length){
if(!o.noCache)capCache.set(key,res);
return res;
}
const t0=performance.now(),budget=o.timeBudgetMs==null?900:o.timeBudgetMs,end=t0+budget;
const lo=Math.max(g,1);
for(let V=fb.ub;V>=lo;V--){
const left=end-performance.now(),steps=V-lo+1;
const slice=Math.max(40,left*(V===fb.ub?0.75:0.5));
const r=probeV(V,{deadline:performance.now()+slice,quickMs:Math.min(80,slice*0.4),seed:o.seed});
if(r.status==='feasible'){res.capacity=V;res.plan=r.plan;res.how=r.how;break;}
res.tries.push({V,status:r.status});
if(r.status==='timeout'){res.exact=false;}
if(performance.now()>end){res.exact=false;break;}
}
if(res.capacity===0&&res.tries.length&&res.tries.every(t=>t.status==='infeasible'))res.exact=true;
if(!o.noCache){
if(capCache.size>60)capCache.clear();
capCache.set(key,res);
}
return res;
}
function capacity(o){
const r=capacityInfo(o);
return{capacity:r.capacity,exact:r.exact,ub:r.ub,structMax:r.struct,label:r.exact?'exact':'atLeast'};
}
const FAMILIES=[
{k:'dupPeople',on:()=>state.dup.people!=='any',fixes:()=>[{op:'dupPeople'}]},
{k:'members',on:()=>state.gmaxOn||state.members.some(m=>m.vmode==='exact'||m.vmode==='range'),fixes:()=>[...(state.gmaxOn?[{op:'gmaxOff'}]:[]),...state.members.filter(m=>m.vmode==='exact'||m.vmode==='range').map(m=>({op:'membersAuto',id:m.id}))]},
{k:'dup',on:()=>state.locations.some(l=>dupModeOf(l)==='banned'),fixes:()=>[{op:'dupMode',mode:'separate'},{op:'dupMode',mode:'merged'}]},
{k:'loc',on:()=>state.locations.some(l=>l.maxWeek>0),fixes:()=>state.locations.filter(l=>l.maxWeek>0).map(l=>({op:'locCapClear',id:l.id}))},
{k:'rest',on:()=>true,fixes:()=>{
const cands=state.members.filter(m=>m.off.length&&!(m.rest&&m.rest.rest===0)).sort((a,b)=>b.off.length-a.off.length).map(m=>({op:'memberExempt',id:m.id}));
return[...cands,{op:'restPreset',k:'12'},{op:'restPreset',k:'01'}];
}},
{k:'daycap',on:()=>true,fixes:()=>[{op:'dayMax',n:globalDayMax()+1}]},
{k:'gender',on:()=>state.locations.some(l=>l.genderRule),fixes:()=>state.locations.filter(l=>l.genderRule).map(l=>({op:'locGenderOff',id:l.id}))},
{k:'pairs',on:()=>state.pairs.enabled&&state.pairs.mode==='hard',fixes:()=>[{op:'pairSoft'}]},
{k:'conflicts',on:()=>state.conflicts.some(r=>r.on&&r.hard!==false),fixes:()=>state.conflicts.filter(r=>r.on).map(r=>({op:'conflictSoft',id:r.id}))},
{k:'elig',on:()=>state.locations.some(l=>(l.only&&l.only.length)||(l.ban&&l.ban.length)),fixes:()=>state.locations.filter(l=>(l.only&&l.only.length)||(l.ban&&l.ban.length)).map(l=>({op:'locEligClear',id:l.id}))},
{k:'types',on:()=>state.members.some(m=>m.types&&m.types!=='any'),fixes:()=>[]},
{k:'closed',on:()=>state.locations.some(l=>l.closed.length),fixes:()=>[]},
{k:'offdays',on:()=>state.members.some(m=>m.off.length),fixes:()=>state.members.filter(m=>m.off.length).map(m=>({op:'memberOffClear',id:m.id,day:m.off[0]}))},
{k:'goals',on:()=>state.goals.some(g=>g.on),fixes:()=>state.goals.filter(g=>g.on).map(g=>({op:'goalOff',id:g.id}))}
];
const FAM_TEXT={
dupPeople:'«زيارة واحدة فقط لكل عضو في الأسبوع» مفعّلة',
members:'حدود زيارات الأعضاء',
dup:'منع تكرار المواقع',
loc:'الحدود الأسبوعية للمواقع',
rest:'نمط الراحة',
daycap:'الحد اليومي للزيارات',
gender:'قاعدة الخلط النوعي',
pairs:'قواعد «ليس مع» الصارمة',
conflicts:'قواعد التعارض بين المواقع',
elig:'تقييد المؤهلين في المواقع',
types:'أنواع المواقع المسموحة للأعضاء',
closed:'أيام إغلاق المواقع',
offdays:'إجازات الأعضاء',
goals:'الأهداف'
};
function cloneEngine(){
const saved=JSON.parse(JSON.stringify(saveObject()));
const E2=createFromSaved(saved,{seed:opts.seed});
return E2;
}
function probeFix(fix,V,ms){
const E2=cloneEngine();
const d=E2.FIX[fix.op];
if(!d)return false;
d.run(fix);
E2.state.visitsWanted=V;E2.state.visits=V;
return E2.capacityInfo({timeBudgetMs:ms==null?200:ms,noCache:true}).capacity>=V;
}
function verifyFixes(cands,V,ms,famOk){
const good=[];
let probes=0;
for(const fx of cands){
if(good.length>=3||probes>=10)break;
probes++;
if(probeFix(fx,V,ms))good.push(fx);
}
if(!good.length&&famOk&&cands.length>1&&probes<12){
const multi={op:'multi',fixes:cands};
if(probeFix(multi,V,ms))good.push(multi);
}
return good;
}
function explain(o){
o=o||{};
const V=o.visits!=null?o.visits:state.visitsWanted;
const ms=o.timeBudgetMs==null?900:o.timeBudgetMs;
const base=capacityInfo({timeBudgetMs:ms});
const out={requested:V,capacity:base.capacity,exact:base.exact,ub:base.ub,findings:[]};
if(base.capacity>=V)return out;
const M=compileModel();
const fb=flowBound(M,V);
const fams=FAMILIES.filter(f=>f.on());
const gained=new Map();
for(const f of fams){
const c=withRelax([f.k],()=>capacityInfo({timeBudgetMs:Math.max(120,ms/4),noCache:true}).capacity);
gained.set(f.k,c);
}
const names={1:'السريريون',2:'الإداريون'};
const reasonFams=q=>fams.filter(f=>{
const hv=withRelax([f.k],()=>flowBound(compileModel(),V).pools[q].have);
return hv>=fb.need[q];
}).map(f=>f.k);
for(const q of[1,2]){
if(!(fb.need[q]>fb.pools[q].have))continue;
const rs=reasonFams(q);
const fixes=[];
const pms=Math.max(120,ms/6);
for(const k of rs){const f=fams.find(x=>x.k===k);for(const fx of verifyFixes(f.fixes(),V,pms,true))fixes.push(fx);}
const seatFix=[];
for(const l of state.locations){
const sh=shapeOf(l);
if(sh[q]>=2){
const fx={op:'locSeatsSet',id:l.id,pool:q,n:sh[q]-1};
if(probeFix(fx,V,Math.max(120,ms/6)))seatFix.push(fx);
}
}
fixes.push(...seatFix.slice(0,2));
if(probeFix({op:'memberAdd',pool:q},V,pms))fixes.push({op:'memberAdd',pool:q});
const because=rs.length?' لأن '+FAM_TEXT[rs[0]]:'';
out.findings.push({
family:'seats',pool:q,
numbers:{pool:q,need:fb.need[q],have:fb.pools[q].have},
text:names[q]+': '+ar(fb.need[q])+' مقاعد مطلوبة و'+ar(fb.pools[q].have)+' متاحة'+because,
reasons:rs,fixes,cap:null
});
}
if(V>fb.structMax)out.findings.push({family:'struct',numbers:{need:V,have:fb.structMax},text:'أقصى عدد زيارات ممكنة بسياسة التكرار والأيام المفتوحة هو '+ar(fb.structMax),fixes:verifyFixes(fams.some(f=>f.k==='dup')?[{op:'dupMode',mode:'separate'}]:[],V,Math.max(120,ms/6),false),cap:null});
if(V>fb.dayMaxVisits)out.findings.push({family:'daycap',numbers:{need:V,have:fb.dayMaxVisits},text:'الحد اليومي يسمح بـ '+ar(fb.dayMaxVisits)+' زيارات فقط',fixes:verifyFixes([{op:'dayMax',n:globalDayMax()+1}],V,Math.max(120,ms/6),false),cap:null});
for(const f of fams){
const c=gained.get(f.k);
if(c>=V&&!out.findings.some(x=>x.reasons&&x.reasons.includes(f.k)&&x.family==='seats')){
const fixes=verifyFixes(f.fixes(),V,Math.max(120,ms/6),true);
out.findings.push({family:f.k,numbers:{need:V,have:base.capacity},text:FAM_TEXT[f.k]+' تحدّ من الزيارات',fixes,cap:c});
}
}
const rank=['dupPeople','seats','struct','members','dup','loc','rest','daycap','gender','pairs','conflicts','elig','types','closed','offdays','goals'];
out.findings.sort((a,b)=>rank.indexOf(a.family)-rank.indexOf(b.family));
for(const f of out.findings)f.fixes=f.fixes.filter((x,i,a)=>a.findIndex(y=>JSON.stringify(y)===JSON.stringify(x))===i).map(x=>{const y={...x};delete y._fam;return y;});
const withFix=out.findings.filter(f=>f.fixes.length);
if(withFix.length)out.findings=withFix;
out.gained=Object.fromEntries(gained);
return out;
}

function improvePlan(M,plan,o){
o=o||{};
const iters=o.iters==null?160:o.iters;
let best=plan;
best.score=scorePlan(best);
for(let it=0;it<iters;it++){
const rows=best.rows;
if(rows.length<2)break;
const i=Math.floor(rng()*rows.length),j=Math.floor(rng()*rows.length);
if(i===j)continue;
let nr;
if(rng()<0.7){
const a=rows[i].team[Math.floor(rng()*rows[i].team.length)],b=rows[j].team[Math.floor(rng()*rows[j].team.length)];
if(a==null||b==null||a===b||rows[j].team.includes(a)||rows[i].team.includes(b))continue;
if(byId(a).pool!==byId(b).pool)continue;
nr=rows.map((r,k)=>k===i?{...r,team:r.team.map(x=>x===a?b:x)}:k===j?{...r,team:r.team.map(x=>x===b?a:x)}:r);
}else{
if(rows[i].day===rows[j].day)continue;
nr=rows.map((r,k)=>k===i?{...r,day:rows[j].day}:k===j?{...r,day:rows[i].day}:r);
}
if(checkPlan(nr,M).hardCount)continue;
const cand=planFromRows(M,nr,o.ref||null);
cand.score=scorePlan(cand);
if(comparePlans(cand,best)<0)best=cand;
}
return best;
}
function emptyReason(){
if(!state.members.length)return'لا يوجد أعضاء. أضف أعضاء أولًا.';
if(!state.locations.length)return'لا توجد مواقع. أضف مواقع أولًا.';
if(!state.days.some(d=>d.on))return'لا توجد أيام عمل مفعّلة.';
if(state.locations.every(l=>shapeSize(shapeOf(l))<1))return'كل المواقع بلا مقاعد.';
if(state.locations.every(l=>workingDays().every(d=>closedOn(l,d))))return'كل المواقع مغلقة في كل أيام العمل.';
return null;
}
function whyUnplaced(M,l,fb){
const sh=shapeOf(l);
const out=[];
if(shapeSize(sh)<1)return['لا مقاعد في هذا الموقع'];
const open=M.days.filter(d=>!closedOn(l,d));
if(!open.length)return['مغلق في كل أيام العمل'];
let bestC=0,bestA=0;
for(const d of open){const e=M.elig(l,d);bestC=Math.max(bestC,e[1]);bestA=Math.max(bestA,e[2]);}
if(bestC<sh[1])out.push('لا يتوفر '+(sh[1]===1?'سريري':ar(sh[1])+' سريريين'));
if(bestA<sh[2])out.push('لا يتوفر '+(sh[2]===1?'إداري':ar(sh[2])+' إداريين'));
if(fb&&fb.need)for(const q of[1,2])if(fb.need[q]>fb.pools[q].have)out.push((q===1?'السريريون ':'الإداريون ')+ar(fb.pools[q].have)+' ومقاعدهم المطلوبة '+ar(fb.need[q]));
if(!out.length)out.push('لا يتسع له جدول الأعضاء مع باقي القواعد');
return out;
}
function hashPlan(p){return JSON.stringify(p.rows.map(r=>[r.day,r.loc.id,r.team.slice().sort((a,b)=>a-b)]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]));}
function solveNow(o){
o=o||{};
const t0=performance.now();
const total=o.timeBudgetMs==null?1500:o.timeBudgetMs,end=t0+total;
const flex=o.mode==='flex';
const res={status:'search_exhausted',requested:state.visitsWanted,achieved:0,plans:[],unplaced:[],message:null,attempts:0,capacity:null,ub:null};
const er=emptyReason();
if(er){res.status='infeasible_proven';res.message=er;return res;}
const goalsN=compileModel().goals.length;
const V=Math.max(state.visitsWanted,goalsN);
res.requested=V;
const keepV=state.visits;
state.visits=V;
let M,fb;
try{
M=compileModel();
fb=flowBound(M,V);
res.ub=fb.ub;
let usable=[],proven=V>fb.ub;
if(!proven){
const S=createSearch({mode:flex?'flex':'normal',ref:o.ref||null,timeBudgetMs:Math.max(50,Math.min(total*0.6,end-performance.now())),widen:o.widen!==false,attempts:o.attempts});
const slice=22;
while(!S.step(slice)){if(o.onProgress)o.onProgress({attempts:S.attempts,found:S.pool.size});}
res.attempts=S.attempts;
res.firstPlanMs=S.firstAt;
usable=[...S.pool.values()].filter(p=>flex?true:p.eval.hardCount===0);
if(!usable.length&&!flex){
const r=solveExact(M,V,{deadline:end});
if(r.status==='feasible')usable=[planFromRows(M,r.rows,o.ref||null)];
else if(r.status==='infeasible')proven=true;
}
}
if(usable.length){
if(!flex){
const seeds=usable.slice().sort((x,y)=>{x.score=scorePlan(x);y.score=scorePlan(y);return comparePlans(x,y);}).slice(0,3);
const have=new Set(usable.map(hashPlan));
for(const sp of seeds){
const im=improvePlan(M,sp,{iters:o.improveIters==null?160:o.improveIters,ref:o.ref||null});
if(im!==sp&&!have.has(hashPlan(im))){usable.push(im);have.add(hashPlan(im));}
}
}
const pk=pickPlans(usable);
res.plans=pk.picked;
res.achieved=V;
res.status=pk.picked[0].eval.clean?'optimal':'feasible';
return res;
}
res.status=proven?'infeasible_proven':'search_exhausted';
state.visits=keepV;
const ci=capacityInfo({timeBudgetMs:Math.max(300,end-performance.now()),noCache:true});
res.capacity={value:ci.capacity,exact:ci.exact};
if(ci.capacity>0){
state.visits=ci.capacity;
const S2=createSearch({mode:'normal',timeBudgetMs:400,widen:true});
S2.run();
let pl=[...S2.pool.values()].filter(p=>p.eval.hardCount===0);
if(!pl.length&&ci.plan)pl=[ci.plan];
if(pl.length){
const pk=pickPlans(pl);
res.plans=pk.picked;
res.achieved=ci.capacity;
const used=new Set(pk.picked[0].rows.map(r=>r.loc.id));
state.visits=V;
const M2=compileModel();
res.unplaced=state.locations.filter(l=>!used.has(l.id)).slice(0,Math.max(0,V-ci.capacity)).map(l=>({loc:l,reasons:whyUnplaced(M2,l,fb)}));
}
}
return res;
}finally{
state.visits=keepV;
resetCaches();
}
}

function applySaved(d,migrated){
if(Array.isArray(d.days)&&d.days.length===7)state.days=d.days.map(x=>({on:!!x.on,fav:x.fav||'',dist:x.dist||'',max:x.max|0}));
if(Array.isArray(d.members))state.members=d.members;
if(Array.isArray(d.locations))state.locations=d.locations;
if(typeof d.visits==='number'){state.visitsWanted=d.visits;state.visits=d.visits;}
if(typeof d.ratioIdx==='number')state.ratioIdx=d.ratioIdx;
if(typeof d.useAllDays==='boolean')state.useAllDays=d.useAllDays;
if(d.bulk)state.bulk=d.bulk;
if(d.pairs)state.pairs=d.pairs;
if(Array.isArray(d.goals))state.goals=d.goals.filter(g=>g&&typeof g.id==='number').map(g=>{
const days=Array.isArray(g.days)?g.days:(typeof g.day==='number'&&g.day>=0?[g.day]:[]);
return{id:g.id,on:g.on!==false,mode:g.mode==='custom'?'custom':'pool',size:clamp(Math.round(+g.size)||2,1,8),allowed:Array.isArray(g.allowed)?g.allowed:[],loc:g.loc,days:[...new Set(days.filter(x=>Number.isInteger(x)&&x>=0&&x<=6))].sort((a,b)=>a-b),people:Array.isArray(g.people)?g.people:[],exclude:Array.isArray(g.exclude)?g.exclude:[]};
});
if(d.cap)state.cap={mainPerDay:clamp(+d.cap.mainPerDay||2,1,3),conPerDay:clamp(+d.cap.conPerDay||1,1,3),dayMax:clamp(Math.round(+d.cap.dayMax)||0,0,6),even:d.cap.even!==false};
if(d.dup&&typeof d.dup==='object')state.dup={mode:DUP_MODES.includes(d.dup.mode)?d.dup.mode:'separate',people:['different','all'].includes(d.dup.people)?d.dup.people:'any',spread:d.dup.spread==='free'?'free':'avoid'};
else if(['free','avoid','never'].includes(d.locRepeat))state.dup={mode:d.locRepeat==='never'?'banned':'separate',people:'any',spread:d.locRepeat==='free'?'free':'avoid'};
const legacyGender=!d.dup;
state.conflicts=Array.isArray(d.conflicts)?d.conflicts.filter(r=>r&&typeof r.id==='number'&&Array.isArray(r.a)&&Array.isArray(r.b)).map(r=>({id:r.id,on:r.on!==false,a:r.a,b:r.b,scope:['all','pool','members'].includes(r.scope)?r.scope:'all',pool:r.pool===2?2:1,ids:Array.isArray(r.ids)?r.ids:[],hard:r.hard!==false})):[];
if(['balance','prefs','stable'].includes(d.priority))state.priority=d.priority;
if(typeof d.carryWeek==='boolean')state.carryWeek=d.carryWeek;
if(typeof d.gmaxOn==='boolean')state.gmaxOn=d.gmaxOn;
state.gmax=clamp(Math.round(+d.gmax)||2,1,7);
if(d.history&&typeof d.history==='object'){state.history={};for(const k of Object.keys(d.history))if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&d.history[k]&&typeof d.history[k]==='object')state.history[k]=d.history[k];}
const nr=r=>r&&typeof r==='object'?{rest:clamp(Math.round(+r.rest)||0,0,3),maxRun:clamp(Math.round(+r.maxRun)||1,1,3)}:null;
if(d.rest)state.rest=nr(d.rest);
if(typeof d.restCalendar==='boolean')state.restCalendar=d.restCalendar;
if(typeof d.autoRegen==='boolean')state.autoRegen=d.autoRegen;
if(typeof d.minChanges==='boolean')state.minChanges=d.minChanges;
if(typeof d.weekStart==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.weekStart))state.weekStart=d.weekStart;
if(d.view==='day'||d.view==='member')state.view=d.view;
state.members.forEach(m=>{if(!Array.isArray(m.off))m.off=[];if(m.pref==null)m.pref='';m.types=['main','contracted'].includes(m.types)?m.types:'any';m.prefDays=Array.isArray(m.prefDays)?[...new Set(m.prefDays.filter(x=>Number.isInteger(x)&&x>=0&&x<=6))]:[];m.vmode=['exact','range'].includes(m.vmode)?m.vmode:'auto';m.vmin=clamp(Math.round(+m.vmin)||0,0,7);m.vmax=clamp(Math.round(+m.vmax)||0,0,7);if(m.vmode==='exact')m.vmax=m.vmin;else if(m.vmax<m.vmin)m.vmax=m.vmin;m.rest=nr(m.rest);m.restCustom=!!m.rest&&(!!m.restCustom||!presetKey(m.rest));});
state.restCustom=!presetKey(state.rest);
state.locations=state.locations.filter(l=>l&&typeof l.id==='number').map(l=>{
const type=l.type==='contracted'?'contracted':'main';
const seats=l.seats&&typeof l.seats==='object'?{1:clamp(Math.round(+l.seats[1]),0,5),2:clamp(Math.round(+l.seats[2]),0,5)}:null;
const o={...l,type,maxWeek:clamp(l.maxWeek|0,0,5),closed:Array.isArray(l.closed)?[...new Set(l.closed.filter(x=>Number.isInteger(x)&&x>=0&&x<=6))]:[],dup:DUP_MODES.includes(l.dup)?l.dup:null,only:Array.isArray(l.only)?l.only:[],ban:Array.isArray(l.ban)?l.ban:[]};
if(legacyGender&&type==='contracted')o.genderRule=false;
o.seats=seats&&Number.isFinite(seats[1])&&Number.isFinite(seats[2])&&seatsDiffer(o,seats)?seats:null;
return o;
});
state.days.forEach(x=>{x.max=clamp(Math.round(+x.max)||0,0,6);});
if(!Array.isArray(state.pairs.rules))state.pairs.rules=[];
const alive=new Set(state.members.map(m=>m.id));
state.pairs.rules=state.pairs.rules.filter(r=>r&&alive.has(r.a)&&alive.has(r.b));
state.ratioIdx=clamp(state.ratioIdx|0,0,RATIOS.length-1);
}

const FLEX_SOFT=['rest','pairs','conflicts'];
function createSearch(o){
o=o||{};
const mode=o.mode==='flex'?'flex':'normal',flex=mode==='flex';
const M=compileModel();
const sel=o.ref||null;
const refMD=new Set(),refTR=new Set();
if(sel)for(const r of sel.rows)for(const id of r.team){refMD.add(id+':'+r.day);refTR.add(id+':'+r.day+':'+r.loc.id);}
const refSlots=sel?sel.rows.map(r=>({loc:r.loc,day:r.day})):null;
const soft=flex?new Set(FLEX_SOFT):new Set();
const pool=new Map();
const S={M,mode,pool,attempts:0,hasClean:false,finished:false,firstAt:null};
const hardMs=o.timeBudgetMs!=null?o.timeBudgetMs:(flex?2000:1500),softMs=Math.min(560,hardMs),target=30,maxAttempts=o.maxAttempts!=null?o.maxAttempts:9000;
const t0=performance.now();
const fixedN=o.attempts==null?null:o.attempts;
const enough=()=>fixedN==null&&pool.size>=target&&S.hasClean&&performance.now()>t0+softMs;
S.step=function(sliceMs){
if(S.finished)return true;
const c0=performance.now();
while(performance.now()-c0<sliceMs){
S.attempts++;
const info={};
const slots=buildSlots(M,refSlots,S.attempts);
if(slots){
let sol=solveTeams(M,slots,{soft,refMD,refTR,info});
if(!sol&&o.widen!==false&&info.truncated){
sol=solveTeams(M,slots,{soft,refMD,refTR,wide:1,info:{}});
if(!sol)sol=solveTeams(M,slots,{soft,refMD,refTR,wide:2,info:{}});
}
if(sol){
const h=hashSol(sol);
if(!pool.has(h)){
const pl=makePlan(M,sol,sel);
pool.set(h,pl);
if(S.firstAt==null&&pl.eval.hardCount===0)S.firstAt=performance.now()-t0;
if(pl.eval.clean)S.hasClean=true;
}
}
}
if(enough()||(fixedN==null&&performance.now()>t0+hardMs)||S.attempts>=(fixedN==null?maxAttempts:fixedN)){S.finished=true;break;}
}
return S.finished;
};
S.run=function(){while(!S.step(22));return S;};
return S;
}
function pickPlans(all,want){
want=want||6;
all.forEach(p=>p.score=scorePlan(p));
all.sort(comparePlans);
const picked=[all[0]];
const fill=list=>{
let thr=0.34;
while(picked.length<want){
for(const p of list){
if(picked.length>=want)break;
if(!picked.includes(p)&&picked.every(q=>diffPlans(p,q)>=thr))picked.push(p);
}
if(thr<=0)break;
thr=thr>0.04?thr/2:0;
}
};
fill(all.filter(p=>p.eval.clean));
fill(all.filter(p=>!p.eval.clean));
picked.sort(comparePlans);
return{picked,sorted:all};
}

return{state,improvePlan,solveNow,whyUnplaced,emptyReason,Dinic,flowBound,solveExact,probeV,capacityInfo,capacity,explain,checkPlan,planFromRows,withSeed,FAMILIES,cloneEngine,locVisitCap,slotTeamsMax,solFromRows,memberCap,byId,locById,poolName,workingDays,kCombos,pickWeighted,TYPE_SHAPE,DUP_MODES,typeShape,shapeOf,shapeSize,seatsDiffer,dupModeOf,teamCap,globalDayMax,dayMaxOf,eligibleFor,genderOK,genderActive,resetCaches,withRelax,goalDays,locMax,typeCaps,splitRange,splitCandidates,effSplit,compilePairs,compileConflicts,conflictAppliesTo,conflictHit,conflictName,conflictWho,goalLabel,goalIsCustom,customSize,poolWord,seatsFit,compileGoals,goalCounts,expectedSeats,PRESETS,presetKey,ruleText,calOn,ruleOf,memberMin,globalMax,memberMax,maxVisitDays,compileMembers,compileModel,dayPos,restOK,winCap,windowSpan,poolWinCap,seqDays,winCtx,windowLoadOK,goalShape,makeBoard,goalDayOK,attachGoals,replaySlots,pickSplit,placeGoals,strictChance,buildSlots,solveTeams,hashSol,triples,diffPlans,makePlan,evaluatePlan,WEIGHTS,scorePlan,rankTuple,comparePlans,FIX,DUPL,locName,goalNameById,fixLabel,memberRestImpact,visitsAcc,memberRestNote,advise,diagnosePairs,saveObject,prevWeekKey,carryPrev,nm,applySaved,createSearch,pickPlans,FLEX_SOFT,reseed,shuffled,rand};
}

function solve(input,o){
o=o||{};
const saved=JSON.parse(JSON.stringify(input));
if(o.visitsWanted!=null)saved.visits=o.visitsWanted;
const E=createFromSaved(saved,{seed:o.seed});
E.reseed(o.seed==null?1:o.seed);
return E.solveNow(o);
}
function createFromSaved(saved,opts){
const st=baseState();
const E=createEngine(st,opts);
E.applySaved(saved,saved&&saved.v===1);
return E;
}
function migrate(saved){
const E=createFromSaved(saved);
return E.saveObject();
}

return{solve,DAYS,DAY_SHORT,THU,DISTL,RATIOS,ar,clamp,mulberry32,isoD,baseState,createEngine,createFromSaved,migrate};
});
