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
const c=E.capacityInfo({timeBudgetMs:m.opts&&m.opts.timeBudgetMs});
root.postMessage({id:m.id,type:'done',r:{requested:c.requested,achievable:c.capacity,exact:c.exact}});
}
}catch(e){root.postMessage({id:m.id,type:'error',e:String(e&&e.message||e)});}
};
}
})(typeof self!=='undefined'?self:this,function(){
const DAYS=['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
const DAY_SHORT=['سبت','أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة'];
const THU=5;
const DISTL={near:'قريب',mid:'متوسط',far:'بعيد'};
const LIM={plans:[1,10],ratio:[1,6],fairSpread:[0,6],fairMin:[0,4],minGap:[0,6],needMin:[1,6],genderMin:[1,4],perDay:[1,6],dayMax:[0,10],dayCfgMax:[0,10],maxWeek:[0,7],seats:[0,8],customSize:[1,10],gmax:[1,7]};
const AR='٠١٢٣٤٥٦٧٨٩';
let LATIN=false;
const ar=n=>LATIN?String(n):String(n).replace(/\d/g,d=>AR[+d]);
const SOLVER_MS={fast:800,normal:1500,thorough:4000};
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
extraVisits:0,oneVisitPerMember:false,migrationNote:null,bulk:{main:3,cont:1},minChanges:true,useAllDays:false,autoRegen:true,priority:'balance',carryWeek:false,history:{},historyWd:{},weekOverrides:{},gender:{mode:'legacy4',ratio:{a:3,b:1},min:1},dayRules:[],fair:{maxSpread:0,minEach:0,mode:'soft'},solver:{budget:'normal',plans:6,defaultFlex:false,lockSeed:false,seed:1},digits:'arabic',gmaxOn:false,gmax:2,rest:{rest:1,maxRun:1},restCalendar:true,restCustom:false,view:'day',weekStart:'2026-01-03',
cap:{mainPerDay:2,conPerDay:1,dayMax:0,even:true},
dup:{spread:'avoid'},
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
const weekOv=()=>{const m=state.weekOverrides;return m?m[state.weekStart]||null:null;};
const holidayOn=d=>{const o=weekOv();return!!(o&&o.holidays&&o.holidays.includes(d));};
const dayOn=d=>!!state.days[d]&&state.days[d].on&&!holidayOn(d);
const weekOffDays=id=>{const o=weekOv();return(o&&o.memberOff&&o.memberOff[id])||[];};
const weekClosedDays=id=>{const o=weekOv();return(o&&o.locClosed&&o.locClosed[id])||[];};
const workingDays=()=>state.days.map((d,i)=>dayOn(i)?i:-1).filter(i=>i>=0);


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
const capMain=()=>state.cap.mainPerDay+(RX.has('daycap')?1:0);
const capCon=()=>state.cap.conPerDay+(RX.has('daycap')?1:0);
const capOf=l=>(l.visits|0)+(l.maxExtra|0);
const repMergedOf=l=>!!(l.repeat&&l.repeat.days==='same');
const repDiffOf=l=>!RX.has('repPeople')&&!!(l.repeat&&l.repeat.people==='different');
const teamCap=()=>({c:state.members.filter(m=>m.pool===1).length,a:state.members.filter(m=>m.pool===2).length});
const globalDayMax=()=>state.cap.dayMax>0?state.cap.dayMax:state.cap.mainPerDay+state.cap.conPerDay;
const dayMaxOf=d=>{const v=state.days[d].max,b=v>0?v:globalDayMax();return RX.has('daycap')?b+1:b;};
function eligibleFor(m,l){
if(!RX.has('types')&&m.types&&m.types!=='any'&&m.types!==l.type)return false;
if(!RX.has('elig')){
if(l.ban&&l.ban.includes(m.id))return false;
if(l.only&&l.only.length&&!l.only.includes(m.id)){const al=aliveIds();if(l.only.some(id=>al.has(id)))return false;}
}
return true;
}
const GENDER_MODES=['off','mixed','legacy4','minF','minM'];
function genderCfgOf(l){
const g=state.gender||{};
const mode=l&&GENDER_MODES.includes(l.genderMode)?l.genderMode:(GENDER_MODES.includes(g.mode)?g.mode:'legacy4');
const r=g.ratio||{};
return{mode,a:r.a>=1?r.a:3,b:r.b>=1?r.b:1,min:g.min>=1?g.min:1};
}
function genderOK(genders,cfg){
const n=genders.length;
if(n<2)return true;
const c=cfg||genderCfgOf(null);
const men=genders.filter(x=>x==='M').length,wom=n-men;
if(c.mode==='off')return true;
if(c.mode==='minF')return wom>=Math.min(c.min,n);
if(c.mode==='minM')return men>=Math.min(c.min,n);
if(c.mode==='legacy4'&&n===c.a+c.b)return men===c.a||men===c.b;
return men>=1&&wom>=1;
}
const genderActive=l=>!!l.genderRule&&!RX.has('gender')&&genderCfgOf(l).mode!=='off';
let _winCtx=null,_pos=null,_aliveRef=null,_aliveN=-1,_aliveSet=null,RX=new Set(),RXSKIP=new Set(),RXEX=new Set();
function aliveIds(){
if(_aliveRef!==state.members||_aliveN!==state.members.length){_aliveRef=state.members;_aliveN=state.members.length;_aliveSet=new Set(state.members.map(m=>m.id));}
return _aliveSet;
}
function nextId(){
const ids=[100,...state.members.map(m=>m.id),...state.locations.map(l=>l.id),...state.goals.map(g=>g.id),...state.conflicts.map(r=>r.id),...(state.dayRules||[]).map(r=>r.id),...(state.pairs&&Array.isArray(state.pairs.rules)?state.pairs.rules.map(r=>r.id):[])].filter(Number.isFinite);
return Math.max(...ids)+1;
}
const closedOn=(l,d)=>!RX.has('closed')&&(l.closed.includes(d)||weekClosedDays(l.id).includes(d)||(!!l.allowedDays&&l.allowedDays.length>0&&!l.allowedDays.includes(d)));
const gapOf=l=>RX.has('dayRules')?0:(l.minGap||0);
const offOn=(m,d)=>!RX.has('offdays')&&(m.off.includes(d)||weekOffDays(m.id).includes(d));
function resetCaches(){_winCtx=null;_pos=null;_aliveRef=null;}
function withRelax(fams,fn,more){
const prev=[RX,RXSKIP,RXEX];
more=more||{};
RX=new Set(fams);RXSKIP=new Set(more.skip||[]);RXEX=new Set(more.exempt||[]);resetCaches();
try{return fn();}
finally{[RX,RXSKIP,RXEX]=prev;resetCaches();}
}
function goalDays(g){return g.days.length?g.days.filter(d=>dayOn(d)):workingDays();}
function locMax(l,gl){
const n=gl.filter(g=>g.loc.id===l.id).length;
return Math.max(capOf(l),n);
}




function pairRuleHard(r){
if(RX.has('pairs'))return false;
if(r.kind==='must')return true;
if(r.kind!=='avoid')return false;
return r.hard===true||(r.hard!==false&&state.pairs.mode==='hard');
}
function compilePairs(){
const P={on:false,hard:false,hardAny:false,list:[],with:new Map(),avoid:new Map(),avoidHard:new Map(),must:new Map()};
if(!state.pairs.enabled)return P;
const alive=new Set(state.members.map(m=>m.id)),seen=new Set();
const put=(M,a,b)=>{
if(!M.has(a))M.set(a,new Set());M.get(a).add(b);
if(!M.has(b))M.set(b,new Set());M.get(b).add(a);
};
for(const r of state.pairs.rules){
if(r.a===r.b||!alive.has(r.a)||!alive.has(r.b)||RXSKIP.has(r.id))continue;
const k=Math.min(r.a,r.b)+':'+Math.max(r.a,r.b)+':'+r.kind;
if(seen.has(k))continue;seen.add(k);
const hard=pairRuleHard(r);
put(r.kind==='avoid'?P.avoid:P.with,r.a,r.b);
if(r.kind==='avoid'&&hard)put(P.avoidHard,r.a,r.b);
if(r.kind==='must'&&hard)put(P.must,r.a,r.b);
P.list.push({a:r.a,b:r.b,kind:r.kind,hard});
}
P.on=P.list.length>0;P.hard=P.avoidHard.size>0;P.hardAny=P.hard||P.must.size>0;
return P;
}
function pairTeamOK(P,ids){
if(P.avoidHard.size)for(let i=0;i<ids.length-1;i++){
const s=P.avoidHard.get(ids[i]);
if(s)for(let j=i+1;j<ids.length;j++)if(s.has(ids[j]))return false;
}
if(P.must.size)for(const id of ids){
const s=P.must.get(id);
if(s)for(const o of s)if(!ids.includes(o))return false;
}
return true;
}
const needsActive=l=>!!(l.needs&&l.needs.length)&&!RX.has('tags');
function needsOK(members,l){
for(const n of l.needs){
let c=0;
for(const m of members)if(m&&m.tags&&m.tags.includes(n.tag))c++;
if(c<n.min)return false;
}
return true;
}
function compileDayRules(){
if(RX.has('dayRules'))return[];
const alive=new Set(state.locations.map(l=>l.id));
const out=[];
for(const r of state.dayRules||[]){
if(!r.on||RXSKIP.has(r.id))continue;
const A=new Set(r.a.filter(id=>alive.has(id))),B=new Set(r.b.filter(id=>alive.has(id)));
if(!A.size||!B.size)continue;
out.push({id:r.id,kind:r.kind,A,B});
}
return out;
}
function dayRulesHit(rules,locIds,kinds){
let n=0;
for(const r of rules){
if(kinds&&!kinds.includes(r.kind))continue;
let ha=false,hb=false;
for(const id of locIds){if(r.A.has(id))ha=true;if(r.B.has(id))hb=true;}
if(r.kind==='notSameDay'){if(ha&&hb)n++;}
else if(ha!==hb)n++;
}
return n;
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
const customSize=g=>clamp(Math.round(+g.size)||2,LIM.customSize[0],LIM.customSize[1]);
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
for(const d of g.days)if(!dayOn(d)){add(g,'يوم '+DAYS[d]+' ليس يوم عمل');break;}
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
if(ppl.length&&gd.length&&!gd.some(d=>ppl.every(m=>!offOn(m,d)))){
if(g.days.length===1){for(const m of ppl)if(offOn(m,g.days[0]))add(g,m.name+' في إجازة يوم '+DAYS[g.days[0]]);}
else add(g,'لا يوم عمل يتاح فيه كل الأعضاء المحددين');
}
if(P.on&&P.hard)for(let i=0;i<ppl.length;i++)for(let j=i+1;j<ppl.length;j++)if(P.avoidHard.get(ppl[i].id)&&P.avoidHard.get(ppl[i].id).has(ppl[j].id))add(g,'قاعدة «ليس مع» تمنع '+ppl[i].name+' و'+ppl[j].name);
if(!custom&&genderActive(loc)&&ppl.length===shapeSize(sh)&&shapeSize(sh)>=2&&!genderOK(ppl.map(m=>m.gender),genderCfgOf(loc)))add(g,'تشكيل الفريق يخالف قاعدة الخلط النوعي');
if(!custom&&needsActive(loc)&&ppl.length===shapeSize(sh)&&!needsOK(ppl,loc))add(g,'تشكيل الفريق لا يحقق متطلبات الموقع');
if(P.on&&P.must.size&&ppl.length&&ppl.length===shapeSize(sh)&&!pairTeamOK(P,ppl.map(m=>m.id)))add(g,'قاعدة «دائمًا مع» تخالف تشكيل الفريق');
if(!issues.has(g.id))list.push({id:g.id,loc,days:gd,people,excl:g.exclude.filter(id=>alive.has(id)),custom:custom?{size:customSize(g),allowed}:null});
}
const fixed=list.filter(g=>g.days.length===1);
const gobj=id=>state.goals.find(x=>x.id===id);
for(let i=0;i<fixed.length;i++)for(let j=i+1;j<fixed.length;j++){
const a=fixed[i],b=fixed[j],ga=gobj(a.id),gb=gobj(b.id),da=a.days[0],db=b.days[0];
const shared=a.people.filter(id=>b.people.includes(id));
if(a.loc.id===b.loc.id){
if(repMergedOf(a.loc)){if(da!==db)add(gb,'سياسة «مدموج»: يجب أن يكون مع '+goalLabel(ga)+' في اليوم نفسه');else if(shared.length)add(gb,'يتكرر مع '+goalLabel(ga)+' بنفس الأعضاء');}
else if(da===db)add(gb,'يتكرر مع '+goalLabel(ga)+' في نفس الموقع واليوم');
}
if(a.loc.id===b.loc.id&&shared.length&&repDiffOf(a.loc)&&da!==db)add(gb,byId(shared[0]).name+' محدد في '+goalLabel(ga)+' لنفس الموقع — التكرار يتطلب أعضاء مختلفين');
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
if(gs.length>1&&capOf(l)<gs.length)add(gobj(gs[gs.length-1].id),'تكرار '+l.name+' ممنوع في سياسة التكرار');
if(gs.length>1&&!repMergedOf(l)&&new Set(gs.flatMap(g=>g.days)).size<gs.length)add(gobj(gs[gs.length-1].id),'أيام الأهداف في '+l.name+' لا تكفي');
}
const T=teamCap();
for(const d of workingDays()){
const fx=fixed.filter(g=>g.days[0]===d);
if(!fx.length)continue;
const trips=new Map();
for(const g of fx)trips.set(g.loc.id,g.loc);
const tm=[...trips.values()].filter(l=>l.type==='main').length,tcn=trips.size-tm;
const last=fx[fx.length-1];
if(trips.size>dayMaxOf(d)||tm>capMain()||tcn>capCon()||!seatsFit(fx.filter(g=>!g.custom).map(g=>shapeOf(g.loc)),T))add(gobj(last.id),'أهداف يوم '+DAYS[d]+' تتجاوز الحد اليومي');
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
const fairHard=()=>!!state.fair&&state.fair.mode==='hard'&&!RX.has('fair');
const fairMinEach=()=>fairHard()?state.fair.minEach|0:0;
const fairSpread=()=>fairHard()?state.fair.maxSpread|0:0;
function fairActive(){
const out={1:[],2:[]},wd=workingDays();
for(const m of state.members)if(wd.some(d=>!offOn(m,d))&&state.locations.some(l=>eligibleFor(m,l)))out[m.pool].push(m.id);
return out;
}
function fairExcess(rows,act,spreadMax){
const c=new Map();
for(const r of rows)for(const id of r.team)c.set(id,(c.get(id)||0)+1);
let ex=0;
if(spreadMax>0)for(const q of[1,2]){
const a=act[q];
if(a.length<2)continue;
let hi=-1,lo=Infinity;
for(const id of a){const n=c.get(id)||0;if(n>hi)hi=n;if(n<lo)lo=n;}
if(hi-lo>spreadMax)ex+=hi-lo-spreadMax;
}
return ex;
}
function memberMin(m){return Math.max(RX.has('members')?0:(m.vmode==='exact'||m.vmode==='range'?m.vmin:0),fairMinEach());}
function globalMax(){return state.gmaxOn&&!RX.has('members')?state.gmax:Infinity;}
function memberMax(m){if(RX.has('members'))return Infinity;return Math.min(m.vmode==='exact'?m.vmin:m.vmode==='range'?m.vmax:Infinity,globalMax(),state.oneVisitPerMember&&!RX.has('dupPeople')?1:Infinity);}
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
const lmax=new Map(locs.map(l=>[l.id,locMax(l,goals)]));
const M={
days,dayCfg:state.days,locs,mains:locs.filter(l=>l.type==='main'),cons:locs.filter(l=>l.type==='contracted'),
members:state.members,visits:totalRequested(),useAll:state.useAllDays,even:state.cap.even,
pairs:compilePairs(),conflicts:compileConflicts(),dayRules:compileDayRules(),fairActive:fairActive(),fairSpread:fairSpread(),goals,lmax,
cap:{main:capMain(),con:capCon()},dayMax:dayMaxOf,
dup:l=>repMergedOf(l)?'merged':'separate',dupPeopleOf:repDiffOf,spreadPen:state.dup.spread==='avoid'?4:1.2,
relax:new Set(opts.relax||[])
};
M.locOf=id=>locs.find(l=>l.id===id);
return M;
}

function dayPos(d){
if(d<0)return d;
if(calOn())return d;
if(!_pos){let k=0;_pos=state.days.map((x,i)=>dayOn(i)?k++:null);}
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






const goalShape=g=>g.custom?{1:0,2:0}:shapeOf(g.loc);






const PRIO_RANK={high:0,normal:1,low:2},PRIO_W={high:1.6,normal:1,low:0.55};
const strictChance=n=>n<150?0.8:n<500?0.4:0.12;




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
if(kind!=='with'&&kind!=='must')continue;
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
qualityScore(plan,ref||null);
return plan;
}
function evaluatePlan(p,M){
const rows=p.rows,prev=carryPrev(),P=M.pairs;
const hard={rest:0,pairHard:0,targets:0,goals:0,locCap:0,offDay:0,doubleBook:0,teamShape:0,gender:0,conflict:0,dup:0,dayCap:0,useAll:0,tags:0,pairMust:0,dayNot:0,daySame:0,gap:0,fair:0};
const soft={pairAvoid:0,prefMiss:0,withMiss:0,dayMiss:0,conflictSoft:0};
const days=new Map(),counts=new Map(),lcnt=new Map(),visited=new Map(),perLoc=new Map(),tripsByDay=new Map();
for(const r of rows){
lcnt.set(r.loc.id,(lcnt.get(r.loc.id)||0)+1);
const live=M.locOf(r.loc.id)||r.loc;
if(closedOn(live,r.day))hard.locCap++;
const seen=new Set();
let c1=0,c2=0;
for(const id of r.team){
const m=byId(id);
if(!m||seen.has(id)){hard.teamShape++;continue;}
seen.add(id);
if(m.pool===1)c1++;else c2++;
if(offOn(m,r.day)||!eligibleFor(m,live))hard.offDay++;
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
if(!r.custom&&genderActive(live)&&!genderOK(r.team.map(id=>{const m=byId(id);return m?m.gender:null;}),genderCfgOf(live)))hard.gender++;
if(!r.custom&&needsActive(live)&&!needsOK(r.team.map(id=>byId(id)),live))hard.tags++;
if(P.on)for(const q of P.list){
const ia=r.team.includes(q.a),ib=r.team.includes(q.b);
if(q.kind==='avoid'&&ia&&ib){if(q.hard)hard.pairHard++;else soft.pairAvoid++;}
else if(q.kind==='must'&&q.hard&&ia!==ib)hard.pairMust++;
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
if(!r||r.loc.id!==g.loc.id||!g.days.includes(r.day)||g.people.some(id=>!r.team.includes(id))||g.excl.some(id=>r.team.includes(id))||(g.custom&&(!r.custom||r.team.length!==g.custom.size||(g.custom.allowed&&r.team.some(id=>!g.custom.allowed.includes(id))))))hard.goals++;
}
for(const [id,k] of lcnt){
const mx=M.lmax.get(id);
if(mx!=null&&k>mx)hard.locCap+=k-mx;
}
for(const [id,rs] of perLoc){
if(rs.length<2)continue;
const l=M.locOf(id)||rs[0].loc,mode=M.dup(l);
if(mode==='banned')hard.dup+=rs.length-1;
else if(mode==='merged'){
const ds=new Set(rs.map(r=>r.day));
if(ds.size>1)hard.dup+=ds.size-1;
}
else if(mode==='separate'){
const byDay=new Map();
for(const r of rs)byDay.set(r.day,(byDay.get(r.day)||0)+1);
for(const k of byDay.values())if(k>1)hard.dup+=k-1;
}
if(M.dupPeopleOf(l)){
const who=new Map();
for(const r of rs)for(const m of r.team)who.set(m,(who.get(m)||0)+1);
for(const k of who.values())if(k>1)hard.dup+=k-1;
}
}
if(M.useAll)for(const d of M.days)if(!tripsByDay.has(d))hard.useAll++;
if(M.fairSpread>0)hard.fair+=fairExcess(rows,M.fairActive,M.fairSpread);
if(M.dayRules.length){
const byDay=new Map();
for(const r of rows){if(!byDay.has(r.day))byDay.set(r.day,new Set());byDay.get(r.day).add(r.loc.id);}
for(const d of M.days){
const ids=[...(byDay.get(d)||[])];
hard.dayNot+=dayRulesHit(M.dayRules,ids,['notSameDay']);
hard.daySame+=dayRulesHit(M.dayRules,ids,['sameDay']);
}
}
{
const seenD=new Map();
for(const r of rows){
const l=M.locOf(r.loc.id)||r.loc,g=gapOf(l);
if(g>1&&M.dup(l)!=='merged'){
const a=seenD.get(l.id)||[];
for(const x of a)if(x!==r.day&&Math.abs(x-r.day)<g)hard.gap++;
a.push(r.day);seenD.set(l.id,a);
}
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
const QW={
balance:{loadSpread:10,loadVar:3,backToBack:4,dayImbalance:2,prefMiss:3,dayPrefMiss:2,pairWithMiss:2,pairAvoidHit:8,conflictSoft:8,sameLocSamePerson:3,changeFromPrev:0},
prefs:{loadSpread:6,loadVar:2,backToBack:4,dayImbalance:2,prefMiss:6,dayPrefMiss:4,pairWithMiss:2,pairAvoidHit:8,conflictSoft:8,sameLocSamePerson:3,changeFromPrev:0},
stable:{loadSpread:10,loadVar:3,backToBack:4,dayImbalance:2,prefMiss:3,dayPrefMiss:2,pairWithMiss:2,pairAvoidHit:8,conflictSoft:8,sameLocSamePerson:3,changeFromPrev:6}
};
function qualityTerms(p,ref){
const wd=workingDays().sort((a,b)=>a-b);
const act=fairActive();
const t={loadSpread:0,loadVar:0,backToBack:0,dayImbalance:0,prefMiss:0,dayPrefMiss:0,pairWithMiss:0,pairAvoidHit:0,conflictSoft:0,sameLocSamePerson:0,changeFromPrev:0};
for(const q of[1,2]){
const arr=act[q].map(id=>p.counts.get(id)||0);
if(arr.length<2)continue;
const mx=Math.max(...arr),mn=Math.min(...arr);
t.loadSpread+=mx-mn;
const mean=arr.reduce((a,b)=>a+b,0)/arr.length;
t.loadVar+=arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/arr.length;
}
const daysOf=new Map(),locCount=new Map();
for(const r of p.rows){
for(const id of r.team){
if(!daysOf.has(id))daysOf.set(id,[]);
daysOf.get(id).push(r.day);
const k=id+':'+r.loc.id;
locCount.set(k,(locCount.get(k)||0)+1);
}
}
for(const ds of daysOf.values()){
const pos=ds.map(d=>wd.indexOf(d)).filter(x=>x>=0).sort((a,b)=>a-b);
for(let i=1;i<pos.length;i++)if(pos[i]-pos[i-1]===1)t.backToBack++;
}
for(const c of locCount.values())if(c>1)t.sameLocSamePerson+=c-1;
if(state.cap.even&&wd.length>1){
const trips=wd.map(d=>new Set(p.rows.filter(r=>r.day===d).map(r=>r.loc.id)).size);
t.dayImbalance=Math.max(...trips)-Math.min(...trips);
}
t.prefMiss=Math.max(0,p.prefTotal-p.prefHit);
t.dayPrefMiss=Math.max(0,p.dayTotal-p.dayHit);
t.pairWithMiss=Math.max(0,p.pairTotal-p.pairHit);
t.pairAvoidHit=p.pairBreak||0;
t.conflictSoft=p.eval&&p.eval.soft?p.eval.soft.conflictSoft:0;
if(ref){
const B=new Set();
for(const r of ref.rows)for(const id of r.team)B.add(id+':'+r.day);
for(const r of p.rows)for(const id of r.team)if(!B.has(id+':'+r.day))t.changeFromPrev++;
}
return t;
}
function qualityScore(p,ref){
const W=QW[state.priority]||QW.balance;
const t=qualityTerms(p,ref);
let s=0;
for(const k in W)s+=W[k]*t[k];
p.terms=t;
p.quality=s;
p.score=-s;
return s;
}
const _hc=new WeakMap();
function planKey(p){let h=_hc.get(p);if(h===undefined){h=hashPlan(p);_hc.set(p,h);}return h;}
function rankTuple(p){
return[p.eval.hardCount,-p.rows.length,p.quality==null?qualityScore(p,null):p.quality];
}
function comparePlans(a,b){
const x=rankTuple(a),y=rankTuple(b);
for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;
const ha=planKey(a),hb=planKey(b);
return ha<hb?-1:ha>hb?1:0;
}

const FIX={
memberExempt:{label:f=>'استثناء '+nm(f.id)+' من قاعدة الراحة',run:f=>{const m=byId(f.id);if(m){m.rest={rest:0,maxRun:1};m.restCustom=false;}}},
weekOffClear:{label:f=>'إلغاء إجازة '+nm(f.id)+' هذا الأسبوع يوم '+DAYS[f.day],run:f=>{const o=weekOv();if(o&&o.memberOff&&o.memberOff[f.id])o.memberOff[f.id]=o.memberOff[f.id].filter(d=>d!==f.day);}},
weekOpenDay:{label:f=>'فتح '+locName(f.id)+' هذا الأسبوع يوم '+DAYS[f.day],run:f=>{const o=weekOv();if(o&&o.locClosed&&o.locClosed[f.id])o.locClosed[f.id]=o.locClosed[f.id].filter(d=>d!==f.day);}},
memberOffClear:{label:f=>'إلغاء إجازة '+nm(f.id)+' يوم '+DAYS[f.day],run:f=>{const m=byId(f.id);if(m)m.off=m.off.filter(d=>d!==f.day);}},
membersAuto:{label:f=>'إلغاء عدد الزيارات المحدد لـ'+nm(f.id),run:f=>{const m=byId(f.id);if(m){m.vmode='auto';m.vmin=0;m.vmax=0;}}},
gmaxOff:{label:()=>'إلغاء الحد العام لزيارات الأعضاء',run:()=>{state.gmaxOn=false;}},
restPreset:{label:f=>'نمط الراحة العام: '+PRESETS.find(p=>p.k===f.k).l,run:f=>{const p=PRESETS.find(x=>x.k===f.k);state.rest={rest:p.rest,maxRun:p.maxRun};state.restCustom=false;}},
goalOff:{label:f=>'تعطيل '+goalNameById(f.id),run:f=>{const g=state.goals.find(x=>x.id===f.id);if(g)g.on=false;}},
dupPeople:{label:()=>'السماح لنفس العضو بأكثر من زيارة',run:()=>{state.oneVisitPerMember=false;}},
conflictSoft:{label:f=>'جعل قاعدة التعارض مرنة',run:f=>{const r=state.conflicts.find(x=>x.id===f.id);if(r)r.hard=false;}},
conflictOff:{label:f=>'إيقاف قاعدة التعارض',run:f=>{const r=state.conflicts.find(x=>x.id===f.id);if(r)r.on=false;}},
pairSoft:{label:()=>'جعل قواعد الاقتران مرنة',run:()=>{state.pairs.mode='soft';for(const r of state.pairs.rules){if(r.kind==='must')r.kind='with';if(r.hard===true)r.hard=false;}}},
fairSoft:{label:()=>'جعل قواعد العدالة مرنة',run:()=>{state.fair.mode='soft';}},
dayRuleOff:{label:f=>'إيقاف قاعدة الأيام',run:f=>{const r=(state.dayRules||[]).find(x=>x.id===f.id);if(r)r.on=false;}},
locGapOff:{label:f=>'إلغاء الفاصل بين زيارات '+locName(f.id),run:f=>{const l=locById(f.id);if(l)l.minGap=0;}},
locNeedOff:{label:f=>'إلغاء متطلب «'+f.tag+'» في '+locName(f.id),run:f=>{const l=locById(f.id);if(l&&l.needs)l.needs=l.needs.filter(n=>n.tag!==f.tag);}},
genderMode:{label:f=>f.mode==='mixed'?'تخفيف قاعدة الخلط إلى «مختلط»':'تغيير قاعدة الخلط النوعي',run:f=>{if(GENDER_MODES.includes(f.mode))state.gender.mode=f.mode;}},
locGenderOff:{label:f=>'إيقاف الخلط النوعي في '+locName(f.id),run:f=>{const l=locById(f.id);if(l)l.genderRule=false;}},
locOnlyClear:{label:f=>'إزالة تقييد المؤهلين عن '+locName(f.id),run:f=>{const l=locById(f.id);if(l){l.only=[];l.ban=[];}}},
locSeatsFit:{label:f=>'ملاءمة مقاعد '+locName(f.id)+' للمؤهلين',run:f=>{
const l=locById(f.id);if(!l)return;
const sh=shapeOf(l),av={1:0,2:0};
for(const m of state.members)if(eligibleFor(m,l))av[m.pool]++;
const s={1:Math.min(sh[1],av[1]),2:Math.min(sh[2],av[2])};
l.seats=seatsDiffer(l,s)?s:null;
}},
dayMax:{label:f=>'رفع الحد اليومي إلى '+ar(f.n),run:f=>{state.cap.dayMax=clamp(Math.round(f.n),LIM.dayMax[0],LIM.dayMax[1]);}},
capMain:{label:f=>'رفع حد المواقع الرئيسية يوميًا إلى '+ar(f.n),run:f=>{state.cap.mainPerDay=clamp(Math.round(f.n),LIM.perDay[0],LIM.perDay[1]);}},
capCon:{label:f=>'رفع حد المواقع المتعاقدة يوميًا إلى '+ar(f.n),run:f=>{state.cap.conPerDay=clamp(Math.round(f.n),LIM.perDay[0],LIM.perDay[1]);}},
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
const n=state.members.filter(m=>m.pool===f.pool).length+1;
state.members.push({id:nextId(),name:(f.pool===1?'سريري ':'إداري ')+ar(n),pool:f.pool,gender:'M',off:[],pref:'',types:'any',prefDays:[],vmode:'auto',vmin:0,vmax:0});
}},
};
const DUPL={banned:'ممنوع',separate:'منفصل',merged:'مدموج'};
const locName=id=>{const l=locById(id);return l?l.name:'؟';};
const goalNameById=id=>{const g=state.goals.find(x=>x.id===id);return g?goalLabel(g):'الهدف';};
const fixLabel=f=>FIX[f.op].label(f);

const visitsAcc=n=>n===1?'زيارة واحدة':n===2?'زيارتين':n<11?ar(n)+' زيارات':ar(n)+' زيارة';





function saveObject(){
return{
v:3,rest:state.rest,restCalendar:state.restCalendar,days:state.days,members:state.members,locations:state.locations,
extraVisits:state.extraVisits,oneVisitPerMember:state.oneVisitPerMember,migrationNote:state.migrationNote,useAllDays:state.useAllDays,
bulk:state.bulk,pairs:state.pairs,goals:state.goals,cap:state.cap,dup:state.dup,conflicts:state.conflicts,autoRegen:state.autoRegen,minChanges:state.minChanges,weekStart:state.weekStart,view:state.view,
priority:state.priority,carryWeek:state.carryWeek,history:state.history,historyWd:state.historyWd,weekOverrides:pruneOverrides(),gender:state.gender,dayRules:state.dayRules,fair:state.fair,solver:state.solver,digits:state.digits,gmaxOn:state.gmaxOn,gmax:state.gmax
};
}
function pruneOverrides(){
const out={},src=state.weekOverrides||{};
const t=new Date(state.weekStart+'T00:00:00');
t.setDate(t.getDate()-84);
const min=isoD(t);
for(const k of Object.keys(src))if(k>=min)out[k]=src[k];
return out;
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
const wd=workingDays(),hw=state.historyWd&&state.historyWd[prevWeekKey()],pwd=hw&&hw.length?hw:wd;
for(const id of Object.keys(h)){
const out=[];
for(const d of h[id]){
if(state.restCalendar)out.push(d-7);
else{const k=pwd.indexOf(d);if(k>=0)out.push(k-pwd.length);}
}
if(out.length)mp.set(+id,out);
}
return mp;
}
const nm=id=>{const m=byId(id);return m?m.name:'؟';};

const BIG=1e6;






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

const capCache=new Map();



function dayCapFixes(){
const out=[];
if(globalDayMax()+1<=LIM.dayMax[1])out.push({op:'dayMax',n:globalDayMax()+1});
if(state.cap.mainPerDay+1<=LIM.perDay[1])out.push({op:'capMain',n:state.cap.mainPerDay+1});
if(state.cap.conPerDay+1<=LIM.perDay[1])out.push({op:'capCon',n:state.cap.conPerDay+1});
return out;
}
const FAMILIES=[
{k:'dupPeople',on:()=>state.oneVisitPerMember,fixes:()=>[{op:'dupPeople'}]},
{k:'members',on:()=>state.gmaxOn||state.members.some(m=>m.vmode==='exact'||m.vmode==='range'),fixes:()=>[...(state.gmaxOn?[{op:'gmaxOff'}]:[]),...state.members.filter(m=>m.vmode==='exact'||m.vmode==='range').map(m=>({op:'membersAuto',id:m.id}))]},
{k:'rest',on:()=>true,fixes:()=>{
const cands=state.members.filter(m=>(m.off.length||weekOffDays(m.id).length)&&!(m.rest&&m.rest.rest===0)).sort((a,b)=>(b.off.length+weekOffDays(b.id).length)-(a.off.length+weekOffDays(a.id).length)).map(m=>({op:'memberExempt',id:m.id}));
return[...cands,{op:'restPreset',k:'12'},{op:'restPreset',k:'01'}];
}},
{k:'daycap',on:()=>true,fixes:()=>dayCapFixes()},
{k:'gender',on:()=>state.locations.some(l=>l.genderRule),fixes:()=>[...(state.gender.mode==='legacy4'||state.gender.mode==='minF'||state.gender.mode==='minM'?[{op:'genderMode',mode:'mixed'}]:[]),...state.locations.filter(l=>l.genderRule).map(l=>({op:'locGenderOff',id:l.id}))]},
{k:'pairs',on:()=>state.pairs.enabled&&state.pairs.rules.some(r=>pairRuleHard(r)||(r.kind==='must'&&!RX.has('pairs'))),fixes:()=>[{op:'pairSoft'}]},
{k:'fair',on:()=>fairHard()&&(state.fair.maxSpread>0||state.fair.minEach>0),fixes:()=>[{op:'fairSoft'}]},
{k:'dayRules',on:()=>(state.dayRules||[]).some(r=>r.on)||state.locations.some(l=>l.minGap>1),fixes:()=>[...(state.dayRules||[]).filter(r=>r.on).map(r=>({op:'dayRuleOff',id:r.id})),...state.locations.filter(l=>l.minGap>1).map(l=>({op:'locGapOff',id:l.id}))]},
{k:'tags',on:()=>state.locations.some(l=>l.needs&&l.needs.length),fixes:()=>state.locations.filter(l=>l.needs&&l.needs.length).map(l=>({op:'locNeedOff',id:l.id,tag:l.needs[0].tag}))},
{k:'conflicts',on:()=>state.conflicts.some(r=>r.on&&r.hard!==false),fixes:()=>state.conflicts.filter(r=>r.on).map(r=>({op:'conflictSoft',id:r.id}))},
{k:'elig',on:()=>state.locations.some(l=>(l.only&&l.only.length)||(l.ban&&l.ban.length)),fixes:()=>state.locations.filter(l=>(l.only&&l.only.length)||(l.ban&&l.ban.length)).map(l=>({op:'locEligClear',id:l.id}))},
{k:'types',on:()=>state.members.some(m=>m.types&&m.types!=='any'),fixes:()=>[]},
{k:'closed',on:()=>state.locations.some(l=>l.closed.length||weekClosedDays(l.id).length),fixes:()=>state.locations.filter(l=>weekClosedDays(l.id).length).map(l=>({op:'weekOpenDay',id:l.id,day:weekClosedDays(l.id)[0]}))},
{k:'offdays',on:()=>state.members.some(m=>m.off.length||weekOffDays(m.id).length),fixes:()=>[...state.members.filter(m=>m.off.length).map(m=>({op:'memberOffClear',id:m.id,day:m.off[0]})),...state.members.filter(m=>weekOffDays(m.id).length).map(m=>({op:'weekOffClear',id:m.id,day:weekOffDays(m.id)[0]}))]},
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
pairs:'قواعد الاقتران الصارمة («ليس مع» و«دائمًا مع»)',
tags:'متطلبات المهارات في المواقع',
fair:'قواعد العدالة الصارمة بين الأعضاء',
minWeek:'الحد الأدنى الأسبوعي لزيارات المواقع',
dayRules:'قواعد الأيام بين المواقع والفواصل بين الزيارات',
conflicts:'قواعد التعارض بين المواقع',
elig:'تقييد المؤهلين في المواقع',
types:'أنواع المواقع المسموحة للأعضاء',
closed:'أيام إغلاق المواقع',
offdays:'إجازات الأعضاء',
goals:'الأهداف'
};
FIX.locRepeatPeople={label:f=>'السماح بتكرار نفس الأعضاء في '+locName(f.id),run:f=>{const l=locById(f.id);if(l)l.repeat={...l.repeat,people:'any'};}};
FIX.locRepeatDays={label:f=>'السماح بزيارتين في اليوم نفسه في '+locName(f.id),run:f=>{const l=locById(f.id);if(l)l.repeat={...l.repeat,days:'same'};}};
FIX.locVisits={label:f=>f.n===0?'تخطي '+locName(f.id)+' هذا الأسبوع':'خفض زيارات '+locName(f.id)+' إلى '+ar(f.n),run:f=>{const l=locById(f.id);if(l)l.visits=clamp(f.n|0,0,VISIT_MAX);}};
FIX.extraVisits={label:f=>'ضبط الزيارات الإضافية على '+ar(f.n),run:f=>{state.extraVisits=clamp(f.n|0,0,EXTRA_MAX);}};
FAM_TEXT.repPeople='منع تكرار نفس الأعضاء في الموقع نفسه';
FAMILIES.push({k:'repPeople',on:()=>state.locations.some(l=>capOf(l)>=2&&l.repeat&&l.repeat.people==='different'),fixes:()=>state.locations.filter(l=>capOf(l)>=2&&l.repeat&&l.repeat.people==='different').map(l=>({op:'locRepeatPeople',id:l.id}))});
function probeFixV3(fx,achieved,seed,deadline){
if(performance.now()>deadline)return false;
const E2=cloneEngine();
const d=E2.FIX[fx.op];
if(!d)return false;
d.run(fx);
const r=E2.solveNow({seed,timeBudgetMs:300,plans:1,explain:false});
return r.status==='optimal'||r.status==='feasible'||r.achieved>achieved;
}
function explainUnplaced(units,placed,un,seed,deadline,achieved){
const cache=new Map();
const fams=FAMILIES.filter(f=>f.on());
const fixesFor=f=>{
if(cache.has(f.k))return cache.get(f.k);
const out=[];
for(const fx of f.fixes()){
if(out.length>=3||performance.now()>deadline)break;
if(probeFixV3(fx,achieved,seed,deadline))out.push(fx);
}
cache.set(f.k,out);
return out;
};
const rank=['dupPeople','repPeople','seats','members','rest','daycap','gender','pairs','conflicts','elig','types','closed','offdays','goals'];
for(const e of un){
const target=units.filter(u=>placed.includes(u.uid)||(u.loc.id===e.locId&&u.idx===e.idx));
const list=[];
for(const f of fams){
if(performance.now()>deadline)break;
const r=withRelax([f.k],()=>v3Feasible(target,3000,deadline,seed));
if(r.status!=='found')continue;
const fixes=fixesFor(f);
if(fixes.length)list.push({family:f.k,text:FAM_TEXT[f.k]||f.k,fixes});
}
list.sort((a,b)=>rank.indexOf(a.family)-rank.indexOf(b.family));
const loc=locById(e.locId);
if(loc&&performance.now()<deadline){
const fx={op:'locVisits',id:loc.id,n:Math.max(0,loc.visits-1)};
if(probeFixV3(fx,achieved,seed,deadline))list.push({family:'visits',text:'تقليل زيارات الموقع',fixes:[fx]});
}
if(!list.length)list.push({family:'capacity',text:'لا تتسع الأيام والأعضاء المتاحة لهذه الزيارة مع بقية الزيارات',fixes:[]});
e.reasons=list;
}
}
function cloneEngine(){
const saved=JSON.parse(JSON.stringify(saveObject()));
const E2=createFromSaved(saved,{seed:opts.seed});
return E2;
}




function improvePlan(M,plan,o){
o=o||{};
const iters=o.iters==null?600:o.iters;
const deadline=performance.now()+(o.ms==null?250:o.ms);
let best=plan;
const ref=o.ref||null;
const tryRows=nr=>{
if(checkPlan(nr,M).hardCount)return;
const cand=planFromRows(M,nr,ref);
if(comparePlans(cand,best)<0)best=cand;
};
for(let it=0;it<iters&&performance.now()<deadline;it++){
const rows=best.rows;
if(rows.length<2)break;
const i=Math.floor(rng()*rows.length);
let j=Math.floor(rng()*rows.length);
if(i===j)continue;
const mv=Math.floor(rng()*5);
if(mv===0){
const a=rows[i].team[Math.floor(rng()*rows[i].team.length)],b=rows[j].team[Math.floor(rng()*rows[j].team.length)];
if(a==null||b==null||a===b||rows[j].team.includes(a)||rows[i].team.includes(b))continue;
if(byId(a).pool!==byId(b).pool)continue;
tryRows(rows.map((r,k)=>k===i?{...r,team:r.team.map(x=>x===a?b:x)}:k===j?{...r,team:r.team.map(x=>x===b?a:x)}:r));
}else if(mv===1){
const busy=new Set(rows.filter(r=>r.day===rows[i].day).flatMap(r=>r.team));
const a=rows[i].team[Math.floor(rng()*rows[i].team.length)];
if(a==null)continue;
const pool=byId(a).pool;
const idle=state.members.filter(m=>m.pool===pool&&!busy.has(m.id)&&!rows[i].team.includes(m.id));
if(!idle.length)continue;
const b=idle[Math.floor(rng()*idle.length)].id;
tryRows(rows.map((r,k)=>k===i?{...r,team:r.team.map(x=>x===a?b:x)}:r));
}else if(mv===2){
const days=M.days.filter(d=>d!==rows[i].day);
if(!days.length)continue;
const d=days[Math.floor(rng()*days.length)];
tryRows(rows.map((r,k)=>k===i?{...r,day:d}:r));
}else if(mv===3){
if(rows[i].day===rows[j].day)continue;
tryRows(rows.map((r,k)=>k===i?{...r,day:rows[j].day}:k===j?{...r,day:rows[i].day}:r));
}else{
if(rows[i].loc.id!==rows[j].loc.id||rows[i].day!==rows[j].day)continue;
tryRows(rows.map((r,k)=>k===i?{...r,team:rows[j].team.slice()}:k===j?{...r,team:rows[i].team.slice()}:r));
}
}
return best;
}
function emptyReason(){
if(!state.members.length)return'لا يوجد أعضاء. أضف أعضاء أولًا.';
if(!state.locations.length)return'لا توجد مواقع. أضف مواقع أولًا.';
if(!workingDays().length)return'لا توجد أيام عمل مفعّلة.';
const cg=compileGoals().list.filter(g=>g.custom);
if(state.locations.every(l=>shapeSize(shapeOf(l))<1&&!cg.some(g=>g.loc.id===l.id)))return'كل المواقع بلا مقاعد.';
if(state.locations.every(l=>workingDays().every(d=>closedOn(l,d))))return'كل المواقع مغلقة في كل أيام العمل.';
return null;
}


function hashPlan(p){return JSON.stringify(p.rows.map(r=>[r.day,r.loc.id,r.team.slice().sort((a,b)=>a-b)]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]));}


function restFine(days,pv,rule){
if(rule.rest===0)return true;
if(days.length<2&&!pv)return true;
const pts=new Map();
if(pv)for(const x of pv)pts.set(dayPos(x),false);
for(const d of days){const x=dayPos(d);if(x!==null&&x!==undefined)pts.set(x,true);}
const seq=[...pts.entries()].sort((a,b)=>a[0]-b[0]);
let run=1;
for(let i=1;i<seq.length;i++){
const gap=seq[i][0]-seq[i-1][0]-1;
if(gap===0){run++;if(run>rule.maxRun&&seq[i][1])return false;}
else{if(gap<rule.rest&&seq[i][1])return false;run=1;}
}
return true;
}
function v3Units(goals){
const units=[];
let uid=0;
const byLoc=new Map();
for(const g of goals){if(!byLoc.has(g.loc.id))byLoc.set(g.loc.id,[]);byLoc.get(g.loc.id).push(g);}
for(const l of state.locations){
const gl=byLoc.get(l.id)||[];
const n=Math.max(l.visits|0,gl.length);
const shape=shapeOf(l);
for(let i=0;i<n;i++){
const g=gl[i]||null;
units.push({uid:uid++,loc:l,idx:i,flex:false,goal:g?g.id:null,req:g?g.people:[],excl:g?g.excl:[],custom:g?g.custom:null,shape:g&&g.custom?null:shape,days:g?g.days:null,plain:!g});
}
if(n>=1)for(let i=0;i<(l.maxExtra|0);i++)units.push({uid:uid++,loc:l,idx:n+i,flex:true,goal:null,req:[],excl:[],custom:null,shape,days:null,plain:true});
}
return units;
}
function* combOf(list,keys,k){
const cur=[];
function* rec(s){
if(cur.length===k){yield cur.slice();return;}
for(let i=s;i<=list.length-(k-cur.length);i++){
if(i>s&&keys[i]===keys[i-1])continue;
cur.push(list[i]);
yield* rec(i+1);
cur.pop();
}
}
yield* rec(0);
}
function v3Search(units,cfg){
const M=compileModel();
const days=M.days,P=M.pairs,CF=M.conflicts.filter(c=>c.hard),DR=M.dayRules,prev=carryPrev();
const S={rows:[],mdays:new Map(),cnt:new Map(),vis:new Map(),locDays:new Map(),dayLocs:new Map()};
let ver=0;
const placed=new Set(),skipped=new Set();
const maxOf=new Map(state.members.map(m=>[m.id,memberMax(m)]));
const rnd=cfg.rnd?rand:null;
const E=state.extraVisits|0;
let nodes=0,limitHit=false,placedFlex=0;
const special=new Set();
for(const x of P.list){special.add(x.a);special.add(x.b);}
for(const c of M.conflicts)for(const id of c.ids)special.add(id);
for(const g of state.goals){for(const id of g.people||[])special.add(id);for(const id of g.exclude||[])special.add(id);for(const id of g.allowed||[])special.add(id);}
for(const l of state.locations){for(const id of l.only||[])special.add(id);for(const id of l.ban||[])special.add(id);}
const sig=new Map(state.members.map(m=>[m.id,special.has(m.id)?'#'+m.id:[m.pool,m.gender,(m.tags||[]).slice().sort().join(','),m.types||'any',m.vmode,m.vmin,m.vmax,JSON.stringify(m.rest||null),m.off.join(','),weekOffDays(m.id).join(','),m.pref||'',(m.prefDays||[]).join(',')].join('|')]));
const visKeys=id=>{const v=S.vis.get(id);return v?[...v.keys()]:[];};
const dkTab=new Map();
let dkVer=-1;
function dynKey(m){
if(dkVer!==ver){dkTab.clear();dkVer=ver;}
let k=dkTab.get(m.id);
if(k===undefined){
const dd=S.mdays.get(m.id);
k=sig.get(m.id)+'~'+(S.cnt.get(m.id)||0)+'~'+(dd?dd.slice().sort().join(''):'')+'~'+visKeys(m.id).sort().join('.');
dkTab.set(m.id,k);
}
return k;
}
const pen=(m,u,d)=>(m.pref&&(u.loc.dist==='near'||u.loc.dist==='far')&&m.pref!==u.loc.dist?1:0)+(m.prefDays&&m.prefDays.length&&!m.prefDays.includes(d)?1:0);
const unitsOfLoc=new Map();
for(const u of units){if(!unitsOfLoc.has(u.loc.id))unitsOfLoc.set(u.loc.id,[]);unitsOfLoc.get(u.loc.id).push(u);}
const predOf=u=>{
if(!u.plain)return null;
const arr=unitsOfLoc.get(u.loc.id);
const i=arr.indexOf(u);
const p=arr[i-1];
return p&&p.plain&&p.flex===u.flex?p:(p&&p.plain&&u.flex&&!p.flex?p:null);
};
const dayOfUnit=new Map();

const freeTab=new Map(),eligTab=new Map();
let tabVer=-1;
function freeOf(m,d){
if(tabVer!==ver){freeTab.clear();tabVer=ver;}
let a=freeTab.get(m.id);
if(!a){a=new Array(7);freeTab.set(m.id,a);}
let v=a[d];
if(v===undefined){
v=true;
const bd=S.mdays.get(m.id);
if(offOn(m,d))v=false;
else if(bd&&bd.includes(d))v=false;
else if((S.cnt.get(m.id)||0)>=maxOf.get(m.id))v=false;
else{
const r=ruleOf(m);
if(r.rest>0&&!restFine(bd?bd.concat(d):[d],prev.get(m.id),r))v=false;
}
a[d]=v;
}
return v;
}
function eligOf(m,l){
const k=m.id*100000+l.id;
let v=eligTab.get(k);
if(v===undefined){v=eligibleFor(m,l);eligTab.set(k,v);}
return v;
}
function memberOK(m,u,d){
if(!freeOf(m,d))return false;
if(!eligOf(m,u.loc))return false;
if(u.excl.length&&u.excl.includes(m.id))return false;
if(u.custom&&u.custom.allowed&&!u.custom.allowed.includes(m.id))return false;
const vis=S.vis.get(m.id);
if(vis){
if(vis.has(u.loc.id)&&repDiffOf(u.loc))return false;
if(CF.length&&conflictHit(CF,m,[...vis.keys()],u.loc.id))return false;
}
return true;
}
function* teamsFor(u,d){
const cand={1:[],2:[]};
for(const m of state.members)if(memberOK(m,u,d))cand[m.pool].push(m);
const reqM=[];
for(const id of u.req){const m=byId(id);if(!m||!memberOK(m,u,d))return;reqM.push(m);}
const reqIds=new Set(u.req);
const order=list=>{
const gr=new Map();
const rows=list.filter(m=>!reqIds.has(m.id)).map(m=>{
const key=dynKey(m);
if(rnd&&!gr.has(key))gr.set(key,rnd());
return{m,c:S.cnt.get(m.id)||0,p:pen(m,u,d),key,g:rnd?gr.get(key):0};
});
rows.sort((a,b)=>a.c-b.c||a.p-b.p||a.g-b.g||(a.key<b.key?-1:a.key>b.key?1:0)||a.m.id-b.m.id);
return{list:rows.map(x=>x.m),keys:rows.map(x=>x.key)};
};
if(u.custom){
const need=u.custom.size-reqM.length;
if(need<0)return;
const o=order(cand[1].concat(cand[2]));
if(o.list.length<need)return;
for(const pick of combOf(o.list,o.keys,need)){
const team=reqM.concat(pick);
if(P.hardAny&&!pairTeamOK(P,team.map(m=>m.id)))continue;
yield team;
}
return;
}
const sh=u.shape;
const r1=reqM.filter(m=>m.pool===1).length,r2=reqM.length-r1;
const n1=sh[1]-r1,n2=sh[2]-r2;
if(n1<0||n2<0)return;
const o1=order(cand[1]),o2=order(cand[2]);
if(o1.list.length<n1||o2.list.length<n2)return;
const gAct=genderActive(u.loc),cfg2=gAct?genderCfgOf(u.loc):null,nAct=needsActive(u.loc);
const plain=!gAct&&!nAct&&!P.hardAny;
const c2=[...combOf(o2.list,o2.keys,n2)];
for(const a of combOf(o1.list,o1.keys,n1)){
for(const b of c2){
const team=reqM.concat(a,b);
if(!plain){
if(P.hardAny&&!pairTeamOK(P,team.map(m=>m.id)))continue;
if(gAct&&!genderOK(team.map(m=>m.gender),cfg2))continue;
if(nAct&&!needsOK(team,u.loc))continue;
}
yield team;
}
}
}
const plainTeams=new Map();
function hasTeam(u,d,exact){
let c1=0,c2=0;
for(const m of state.members)if(memberOK(m,u,d)){if(m.pool===1)c1++;else c2++;}
if(u.custom){if(c1+c2<u.custom.size)return false;}
else if(c1<u.shape[1]||c2<u.shape[2])return false;
let plain=plainTeams.get(u.uid);
if(plain===undefined){
plain=!u.custom&&!u.req.length&&!genderActive(u.loc)&&!needsActive(u.loc)&&!P.hardAny;
plainTeams.set(u.uid,plain);
}
if(plain||!exact)return true;
for(const t of teamsFor(u,d))return true;
return false;
}
function tripsAt(d){const dl=S.dayLocs.get(d);return dl?dl.size:0;}
function dayOK(u,d,minDay){
const l=u.loc;
if(closedOn(l,d))return false;
if(u.days&&!u.days.includes(d))return false;
if(minDay!=null&&!repMergedOf(l)&&d<=minDay)return false;
const ld=S.locDays.get(l.id)||[];
if(repMergedOf(l)){if(ld.length&&ld[0]!==d)return false;}
else{
if(ld.includes(d))return false;
const g=gapOf(l);
if(g>1)for(const x of ld)if(Math.abs(x-d)<g)return false;
}
const dl=S.dayLocs.get(d);
if(!(dl&&dl.has(l.id))){
const ids=dl?[...dl.keys()]:[];
if(ids.length+1>dayMaxOf(d))return false;
let mains=0;
for(const id of ids)if(M.locOf(id).type==='main')mains++;
const cons=ids.length-mains;
if(l.type==='main'&&mains+1>capMain())return false;
if(l.type!=='main'&&cons+1>capCon())return false;
if(DR.length&&dayRulesHit(DR,ids.concat(l.id),['notSameDay'])>0)return false;
}
return true;
}
function minDayOf(u){
const p=predOf(u);
if(!p||u.flex!==p.flex&&false)return null;
if(!p)return null;
const dd=dayOfUnit.get(p.uid);
return dd==null?null:dd;
}
function domain(u,exact){
const out=[];
const md=minDayOf(u);
for(const d of days){
if(!dayOK(u,d,md))continue;
if(!hasTeam(u,d,exact))continue;
out.push(d);
}
return out;
}
function apply(u,d,team){
ver++;
S.rows.push({u,d,team});
dayOfUnit.set(u.uid,d);
for(const m of team){
if(!S.mdays.has(m.id))S.mdays.set(m.id,[]);
S.mdays.get(m.id).push(d);
S.cnt.set(m.id,(S.cnt.get(m.id)||0)+1);
if(!S.vis.has(m.id))S.vis.set(m.id,new Map());
const v=S.vis.get(m.id);
v.set(u.loc.id,(v.get(u.loc.id)||0)+1);
}
if(!S.locDays.has(u.loc.id))S.locDays.set(u.loc.id,[]);
S.locDays.get(u.loc.id).push(d);
if(!S.dayLocs.has(d))S.dayLocs.set(d,new Map());
const dl=S.dayLocs.get(d);
dl.set(u.loc.id,(dl.get(u.loc.id)||0)+1);
placed.add(u.uid);
if(u.flex)placedFlex++;
}
function undo(u,d,team){
ver++;
S.rows.pop();
dayOfUnit.delete(u.uid);
for(const m of team){
S.mdays.get(m.id).pop();
S.cnt.set(m.id,S.cnt.get(m.id)-1);
const v=S.vis.get(m.id);
const c=v.get(u.loc.id)-1;
if(c<=0)v.delete(u.loc.id);else v.set(u.loc.id,c);
}
S.locDays.get(u.loc.id).pop();
const dl=S.dayLocs.get(d);
const c=dl.get(u.loc.id)-1;
if(c<=0)dl.delete(u.loc.id);else dl.set(u.loc.id,c);
placed.delete(u.uid);
if(u.flex)placedFlex--;
}
const sameRules=DR.filter(r=>r.kind==='sameDay');
function sameDayOK(){
if(!sameRules.length)return true;
for(const r of sameRules){
let all=true;
for(const [lid,arr] of unitsOfLoc)if((r.A.has(lid)||r.B.has(lid))&&arr.some(u=>!u.flex&&!placed.has(u.uid)&&!skipped.has(u.uid))){all=false;break;}
if(!all)continue;
for(const d of days){
const dl=S.dayLocs.get(d);
const ids=dl?[...dl.keys()]:[];
if(dayRulesHit([r],ids,['sameDay'])>0)return false;
}
}
return true;
}
function maxAddDays(m,free){
const r=ruleOf(m);
if(r.rest===0||free.length<2)return free.length;
const bd=S.mdays.get(m.id)||[],pv=prev.get(m.id);
let best=0;
const n=free.length;
for(let mask=1;mask<(1<<n);mask++){
let c=0;
const dd=bd.slice();
for(let i=0;i<n;i++)if(mask&(1<<i)){dd.push(free[i]);c++;}
if(c<=best)continue;
if(restFine(dd,pv,r))best=c;
}
return best;
}
function supplyOK(undecided,doms){
if(!undecided.length)return true;
for(const q of[1,2]){
const us=undecided.filter(u=>!u.flex&&(u.custom?true:u.shape[q]>0));
let need=0;
for(const u of us)need+=u.custom?u.custom.size:u.shape[q];
if(need===0)continue;
const dset=new Set();
for(const u of us)for(const d of doms.get(u.uid))dset.add(d);
const dl=[...dset];
const mem=state.members.filter(m=>m.pool===q||(us.some(u=>u.custom)));
const N=2+us.length+dl.length+mem.length;
const D=Dinic(N);
const s=0,t=1;
const uo=2,do_=2+us.length,mo=do_+dl.length;
us.forEach((u,i)=>{
D.add(s,uo+i,u.custom?u.custom.size:u.shape[q]);
for(const d of doms.get(u.uid))D.add(uo+i,do_+dl.indexOf(d),u.custom?u.custom.size:u.shape[q]);
});
mem.forEach((m,j)=>{
const room=maxOf.get(m.id)-(S.cnt.get(m.id)||0);
if(room<=0)return;
const free=[];
dl.forEach((d,k)=>{if(freeOf(m,d)){free.push(d);D.add(do_+k,mo+j,1);}});
if(free.length)D.add(mo+j,t,Math.min(room,maxAddDays(m,free)));
});
const f=D.flow(s,t);
if(f<need)return false;
}
return true;
}
let found=null;
function leafPlan(){
const rows=S.rows.map(r=>({day:r.d,loc:r.u.loc,shape:r.u.shape,goal:r.u.goal||undefined,req:r.u.req,custom:r.u.custom?{size:r.u.custom.size}:null,team:r.team.map(m=>m.id).sort((a,b)=>a-b)}));
rows.sort((a,b)=>a.day-b.day||a.loc.id-b.loc.id);
return rows;
}
const prioW=u=>3-PRIO_RANK[u.loc.priority||'normal'];
const W=cfg.weights||new Map();
const rankOf=(u,dm)=>[dm.length/(1+(W.get(u.uid)||0))*(cfg.jitter?1+0.8*rnd():1),u.goal?0:1,u.req.length?0:1,u.idx,PRIO_RANK[u.loc.priority||'normal'],u.uid];
const cmpRank=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
const dayCost=(u,d)=>{
const dp=M.dayCfg[d];
let c=tripsAt(d)*10;
if(dp.fav&&u.loc.type!==dp.fav)c+=2;
if(dp.dist&&u.loc.dist!==dp.dist)c+=1;
return c;
};
function tryUnit(u,dom,next){
const dsorted=dom.slice().sort((a,b)=>dayCost(u,a)-dayCost(u,b)||a-b);
for(const d of dsorted){
for(const team of teamsFor(u,d)){
if(limitHit)return true;
nodes++;
if(nodes>cfg.nodeLimit||(cfg.deadline&&(nodes&63)===0&&performance.now()>cfg.deadline)){limitHit=true;return true;}
apply(u,d,team);
let ok=false;
if(sameDayOK())ok=next();
undo(u,d,team);
if(ok)return true;
if(limitHit)return true;
}
}
return false;
}
const firstFeas=new Set();
if(cfg.mode==='max'){
for(const u of units)if(u.idx===0&&!u.flex){
const md=null;
let okAny=false;
for(const d of days)if(dayOK(u,d,md)&&hasTeam(u,d,true)){okAny=true;break;}
if(okAny)firstFeas.add(u.uid);
}
}
let best=null;
const objOf=()=>{
const locs=new Set();
let goals=0,pr=0;
for(const r of S.rows){locs.add(r.u.loc.id);if(r.u.goal)goals++;pr+=prioW(r.u);}
return[locs.size,goals,S.rows.length,pr];
};
const lexGT=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;};
function recFeasible(){
if(limitHit)return true;
const undecided=units.filter(u=>!placed.has(u.uid));
const mand=undecided.filter(u=>!u.flex);
const doms=new Map();
let pick=null,pd=null;
for(const u of mand){
const dm=domain(u);
if(!dm.length){W.set(u.uid,(W.get(u.uid)||0)+1);return false;}
doms.set(u.uid,dm);
const p=predOf(u);
const avail=!p||placed.has(p.uid);
if(!avail)continue;
const better=!pick||cmpRank(rankOf(u,dm),rankOf(pick,pd))<0;
if(better){pick=u;pd=dm;}
}
if(mand.length&&!pick)return false;
if(mand.length){
if(!supplyOK(mand,doms))return false;
if(M.useAll){
const open=days.filter(d=>!S.dayLocs.has(d)||S.dayLocs.get(d).size===0).length;
if(mand.length<open)return false;
}
const exactD=domain(pick,true);
if(!exactD.length){W.set(pick.uid,(W.get(pick.uid)||0)+1);return false;}
return tryUnit(pick,exactD,recFeasible);
}
if(placedFlex<E){
let fp=null,fd=null;
for(const u of undecided){
if(!u.flex)continue;
const p=predOf(u);
if(p&&!placed.has(p.uid))continue;
const dm=domain(u);
if(!dm.length)continue;
if(!fp||dm.length<fd.length){fp=u;fd=dm;}
}
if(!fp)return false;
return tryUnit(fp,fd,recFeasible);
}
const rows=leafPlan();
const plan=planFromRows(M,rows,SOLVE_REF);
if(plan.eval.hardCount===0){found={rows,plan};return true;}
return false;
}
function recMax(){
if(limitHit)return true;
const auto=[];
let pick=null,pd=null;
const doms=new Map();
let firstLeft=false;
const undecided=units.filter(u=>!placed.has(u.uid)&&!skipped.has(u.uid));
const skippedFeasibleFirst=[...skipped].some(id=>firstFeas.has(id));
const coveredLocs=new Set(S.rows.map(r=>r.u.loc.id));
const live=[];
for(const u of undecided){
const p=predOf(u);
if(p&&skipped.has(p.uid)){auto.push(u);continue;}
if(u.flex&&placedFlex>=E){auto.push(u);continue;}
if((u.idx>0||u.flex)&&skippedFeasibleFirst){auto.push(u);continue;}
const dm=domain(u);
if(!dm.length){auto.push(u);continue;}
doms.set(u.uid,dm);
live.push(u);
}
for(const u of auto)skipped.add(u.uid);
let result=false;
try{
if(!sameDayOK())return false;
const liveFirst=live.filter(u=>u.idx===0&&!u.flex);
const pendingPrio=liveFirst.length?liveFirst:live.filter(u=>{const p=predOf(u);return !p||placed.has(p.uid)||skipped.has(p.uid);});
for(const u of pendingPrio){
const dm=doms.get(u.uid);
const p=predOf(u);
if(p&&!placed.has(p.uid)&&!skipped.has(p.uid))continue;
const better=!pick||cmpRank(rankOf(u,dm),rankOf(pick,pd))<0;
if(better){pick=u;pd=dm;}
}
const cur=objOf();
if(!pick){
if(M.fairSpread>0&&fairExcess(leafPlan(),M.fairActive,M.fairSpread)>0)return false;
if(!best||lexGT(cur,best.obj))best={obj:cur,rows:leafPlan(),uids:S.rows.map(r=>r.u.uid)};
return false;
}
const newLocs=new Set();
let gUb=cur[1],pUb=cur[2],prUb=cur[3],flexLeft=E-placedFlex;
for(const u of live){
if(u.flex){if(flexLeft>0){flexLeft--;pUb++;prUb+=prioW(u);}continue;}
if(u.idx===0&&!coveredLocs.has(u.loc.id))newLocs.add(u.loc.id);
if(u.goal)gUb++;
pUb++;prUb+=prioW(u);
}
if(best){
const ub=[coveredLocs.size+newLocs.size,gUb,pUb,prUb];
if(!lexGT(ub,best.obj))return false;
}
const dsorted=pd.slice().sort((a,b)=>dayCost(pick,a)-dayCost(pick,b)||a-b);
for(const d of dsorted){
for(const team of teamsFor(pick,d)){
if(limitHit){result=true;return true;}
nodes++;
if(nodes>cfg.nodeLimit||(cfg.deadline&&(nodes&63)===0&&performance.now()>cfg.deadline)){limitHit=true;result=true;return true;}
apply(pick,d,team);
if(sameDayOK())recMax();
undo(pick,d,team);
if(limitHit){result=true;return true;}
}
}
skipped.add(pick.uid);
if(sameDayOK())recMax();
skipped.delete(pick.uid);
return limitHit;
}finally{
for(const u of auto)skipped.delete(u.uid);
}
}
const noProgress=()=>false;
if(cfg.mode==='max'){
recMax();
if(best){
const rows=best.rows;
const plan=planFromRows(M,rows,SOLVE_REF);
return{status:limitHit?'limit':'done',rows,plan,obj:best.obj,uids:best.uids,nodes,exact:!limitHit};
}
return{status:limitHit?'limit':'done',rows:[],plan:null,obj:[0,0,0,0],uids:[],nodes,exact:!limitHit};
}
const ok=recFeasible();
if(found&&ok)return{status:'found',rows:found.rows,plan:found.plan,nodes};
return{status:limitHit?'limit':'none',nodes};
}

const V3_NPMS=12;
function withModel3(fn){
resetCaches();
try{return fn();}finally{resetCaches();}
}
function luby(i){
for(let k=1;k<32;k++){
if(i===(1<<k)-1)return 1<<(k-1);
}
let k=1;
while((1<<k)-1<i)k++;
return luby(i-(1<<(k-1))+1);
}
function v3Feasible(units,budgetNodes,hardDeadline,seedBase){
let spent=0;
const weights=new Map();
const first=v3Search(units,{mode:'feasible',nodeLimit:Math.min(400,Math.round(budgetNodes*0.3)),deadline:hardDeadline,rnd:false,weights});
spent+=first.nodes;
if(first.status==='found')return{status:'found',res:first,spent};
if(first.status==='none')return{status:'none',spent};
for(let i=1;spent<budgetNodes&&performance.now()<hardDeadline;i++){
reseed((seedBase+i*7919)>>>0);
const fresh=i%3===0;
const r=v3Search(units,{mode:'feasible',nodeLimit:Math.min(120*luby(i),budgetNodes-spent+1),deadline:hardDeadline,rnd:true,weights:fresh?new Map():weights,jitter:fresh});
spent+=r.nodes;
if(r.status==='found')return{status:'found',res:r,spent};
if(r.status==='none')return{status:'none',spent};
}
return{status:'limit',spent};
}
function capacityInfo(o){
o=o||{};
return withModel3(()=>{
const t0=performance.now();
const budget=o.timeBudgetMs==null?800:o.timeBudgetMs;
const hard=t0+Math.max(budget*1.15,200);
const seed=o.seed==null?20241028:o.seed;
reseed(seed);
const requested=totalRequested();
const units=v3Units(compileGoals().list);
if(!state.members.length||!units.length)return{requested,capacity:0,exact:true,ub:0};
const nodes=Math.max(1000,Math.round(budget*V3_NPMS));
const fe=v3Feasible(units,nodes,hard,seed);
if(fe.status==='found')return{requested,capacity:requested,exact:true,ub:requested};
const mx=v3Search(units,{mode:'max',nodeLimit:nodes,deadline:hard,rnd:false});
const cap=mx.plan?mx.plan.rows.length:0;
return{requested,capacity:cap,exact:!!mx.exact,ub:mx.exact?cap:requested};
});
}
function capacity(o){return capacityInfo(o).capacity;}
let SOLVE_REF=null;
function solveNow(o){
o=o||{};
SOLVE_REF=o.ref||null;
if(o.visitsWanted!=null||o.visits!=null)throw new Error('visitsWanted is no longer an input; set location visits instead');
return withModel3(()=>{
const t0=performance.now();
const budget=o.timeBudgetMs!=null?o.timeBudgetMs:(SOLVER_MS[state.solver.budget]||1500);
const hard=t0+Math.max(budget*1.15,300);
const seed=o.seed==null?20241028:o.seed;
const want=o.plans||state.solver.plans||6;
reseed(seed);
const requested=totalRequested();
const G=compileGoals();
const units=v3Units(G.list);
const totalNodes=Math.max(2000,Math.round(budget*V3_NPMS));
const finish=(status,plans,extra)=>({status,requested,achieved:0,plans,unplaced:[],message:'',exact:true,firstPlanMs:null,...extra});
const er=emptyReason();
if(er||!units.length)return finish('infeasible_proven',[],{message:er||'لا توجد زيارات مطلوبة.'});
const feDeadline=Math.min(hard,t0+budget);
const fe=v3Feasible(units,totalNodes,feDeadline,seed);
const gather=(res,us)=>{
const all=[res.plan];
const keyOf=p=>p.rows.map(r=>r.day+':'+r.loc.id+':'+r.team.join(',')).join('|');
const seen=new Set([keyOf(res.plan)]);
const gDeadline=Math.min(hard,performance.now()+budget*0.5);
for(let i=1;all.length<want*2&&i<=want*3&&performance.now()<gDeadline;i++){
reseed((seed+i*104729)>>>0);
const r=v3Search(us,{mode:'feasible',nodeLimit:600,deadline:gDeadline,rnd:true});
if(r.status!=='found')continue;
if(seen.has(keyOf(r.plan)))continue;
seen.add(keyOf(r.plan));
all.push(r.plan);
}
const Mi=compileModel();
const order=all.slice().sort(comparePlans);
const share=Math.max(60,Math.min(250,(gDeadline-performance.now())/Math.max(1,Math.min(3,order.length))));
for(let k=0;k<Math.min(3,order.length)&&performance.now()<gDeadline+share;k++){
const imp=improvePlan(Mi,order[k],{ms:share,ref:SOLVE_REF});
if(imp!==order[k]){const idx=all.indexOf(order[k]);if(idx>=0&&!seen.has(keyOf(imp))){seen.add(keyOf(imp));all[idx]=imp;}}
}
return pickPlans(all,want).picked;
};
if(fe.status==='found'){
const firstPlanMs=Math.round(performance.now()-t0);
const picked=gather(fe.res,units);
return finish(picked[0].eval.clean?'optimal':'feasible',picked,{achieved:requested,firstPlanMs,coverage:{covered:state.locations.filter(l=>l.visits>0).length,wanted:state.locations.filter(l=>l.visits>0).length}});
}
const mx=v3Search(units,{mode:'max',nodeLimit:totalNodes,deadline:hard,rnd:false});
const firstPlanMs=Math.round(performance.now()-t0);
const plan0=mx.plan;
if(!plan0||!plan0.rows.length){
const un0=units.filter(u=>!u.flex).map(u=>({locId:u.loc.id,idx:u.idx,goal:u.goal,reasons:[]}));
if(o.explain!==false)explainUnplaced(units,[],un0,seed,performance.now()+(o.explainMs==null?Math.min(1500,Math.max(600,budget)):o.explainMs),0);
return finish(fe.status==='none'&&mx.exact?'infeasible_proven':'partial',[],{achieved:0,unplaced:un0,exact:mx.exact,firstPlanMs});
}
const placedUnits=units.filter(u=>mx.uids.includes(u.uid));
const picked=gather({plan:plan0},placedUnits);
const un=units.filter(u=>!mx.uids.includes(u.uid)&&!u.flex).map(u=>({locId:u.loc.id,idx:u.idx,goal:u.goal,reasons:[]}));
const flexMissing=Math.max(0,(state.extraVisits|0)-placedUnits.filter(u=>u.flex).length);
for(let i=0;i<flexMissing;i++)un.push({locId:null,idx:null,goal:null,reasons:[]});
if(o.explain!==false)explainUnplaced(units,mx.uids,un.filter(e=>e.locId!=null),seed,performance.now()+(o.explainMs==null?Math.min(1500,Math.max(600,budget)):o.explainMs),plan0.rows.length);
const covered=new Set(plan0.rows.map(r=>r.loc.id)).size;
return finish(fe.status==='none'&&mx.exact?'partial_proven':'partial',picked,{achieved:plan0.rows.length,firstPlanMs,unplaced:un,exact:mx.exact,coverage:{covered,wanted:state.locations.filter(l=>l.visits>0).length}});
});
}
function applyDigits(){LATIN=state.digits==='latin';}
const SAVE_KEYS=['extraVisits','oneVisitPerMember','migrationNote','solver','digits','fair','dayRules','gender','weekOverrides','days','members','locations','useAllDays','bulk','pairs','goals','cap','dup','conflicts','priority','carryWeek','gmaxOn','gmax','history','historyWd','rest','restCalendar','restCustom','autoRegen','minChanges','weekStart','view'];
function applySaved(d,migrated){
if(!d||typeof d!=='object')throw new Error('bad save');
const snap={};
for(const k of SAVE_KEYS)snap[k]=state[k]===undefined?undefined:JSON.parse(JSON.stringify(state[k]));
try{applyInner(d,migrated);}
catch(e){
for(const k of SAVE_KEYS){if(snap[k]===undefined)delete state[k];else state[k]=snap[k];}
resetCaches();
throw e;
}
resetCaches();
}
const numId=v=>{const n=typeof v==='number'?v:(typeof v==='string'&&v.trim()!==''?Number(v):NaN);return Number.isFinite(n)?n:null;};
function dedupeIds(arr){
const seen=new Set();
for(const x of arr){
if(Number.isFinite(x.id)&&!seen.has(x.id)){seen.add(x.id);continue;}
x.id=nextId();seen.add(x.id);
}
}
const VISIT_MAX=7,EXTRA_MAX=10,MAX_EXTRA_MAX=6;
function legacyDup(d){
if(d.dup&&typeof d.dup==='object')return{mode:DUP_MODES.includes(d.dup.mode)?d.dup.mode:'separate',people:['different','all'].includes(d.dup.people)?d.dup.people:'any'};
if(d.locRepeat==='never')return{mode:'banned',people:'any'};
return{mode:'separate',people:'any'};
}
function visitModelOf(l,d,type){
if((Number(d.v)||0)>=3){
const rp=l.repeat&&typeof l.repeat==='object'?l.repeat:{};
return{
visits:clamp(Number.isInteger(l.visits)?l.visits:1,0,VISIT_MAX),
repeat:{people:rp.people==='any'?'any':'different',days:rp.days==='same'?'same':'separate'},
maxExtra:clamp(Math.round(+l.maxExtra)||0,0,MAX_EXTRA_MAX)
};
}
const mw=clamp(Math.round(+l.minWeek)||0,0,5);
const ld=legacyDup(d);
const mode=DUP_MODES.includes(l.dup)?l.dup:ld.mode;
let visits=mw>=1?mw:1;
if(mode==='banned')visits=Math.min(visits,1);
return{visits,repeat:{people:ld.people==='different'?'different':'any',days:mode==='merged'?'same':'separate'},maxExtra:0};
}
function normalizeVisits(){
const raised=[];
for(const l of state.locations){
const n=state.goals.filter(g=>g.on!==false&&g.loc===l.id).length;
if(n>l.visits){
l.visits=Math.min(VISIT_MAX,n);
raised.push({key:'visitsRaisedForGoals',locId:l.id,n:l.visits});
}
}
return raised;
}
function totalRequested(){
let t=state.extraVisits|0;
for(const l of state.locations)t+=l.visits|0;
return t;
}
function setTypeVisits(type,n){
const t=type==='cont'?'contracted':type;
const v=clamp(Math.round(+n)||0,0,VISIT_MAX);
for(const l of state.locations)if(l.type===t)l.visits=v;
normalizeVisits();
return totalRequested();
}
function finishVisitModel(d){
const v3=(Number(d.v)||0)>=3;
state.extraVisits=v3?clamp(Math.round(+d.extraVisits)||0,0,EXTRA_MAX):0;
state.oneVisitPerMember=v3?d.oneVisitPerMember===true:legacyDup(d).people==='all';
normalizeVisits();
if(v3){
const n=d.migrationNote;
state.migrationNote=n&&typeof n==='object'&&Number.isFinite(n.oldVisits)&&Number.isFinite(n.newTotal)?{oldVisits:n.oldVisits,newTotal:n.newTotal}:null;
}else{
const total=totalRequested();
state.migrationNote=typeof d.visits==='number'&&d.visits!==total?{oldVisits:d.visits,newTotal:total}:null;
}
}
function applyInner(d,migrated){
if(Array.isArray(d.days)&&d.days.length===7)state.days=d.days.map(x=>({on:!!x.on,fav:x.fav||'',dist:x.dist||'',max:x.max|0}));
if(Array.isArray(d.members))state.members=d.members.filter(m=>m&&typeof m==='object').map(m=>({...m,id:numId(m.id),name:typeof m.name==='string'?m.name:(m.name==null?'':String(m.name)),pool:Number(m.pool)===2?2:1,gender:m.gender==='F'?'F':'M'}));
if(Array.isArray(d.locations))state.locations=d.locations;
if(typeof d.useAllDays==='boolean')state.useAllDays=d.useAllDays;
if(d.bulk)state.bulk=d.bulk;
if(d.pairs&&typeof d.pairs==='object'){
const rs=Array.isArray(d.pairs.rules)?d.pairs.rules:[];
state.pairs={...d.pairs,enabled:!!d.pairs.enabled,mode:d.pairs.mode==='hard'?'hard':'soft',rules:rs.filter(r=>r&&numId(r.a)!=null&&numId(r.b)!=null&&(r.kind==='with'||r.kind==='avoid'||r.kind==='must')).map(r=>{const o={...r,id:numId(r.id),a:numId(r.a),b:numId(r.b),kind:r.kind};if(typeof r.hard!=='boolean')delete o.hard;return o;})};
}
if(Array.isArray(d.goals))state.goals=d.goals.filter(g=>g&&typeof g.id==='number').map(g=>{
const days=Array.isArray(g.days)?g.days:(typeof g.day==='number'&&g.day>=0?[g.day]:[]);
return{id:g.id,on:g.on!==false,mode:g.mode==='custom'?'custom':'pool',size:clamp(Math.round(+g.size)||2,LIM.customSize[0],LIM.customSize[1]),allowed:Array.isArray(g.allowed)?g.allowed:[],loc:g.loc,days:[...new Set(days.filter(x=>Number.isInteger(x)&&x>=0&&x<=6))].sort((a,b)=>a-b),people:Array.isArray(g.people)?g.people:[],exclude:Array.isArray(g.exclude)?g.exclude:[]};
});
if(d.cap)state.cap={mainPerDay:clamp(+d.cap.mainPerDay||2,LIM.perDay[0],LIM.perDay[1]),conPerDay:clamp(+d.cap.conPerDay||1,LIM.perDay[0],LIM.perDay[1]),dayMax:clamp(Math.round(+d.cap.dayMax)||0,LIM.dayMax[0],LIM.dayMax[1]),even:d.cap.even!==false};
if(d.dup&&typeof d.dup==='object')state.dup={spread:d.dup.spread==='free'?'free':'avoid'};
else if(['free','avoid','never'].includes(d.locRepeat))state.dup={spread:d.locRepeat==='free'?'free':'avoid'};
const legacyGender=!d.dup;
state.conflicts=Array.isArray(d.conflicts)?d.conflicts.filter(r=>r&&typeof r.id==='number'&&Array.isArray(r.a)&&Array.isArray(r.b)).map(r=>({id:r.id,on:r.on!==false,a:r.a,b:r.b,scope:['all','pool','members'].includes(r.scope)?r.scope:'all',pool:r.pool===2?2:1,ids:Array.isArray(r.ids)?r.ids:[],hard:r.hard!==false})):[];
if(['balance','prefs','stable'].includes(d.priority))state.priority=d.priority;
if(typeof d.carryWeek==='boolean')state.carryWeek=d.carryWeek;
if(typeof d.gmaxOn==='boolean')state.gmaxOn=d.gmaxOn;
state.gmax=clamp(Math.round(+d.gmax)||2,LIM.gmax[0],LIM.gmax[1]);
if(d.history&&typeof d.history==='object'){
state.history={};state.historyWd={};
for(const k of Object.keys(d.history))if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&d.history[k]&&typeof d.history[k]==='object')state.history[k]=d.history[k];
if(d.historyWd&&typeof d.historyWd==='object')for(const k of Object.keys(d.historyWd))if(state.history[k]&&Array.isArray(d.historyWd[k]))state.historyWd[k]=[...new Set(d.historyWd[k].filter(x=>Number.isInteger(x)&&x>=0&&x<=6))].sort((a,b)=>a-b);
}
const nr=r=>r&&typeof r==='object'?{rest:clamp(Math.round(+r.rest)||0,0,3),maxRun:clamp(Math.round(+r.maxRun)||1,1,3)}:null;
if(d.rest)state.rest=nr(d.rest);
if(typeof d.restCalendar==='boolean')state.restCalendar=d.restCalendar;
if(typeof d.autoRegen==='boolean')state.autoRegen=d.autoRegen;
if(typeof d.minChanges==='boolean')state.minChanges=d.minChanges;
if(typeof d.weekStart==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.weekStart))state.weekStart=d.weekStart;
if(d.view==='day'||d.view==='member')state.view=d.view;
{
const g=d.gender&&typeof d.gender==='object'?d.gender:{},r=g.ratio&&typeof g.ratio==='object'?g.ratio:{};
let a=clamp(Math.round(+r.a)||3,LIM.ratio[0],LIM.ratio[1]),b=clamp(Math.round(+r.b)||1,LIM.ratio[0],LIM.ratio[1]);
if(b>a){const t=a;a=b;b=t;}
state.gender={mode:GENDER_MODES.includes(g.mode)?g.mode:'legacy4',ratio:{a,b},min:clamp(Math.round(+g.min)||1,LIM.genderMin[0],LIM.genderMin[1])};
}
{
const f=d.fair&&typeof d.fair==='object'?d.fair:{};
state.fair={maxSpread:clamp(Math.round(+f.maxSpread)||0,LIM.fairSpread[0],LIM.fairSpread[1]),minEach:clamp(Math.round(+f.minEach)||0,LIM.fairMin[0],LIM.fairMin[1]),mode:f.mode==='hard'?'hard':'soft'};
}
{
const v=d.solver&&typeof d.solver==='object'?d.solver:{};
state.solver={budget:['fast','normal','thorough'].includes(v.budget)?v.budget:'normal',plans:clamp(Math.round(+v.plans)||6,LIM.plans[0],LIM.plans[1]),defaultFlex:v.defaultFlex===true,lockSeed:v.lockSeed===true,seed:Number.isFinite(+v.seed)&&+v.seed>=0?Math.floor(+v.seed)%4294967296:1};
state.digits=d.digits==='latin'?'latin':'arabic';
LATIN=state.digits==='latin';
}
state.weekOverrides={};
if(d.weekOverrides&&typeof d.weekOverrides==='object'){
const dl=a=>Array.isArray(a)?[...new Set(a.map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<=6))].sort((x,y)=>x-y):[];
const mp=o=>{const r={};if(o&&typeof o==='object')for(const k of Object.keys(o)){const v=dl(o[k]);if(v.length&&Number.isFinite(Number(k)))r[k]=v;}return r;};
for(const k of Object.keys(d.weekOverrides)){
const o=d.weekOverrides[k];
if(!/^\d{4}-\d{2}-\d{2}$/.test(k)||!o||typeof o!=='object')continue;
state.weekOverrides[k]={holidays:dl(o.holidays),memberOff:mp(o.memberOff),locClosed:mp(o.locClosed),note:typeof o.note==='string'?o.note.slice(0,80):''};
}
}
state.members.forEach(m=>{m.tags=Array.isArray(m.tags)?[...new Set(m.tags.filter(t=>typeof t==='string'&&t.trim()).map(t=>t.trim().slice(0,20)))].slice(0,12):[];});
state.members.forEach(m=>{if(!Array.isArray(m.off))m.off=[];if(m.pref==null)m.pref='';m.types=['main','contracted'].includes(m.types)?m.types:'any';m.prefDays=Array.isArray(m.prefDays)?[...new Set(m.prefDays.filter(x=>Number.isInteger(x)&&x>=0&&x<=6))]:[];m.vmode=['exact','range'].includes(m.vmode)?m.vmode:'auto';m.vmin=clamp(Math.round(+m.vmin)||0,0,7);m.vmax=clamp(Math.round(+m.vmax)||0,0,7);if(m.vmode==='exact')m.vmax=m.vmin;else if(m.vmax<m.vmin)m.vmax=m.vmin;m.rest=nr(m.rest);m.restCustom=!!m.rest&&(!!m.restCustom||!presetKey(m.rest));});
state.restCustom=!presetKey(state.rest);
state.locations=state.locations.filter(l=>l&&typeof l.id==='number').map(l=>{
const type=l.type==='contracted'?'contracted':'main';
const seats=l.seats&&typeof l.seats==='object'?{1:clamp(Math.round(+l.seats[1]),LIM.seats[0],LIM.seats[1]),2:clamp(Math.round(+l.seats[2]),LIM.seats[0],LIM.seats[1])}:null;
const o={...l,...visitModelOf(l,d,type),type,closed:Array.isArray(l.closed)?[...new Set(l.closed.filter(x=>Number.isInteger(x)&&x>=0&&x<=6))]:[],only:Array.isArray(l.only)?l.only:[],ban:Array.isArray(l.ban)?l.ban:[]};
if(legacyGender&&type==='contracted')o.genderRule=false;
o.genderMode=GENDER_MODES.includes(l.genderMode)?l.genderMode:null;
o.priority=['high','normal','low'].includes(l.priority)?l.priority:'normal';
delete o.minWeek;delete o.maxWeek;delete o.dup;
o.allowedDays=Array.isArray(l.allowedDays)?[...new Set(l.allowedDays.filter(x=>Number.isInteger(x)&&x>=0&&x<=6))].sort((a,b)=>a-b):[];
o.minGap=clamp(Math.round(+l.minGap)||0,LIM.minGap[0],LIM.minGap[1]);
o.needs=Array.isArray(l.needs)?l.needs.filter(n=>n&&typeof n.tag==='string'&&n.tag.trim()).map(n=>({tag:n.tag.trim().slice(0,20),min:clamp(Math.round(+n.min)||1,LIM.needMin[0],LIM.needMin[1])})).slice(0,6):[];
o.seats=seats&&Number.isFinite(seats[1])&&Number.isFinite(seats[2])&&seatsDiffer(o,seats)?seats:null;
return o;
});
state.days.forEach(x=>{x.max=clamp(Math.round(+x.max)||0,LIM.dayCfgMax[0],LIM.dayCfgMax[1]);});
if(!Array.isArray(state.pairs.rules))state.pairs.rules=[];
dedupeIds(state.members);
dedupeIds(state.locations);
dedupeIds(state.goals);
finishVisitModel(d);
dedupeIds(state.conflicts);
state.dayRules=(Array.isArray(d.dayRules)?d.dayRules:[]).filter(r=>r&&typeof r==='object'&&(r.kind==='notSameDay'||r.kind==='sameDay')&&Array.isArray(r.a)&&Array.isArray(r.b)).map(r=>({id:numId(r.id),kind:r.kind,on:r.on!==false,a:[...new Set(r.a.map(Number).filter(Number.isFinite))],b:[...new Set(r.b.map(Number).filter(Number.isFinite))]}));
dedupeIds(state.dayRules);
dedupeIds(state.pairs.rules);
const alive=new Set(state.members.map(m=>m.id));
state.pairs.rules=state.pairs.rules.filter(r=>r&&alive.has(r.a)&&alive.has(r.b));
}

const FLEX_SOFT=['rest','pairs','conflicts'];

function pickPlans(all,want){
want=want||6;
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
fill(all);
picked.sort(comparePlans);
return{picked,sorted:all};
}

return{state,Dinic,LIM,solveNow,capacityInfo,capacity,totalRequested,setTypeVisits,normalizeVisits,improvePlan,emptyReason,checkPlan,planFromRows,withSeed,FAMILIES,cloneEngine,solFromRows,byId,locById,poolName,workingDays,TYPE_SHAPE,DUP_MODES,typeShape,shapeOf,shapeSize,seatsDiffer,teamCap,globalDayMax,dayMaxOf,eligibleFor,genderOK,genderActive,resetCaches,withRelax,goalDays,locMax,compilePairs,compileConflicts,conflictAppliesTo,conflictHit,conflictName,conflictWho,goalLabel,goalIsCustom,customSize,poolWord,seatsFit,compileGoals,goalCounts,PRESETS,presetKey,ruleText,calOn,ruleOf,memberMin,globalMax,memberMax,maxVisitDays,compileMembers,compileModel,dayPos,restOK,goalShape,strictChance,triples,diffPlans,makePlan,evaluatePlan,QW,qualityTerms,qualityScore,rankTuple,comparePlans,FIX,PRIO_RANK,applyDigits,fairActive,fairExcess,compileDayRules,dayRulesHit,gapOf,needsOK,needsActive,pairTeamOK,pairRuleHard,GENDER_MODES,genderCfgOf,weekOv,holidayOn,dayOn,weekOffDays,weekClosedDays,closedOn,offOn,nextId,aliveIds,planKey,DUPL,locName,goalNameById,fixLabel,visitsAcc,saveObject,prevWeekKey,carryPrev,nm,applySaved,pickPlans,FLEX_SOFT,reseed,shuffled,rand};
}

function solve(input,o){
o=o||{};
const saved=JSON.parse(JSON.stringify(input));
const E=createFromSaved(saved,{seed:o.seed});
const sd=o.seed!=null?o.seed:(E.state.solver.lockSeed?E.state.solver.seed:1);
E.reseed(sd);
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

return{solve,SOLVER_MS,DAYS,DAY_SHORT,THU,DISTL,ar,clamp,mulberry32,isoD,baseState,createEngine,createFromSaved,migrate};
});
