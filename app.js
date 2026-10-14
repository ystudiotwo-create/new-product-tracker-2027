(function(){
"use strict";
/* ---------- constants ---------- */
const STAGES={1:'年度方向定案',2:'內部年度新品會議',3:'設計交稿',4:'新品設計確認定稿',5:'打樣確認',6:'包裝設計',7:'商品最終確認',8:'新品上市'};
const DEPTS=['老闆','產品設計','視覺設計','營管-採購','營管-倉管','行銷','業務-電商','業務-國外','業務-顧問'];
const LABELS=['產品PM'].concat(DEPTS);
const WAIT_ON=LABELS.concat(['供應商','外部廠商']);
const DEF_SET={offsets:[7,3,0],overdueDaily:true,escalateDays:3,ccPM:true,decisionDays:3,weeklyDigest:true};
const OFFSET_CHOICES=[14,7,3,1,0];
const CELL=['','active','done','issue'];const CELL_L={'':'未開始',active:'進行中',done:'完成',issue:'有問題'};
const ci=t=>t.map(x=>({t:x,done:false,by:null,at:null}));
const TEMPLATE=[
 {id:'s1',order:1,stage:1,sub:'年度主題、商品類型、售價價格帶；其他計畫：新色、特殊專案',owners:['產品PM','老闆'],start:'2026-06',end:'2026-08',checklist:ci(['確認年度主題','確認商品類型','訂定售價價格帶','規劃新色計畫','規劃特殊專案'])},
 {id:'s2',order:2,stage:2,sub:'新品定案、時程確認',owners:['全公司'],start:'2026-09',end:'2026-10',checklist:ci(['準備新品提案資料','召開內部年度新品會議','新品定案名單','確認全年時程'])},
 {id:'s3',order:3,stage:3,sub:'設計商品交稿',owners:['產品設計'],start:'2026-11',end:'2026-12',checklist:ci(['設計初稿','內部評圖','修正設計','設計商品交稿'])},
 {id:'s4a',order:4,stage:4,sub:'新品定稿',owners:['產品PM','老闆'],start:'2027-01',end:'2027-01',checklist:ci(['定稿審查會議','確認規格與材質','老闆核准定稿'])},
 {id:'s4b',order:5,stage:4,sub:'通知打樣（年前發打樣）',owners:['營管-採購'],start:'2027-02',end:'2027-02',due:'2027-02-05',checklist:ci(['整理打樣規格','聯繫供應商報價','農曆年前發出打樣'])},
 {id:'s5a',order:6,stage:5,sub:'一次打樣（含測試及調整）',owners:['營管-採購','產品設計','產品PM'],start:'2027-03',end:'2027-03',checklist:ci(['收到一次打樣','功能與品質測試','彙整調整意見','回覆供應商'])},
 {id:'s5b',order:7,stage:5,sub:'二次打樣（含測試及調整）',owners:['營管-採購','產品設計','產品PM'],start:'2027-04',end:'2027-04',checklist:ci(['收到二次打樣','功能與品質測試','確認可量產'])},
 {id:'s6',order:8,stage:6,sub:'包裝設計（含需求確認：條碼、外包裝所需資訊）',owners:['產品PM','視覺設計'],start:'2027-03',end:'2027-04',checklist:ci(['確認包裝需求','申請條碼','彙整外包裝資訊','包裝設計稿','包裝打樣確認'])},
 {id:'s7a',order:9,stage:7,sub:'成品及包裝最終確認',owners:['產品設計','產品PM','老闆'],start:'2027-05',end:'2027-05',checklist:ci(['成品確認','包裝確認','老闆最終核准'])},
 {id:'s7b',order:10,stage:7,sub:'大貨下單（含包裝）',owners:['營管-採購'],start:'2027-06',end:'2027-08',checklist:ci(['大貨下單','包裝下單','生產進度追蹤','到貨驗收'])},
 {id:'s8',order:11,stage:8,sub:'新品上市',owners:['行銷','業務-電商','營管-倉管','業務-國外','業務-顧問'],start:'2027-09',end:'2027-09',checklist:ci(['上架資料與商品照','通路鋪貨','新品上市'])}
];
/* project types: internal runs on the annual stage plan; external / gift projects carry their own dated stages */
const PTYPES={
 internal:{l:'內部新品開發',hint:'從市場調查、設計、打樣到量產上市，耗時最長，依年度計畫約 12–16 個月。'},
 external:{l:'外部設計案',hint:'目標明確的中長期設計案，預設約 4–5 個月。填客戶交期時，各階段會依比例排進交期內。',
   stages:[['e1','需求訪談與簽約',10],['e2','概念提案',21],['e3','設計發展',28],['e4','打樣與測試',28],['e5','修正定稿',14],['e6','量產與交付',35]]},
 gift:{l:'企禮客製案',hint:'時程短，視客戶需求而定，預設約 6 週。建議填客戶交期，系統會從交期倒推各階段。',
   stages:[['g1','需求確認與報價',3],['g2','設計提案',5],['g3','客戶確認',3],['g4','打樣確認',7],['g5','生產製作',21],['g6','包裝出貨',3]]}
};
const TYPE_KEYS=['internal','external','gift'];
const LAUNCH=new Date(2027,8,1);
const BASE_Y=2026,BASE_M=6,NM=16;

/* ---------- state ---------- */
const clone=o=>JSON.parse(JSON.stringify(o));
const S={tasks:clone(TEMPLATE),notes:[],files:[],products:[],people:{},claims:{},settings:null,logs:[],mode:'loading',
  db:null,user:null,assets:null,me:null,isOwner:false,isAdmin:false,canWrite:null,names:{},
  view:'mine',filter:'',gProd:'',open:null,openProd:null,openProj:null,tab:'all',allType:'',showClosed:false,composeKind:'comment',drafts:{},form:null,editDates:false,setDraft:null};
try{const v=localStorage.getItem('np-view');if(v)S.view=v;}catch(e){}

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAY=864e5;
function today(){const d=new Date();d.setHours(0,0,0,0);return d;}
function ym(s){const [y,m]=s.split('-').map(Number);return {y,m};}
function pd(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function mIdx(s){const {y,m}=ym(s);return (y-BASE_Y)*12+(m-BASE_M);}
function som(s){const {y,m}=ym(s);return new Date(y,m-1,1);}
function eom(s){const {y,m}=ym(s);return new Date(y,m,0);}
const tStart=t=>som(t.start);
const tEnd=t=>t.due?pd(t.due):eom(t.end);
const bStart=t=>som(t.baseStart||t.start);
const bEnd=t=>t.baseDue?pd(t.baseDue):(t.baseEnd?eom(t.baseEnd):(t.baseStart?eom(t.baseStart):tEnd(t)));
const hasBase=t=>!!t.baseEnd;
function slip(t){return hasBase(t)?days(bEnd(t),tEnd(t)):0;}
function days(a,b){return Math.round((b-a)/DAY);}
function workdays(fromTs,to){let d=new Date(fromTs);d.setHours(0,0,0,0);let n=0;while(d<to){d.setDate(d.getDate()+1);const w=d.getDay();if(w!==0&&w!==6&&d<=to)n++;}return n;}
function md(d){return (d.getMonth()+1)+'/'+d.getDate();}
function ymd(d){return d.getFullYear()+'/'+md(d);}
function stamp(ts){const d=new Date(ts);return md(d)+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function isoWeek(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const n=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-n);const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y)/DAY+1)/7);}
function prog(t){if(t.locked)return 100;const n=t.checklist.length;return n?Math.round(t.checklist.filter(c=>c.done).length/n*100):0;}
function itemDue(t,i){const c=t.checklist[i];if(c.due)return {d:pd(c.due),sug:false};const s=tStart(t),e=tEnd(t),n=t.checklist.length;const d=new Date(s.getTime()+Math.round((e-s)*(i+1)/n/DAY)*DAY);d.setHours(0,0,0,0);return {d,sug:true};}
const settings=()=>({...DEF_SET,...(S.settings||{})});
function status(t){
  const td=today();
  if(t.locked)return {k:'lock',l:'已定案'};
  if(t.review){const w=t.reviewAt?workdays(t.reviewAt,td):0;const lim=settings().decisionDays;return {k:'review',l:`待決策 ${w} 個工作天`,w,late:w>=lim};}
  const e=tEnd(t);const over=td>e&&prog(t)<100;
  if(t.blocked)return {k:'blocked',l:'卡住 · 等'+t.blocked.waitingOn,over,d:over?days(e,td):0};
  if(prog(t)===100)return {k:'done',l:'已完成，待提交'};
  if(over)return {k:'over',l:'逾期 '+days(e,td)+' 天',d:days(e,td),over:true};
  if(td>=tStart(t))return {k:'active',l:'進行中'};
  return {k:'todo',l:'未開始'};
}
const lockSvg=()=>'<svg width="10" height="11" viewBox="0 0 10 11" aria-hidden="true"><rect x="1" y="5" width="8" height="6" rx="1" fill="currentColor"/><path d="M3 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
function pill(st){return `<span class="pill p-${st.k}${st.late?' late':''}">${st.k==='lock'?lockSvg():''}${esc(st.l)}</span>`+(st.k==='blocked'&&st.over?` <span class="pill p-over">逾期 ${st.d} 天</span>`:'');}
const slipPill=t=>{const s=slip(t);return s>0?`<span class="pill p-slip">延後 ${s} 天</span>`:'';};
const stageColor=n=>`var(--c${n})`;
const ownersTxt=t=>t.owners.length?t.owners.join('・'):'—';
const nm=id=>id?(S.names[id]||'某位同事'):'某位同事';
function toast(msg){const el=$('#toast');el.textContent=msg;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3200);}
const live=()=>S.mode==='live';
const person=id=>id&&S.people[id]?{id,...S.people[id]}:null;
const myM=()=>S.me?person(S.claims[S.me]):null;
const myDept=()=>myM()?.dept||null;
const matchL=(p,l)=>!!p&&(l==='全公司'||p.dept===l||(l==='產品PM'&&!!p.pm));
const isBoss=()=>myDept()==='老闆';
const isMgr=()=>isBoss()||!!myM()?.pm||S.isOwner;
const canAct=()=>live()&&S.canWrite!==false&&(!!myM()||S.isOwner);
const sorted=()=>S.tasks.slice().sort((a,b)=>a.order-b.order);
const memberList=()=>Object.entries(S.people).map(([id,m])=>({id,...m})).sort((a,b)=>(a.order||0)-(b.order||0));
const pname=id=>S.people[id]?.name||'未指定';
function inScope(t,view){
  if(view==='all')return true;
  if(view==='mine'){const p=myM();return !!p&&(t.lead===p.id||t.owners.some(l=>matchL(p,l)));}
  return t.owners.includes(view)||t.owners.includes('全公司');
}
const leadTxt=t=>t.lead?pname(t.lead):'未指定';
/* ---------- projects of every type, normalised for the overview ---------- */
const pType=p=>PTYPES[p.type]?p.type:'internal';
const isInternal=p=>pType(p)==='internal';
const internalProds=()=>S.products.filter(isInternal);
const typedProjs=ty=>S.products.filter(p=>pType(p)===ty);
const typeBadge=ty=>`<span class="tb tb-${ty}">${esc(PTYPES[ty].l)}</span>`;
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
// spread a type's template stages from start; with a due date, scale them to end exactly on it
function genStages(ty,start,due){
  const tpl=PTYPES[ty].stages,total=tpl.reduce((a,x)=>a+x[2],0);
  const avail=due?days(start,due)+1:total;let prev=0,cum=0;
  return tpl.map(([k,n,d],i)=>{cum+=d;let b=Math.round(cum/total*avail);b=Math.max(b,prev+1);b=Math.min(b,avail-(tpl.length-1-i));
    const st={k,n,start:iso(addDays(start,prev)),end:iso(addDays(start,b-1)),v:''};prev=b;return st;});
}
const tplDays=ty=>PTYPES[ty].stages.reduce((a,x)=>a+x[2],0);
function normProj(p){
  let st;
  if(isInternal(p)){const c=p.cells||{};st=prodCols().map(t=>({k:t.id,n:t.sub,s:pStart(p,t),e:pEnd(p,t),v:c[t.id]||''}));}
  else st=(p.stages||[]).map(x=>({k:x.k,n:x.n,s:pd(x.start),e:pd(x.end),v:x.v||''}));
  const td=today();st.forEach(x=>x.late=!p.dropped&&x.v!=='done'&&td>x.e);
  const done=st.filter(x=>x.v==='done').length;
  const start=st.length?new Date(Math.min(...st.map(x=>x.s))):td,end=st.length?new Date(Math.max(...st.map(x=>x.e))):td;
  const cur=st.find(x=>x.v!=='done')||null;
  const lateD=Math.max(0,...st.filter(x=>x.late).map(x=>days(x.e,td)));
  let state;
  if(p.dropped)state={k:'todo',l:'已停止'};
  else if(st.length&&done===st.length)state={k:'done',l:'已完成'};
  else if(st.some(x=>x.v==='issue'))state={k:'blocked',l:'有問題'};
  else if(lateD>0)state={k:'over',l:'逾期 '+lateD+' 天'};
  else if(td<start)state={k:'todo',l:'未開始'};
  else state={k:'active',l:'進行中'};
  return {p,type:pType(p),name:p.name,stages:st,start,end,done,total:st.length,cur,state,
    closed:!!p.dropped||(st.length>0&&done===st.length),due:p.due?pd(p.due):end};
}
// the annual stage plan is not a project of its own: internal products already carry its stages
const allProjects=()=>S.products.map(normProj);
const openAttr=P=>isInternal(P.p)?`data-prod="${esc(P.p.id)}"`:`data-proj="${esc(P.p.id)}"`;
const pcolOrder=P=>(P.state.k==='over'||P.state.k==='blocked'?0:1);
const sortProj=list=>list.slice().sort((a,b)=>(a.closed-b.closed)||(pcolOrder(a)-pcolOrder(b))||(a.due-b.due));

/* ---------- date timeline shared by the overview and type tabs ---------- */
function dateGantt(list,labelHead){
  if(!list.length)return '<div class="empty" style="margin:12px">沒有符合的專案。</div>';
  const td=today();
  let lo=new Date(Math.min(td,...list.map(P=>P.start))),hi=new Date(Math.max(td,...list.map(P=>P.end)));
  const weekly=days(lo,hi)<=120;const cols=[];
  if(weekly){lo=addDays(lo,-((lo.getDay()+6)%7));hi=addDays(hi,7-((hi.getDay()+6)%7));for(let d=new Date(lo);d<hi;d=addDays(d,7))cols.push({d,l:(cols.length===0||d.getDate()<=7&&d.getMonth()===0?`<b>${d.getFullYear()}</b>`:'')+md(d)});}
  else{lo=new Date(lo.getFullYear(),lo.getMonth(),1);hi=new Date(hi.getFullYear(),hi.getMonth()+1,1);for(let d=new Date(lo);d<hi;d=new Date(d.getFullYear(),d.getMonth()+1,1))cols.push({d,l:(cols.length===0||d.getMonth()===0?`<b>${d.getFullYear()}</b>`:'')+(d.getMonth()+1)+'月'});}
  const span=days(lo,hi);const pct=d=>days(lo,d)/span*100;
  const tw=cols.length*(weekly?60:64);
  const lines=cols.map(c=>`<i style="left:${pct(c.d)}%"></i>`).join('')+(td>=lo&&td<hi?`<i class="today" style="left:${pct(td)}%" title="今天 ${md(td)}"></i>`:'');
  let h=`<div class="dgw" style="--label:260px;--tw:${tw}px"><div class="dg" style="--tw:${tw}px"><div class="dg-hl">${esc(labelHead)}</div><div class="dg-hd">${cols.map((c,i)=>`<span style="left:${pct(c.d)}%;width:${(i+1<cols.length?pct(cols[i+1].d):100)-pct(c.d)}%">${c.l}</span>`).join('')}</div>`;
  list.forEach(P=>{
    const oa=openAttr(P);
    h+=`<div class="dg-lab"><div class="row" style="gap:6px;flex-wrap:nowrap;min-width:0">${typeBadge(P.type)}<button class="linkbtn" ${oa} style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(P.name)}</button></div><div class="sub">${P.p.client?esc(P.p.client)+' · ':''}${P.cur&&!P.p.dropped?'目前：'+esc(P.cur.n):esc(P.state.l)} · ${md(P.end)} 完成</div></div><div class="dg-tr">`+
      P.stages.map(x=>{const a=pct(x.s),b=pct(addDays(x.e,1));const cls=x.late?'s-late':x.v?'s-'+x.v:'';
        return `<button class="dg-seg ${cls}" ${oa} style="left:${a}%;width:calc(${b-a}% - 1px)" title="${esc(P.name)}｜${esc(x.n)}｜${ymd(x.s)}–${ymd(x.e)}｜${x.late?'逾期':CELL_L[x.v]}">${esc(x.n)}</button>`;}).join('')+'</div>';
  });
  return h+`</div><div class="dg-lines" style="--label:260px">${lines}</div></div>`;
}
const dgLegend=()=>[['','未開始'],['s-active','進行中'],['s-done','完成'],['s-issue','有問題'],['s-late','逾期']].map(([c,l])=>`<span class="lg-seg"><i class="dg-seg ${c}"></i>${l}</span>`).join('')+'<span class="lg-seg"><i style="width:2px;background:var(--danger)"></i>今天</span>';

/* per-product schedule: p.sched[taskId]={start,end} overrides the annual stage dates */
const prodCols=()=>sorted().filter(t=>t.stage>=3);
function pSched(p,t){const s=p.sched&&p.sched[t.id];return s&&s.start&&s.end?{start:s.start,end:s.end,custom:true}:{start:t.start,end:t.end,custom:false};}
const pStart=(p,t)=>som(pSched(p,t).start);
const pEnd=(p,t)=>{const s=pSched(p,t);return s.custom?eom(s.end):tEnd(t);};
const pLate=(p,t)=>!p.dropped&&(p.cells||{})[t.id]!=='done'&&today()>pEnd(p,t);
function mRange(a,b){const A=ym(a),B=ym(b);if(a===b)return A.y+'/'+A.m;return A.y===B.y?`${A.y}/${A.m}–${B.m}`:`${A.y}/${A.m}–${B.y}/${B.m}`;}
function addMonths(s,n){const {y,m}=ym(s);const d=new Date(y,m-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}

/* ---------- reminder engine (same rules the daily email uses) ---------- */
function reminders(){
  const set=settings(),td=today(),out={};
  const mem=memberList();const byDept=l=>mem.filter(m=>matchL(m,l));
  const pms=byDept('產品PM'),boss=byDept('老闆');
  const resp=t=>t.lead&&S.people[t.lead]?[person(t.lead)]:mem.filter(m=>t.owners.some(l=>matchL(m,l)));
  const add=(list,t,txt,kind)=>list.forEach(m=>{(out[m.id]??={m,items:[]}).items.push({t,txt,kind});});
  for(const t of sorted()){
    if(t.locked)continue;
    if(t.review){const w=t.reviewAt?workdays(t.reviewAt,td):0;if(w>=set.decisionDays)add(boss,t,`已等待你決策 ${w} 個工作天（時限 ${set.decisionDays} 天）`,'over');continue;}
    const r=resp(t);
    if(t.blocked&&LABELS.includes(t.blocked.waitingOn))add(byDept(t.blocked.waitingOn),t,`有人在等你：${t.blocked.reason}`,'block');
    if(prog(t)===100)continue;
    const d=days(td,tEnd(t));
    if(d>=0&&set.offsets.includes(d)){add(r,t,d===0?'今天截止':`${d} 天後截止（${md(tEnd(t))}）`,'due');if(set.ccPM&&d<=3)add(pms.filter(p=>!r.some(x=>x.id===p.id)),t,`副本：${d===0?'今天':d+' 天後'}截止，主責 ${leadTxt(t)}`,'cc');}
    if(d<0&&set.overdueDaily){add(r,t,`已逾期 ${-d} 天`,'over');if(-d>=set.escalateDays)add(boss.filter(b=>!r.some(x=>x.id===b.id)),t,`逾期 ${-d} 天，主責 ${leadTxt(t)}`,'over');}
    if(td>=tStart(t))t.checklist.forEach((c,i)=>{if(c.done||!c.due)return;const dd=days(td,pd(c.due));if(dd<0)add(r,t,`檢查項目「${c.t}」已逾期 ${-dd} 天`,'over');else if(set.offsets.includes(dd))add(r,t,`檢查項目「${c.t}」${dd===0?'今天':dd+' 天後'}到期`,'due');});
  }
  return Object.values(out);
}

/* ---------- render: hero ---------- */
function renderHero(){
  const td=today();
  const ws=new Date(td);ws.setDate(td.getDate()-((td.getDay()+6)%7));const we=new Date(ws);we.setDate(ws.getDate()+6);
  $('#weekLabel').textContent=`${td.getFullYear()} 年第 ${isoWeek(td)} 週 · ${md(ws)}–${md(we)}`;
  const ts=sorted();
  const cur=ts.filter(t=>!t.locked&&td>=tStart(t)).sort((a,b)=>tEnd(a)-tEnd(b))[0]||ts.find(t=>!t.locked);
  $('#heroTitle').textContent=cur?`現在進行：${STAGES[cur.stage]}`:(ts.length?'全部階段已定案':'尚未建立年度專案');
  const all=ts.flatMap(t=>t.locked?t.checklist.map(()=>({done:true})):t.checklist);
  const overall=all.length?Math.round(all.filter(c=>c.done).length/all.length*100):0;
  const over=ts.filter(t=>status(t).over).length,blk=ts.filter(t=>t.blocked&&!t.locked).length,rv=ts.filter(t=>t.review).length;
  const left=cur?days(td,tEnd(cur)):0;
  $('#stats').innerHTML=`
   <div class="stat hot"><div class="k">距離新品上市</div><div class="v num">${days(td,LAUNCH)}<small>天</small></div><div class="s">2027/9 上市</div></div>
   <div class="stat"><div class="k">本階段剩餘</div><div class="v num">${cur?Math.max(left,0):'—'}<small>天</small></div><div class="s">${cur?esc(cur.sub)+' · 截止 '+md(tEnd(cur)):'—'}</div></div>
   <div class="stat"><div class="k">整體完成</div><div class="v num">${overall}<small>%</small></div><div class="bar" style="margin-top:8px"><i style="width:${overall}%"></i></div></div>
   <div class="stat"><div class="k">需要處理</div><div class="v num" style="color:${over?'var(--danger)':'inherit'}">${over}<small>逾期</small></div><div class="s">${blk} 項卡住 · ${rv} 項待決策</div></div>`;
  let b='';
  if(S.mode==='loading')b='<div class="banner">正在連線同步資料，目前顯示年度範本。</div>';
  else if(S.mode==='offline')b='<div class="banner warn">此檢視無法連線到共用資料，以下為年度範本預覽，勾選與留言不會儲存。</div>';
  else if(!S.tasks.length)b=`<div class="banner"><span>這份專案還沒有任務。匯入 2026/6–2027/9 年度範本後就能開始使用。</span>${S.isOwner?'<button class="btn primary sm" data-act="import">匯入年度範本</button>':''}</div>`;
  else if(S.canWrite===false)b='<div class="banner warn">你目前是檢視權限，可以看進度，但無法勾選或留言。請向擁有者申請「協作者」權限。</div>';
  else if(S.me&&!myM()&&memberList().length){const free=memberList().filter(p=>!Object.values(S.claims).includes(p.id));
    b=`<div class="banner"><span><b>第一次使用：請選擇你是誰。</b>綁定後才能勾選、留言，並看到自己的待辦。</span><span class="row"><label for="claimSel" class="vh">選擇你的名字</label><select id="claimSel"><option value="">選擇你的名字</option>${free.map(p=>`<option value="${p.id}">${esc(p.name)}（${esc(p.dept)}${p.pm?'・產品PM':''}）</option>`).join('')}</select><button class="btn primary sm" data-act="claim">確認</button></span></div>`;}
  $('#banner').innerHTML=b;
}

/* ---------- render: workbench ---------- */
function renderBench(){
  const m=myM();
  $('#whoami').innerHTML=m?`你是 <b>${esc(m.name)}</b> · <b>${esc(m.dept)}</b>${m.pm?' · 產品PM':''}${isBoss()?' · 可核准定案':''}`:(live()?'尚未選擇你是誰，以下顯示全部任務。':'');
  if(!m&&S.view==='mine')S.view='all';
  const views=[['mine','我的'],['all','全部']].concat(LABELS.map(d=>[d,d]));
  $('#roles').innerHTML='<span>檢視</span>'+views.filter(v=>v[0]!=='mine'||m).map(([k,l])=>`<button class="chip" aria-pressed="${k===S.view}" data-view="${esc(k)}">${esc(l)}</button>`).join('');
  const td=today();const ts=sorted();const mine=ts.filter(t=>inScope(t,S.view));
  const items=mine.flatMap(t=>t.locked?t.checklist.map(()=>({done:true})):t.checklist);
  const rate=items.length?Math.round(items.filter(c=>c.done).length/items.length*100):0;
  $('#deptRate').innerHTML=`<div class="stat" style="min-width:200px"><div class="k">${S.view==='mine'?'我的':S.view==='all'?'全部':esc(S.view)}完成率</div><div class="v num">${rate}<small>%</small></div><div class="bar" style="margin-top:8px"><i style="width:${rate}%"></i></div></div>`;
  // week
  const we=new Date(td);we.setDate(td.getDate()+(7-((td.getDay()+6)%7))-1);
  const act=mine.filter(t=>!t.locked&&!t.review&&td>=tStart(t)&&prog(t)<100).sort((a,b)=>{const ra=status(a).over?0:1,rb=status(b).over?0:1;return ra-rb||tEnd(a)-tEnd(b);});
  let n=0;
  $('#wk').innerHTML=act.length?act.map(t=>{
    const st=status(t);const left=days(td,tEnd(t));
    let open=t.checklist.map((c,i)=>({c,i,due:itemDue(t,i)})).filter(x=>!x.c.done);
    let due=open.filter(x=>x.due.d<=we);const nextOnly=!due.length;if(nextOnly)due=open.slice(0,1);n+=due.length;
    return `<div class="todo ${st.k==='blocked'?'blocked':st.over?'over':''}">
      <div class="meta"><span>${esc(STAGES[t.stage])} · 主責 ${esc(leadTxt(t))}</span>${st.k==='active'?`<span class="num">剩 ${left} 天 · 截止 ${md(tEnd(t))}</span>`:pill(st)}</div>
      <button class="ttl" data-open="${t.id}">${esc(t.sub)}</button>
      ${t.blocked?`<div class="sub">卡住：${esc(t.blocked.reason)}</div>`:''}
      ${due.map(x=>checkItem(t,x.i,nextOnly?'下一步':'')).join('')}
    </div>`;}).join(''):'<div class="empty">這週沒有進行中的任務。看看右邊「下個月開始」先做準備。</div>';
  $('#wkCount').textContent=n?n+' 項':'';
  // needs me
  let dec=[];
  if(isBoss()){
    dec=dec.concat(ts.filter(t=>t.review).sort((a,b)=>(a.reviewAt||0)-(b.reviewAt||0)).map(t=>({t,txt:`提交審核，${status(t).l}`,late:status(t).late})));
    dec=dec.concat(ts.filter(t=>t.changeRequest).map(t=>({t,txt:'變更申請：'+t.changeRequest.reason})));
  }
  if(m)dec=dec.concat(ts.filter(t=>t.blocked&&!t.locked&&matchL(m,t.blocked.waitingOn)).map(t=>({t,txt:`${nm(t.blocked.by)} 在等你：${t.blocked.reason}`,blk:true})));
  dec=dec.concat(mine.filter(t=>status(t).k==='done').map(t=>({t,txt:'檢查清單已全部完成，可以提交審核'})));
  if(!isBoss())dec=dec.concat(mine.filter(t=>t.review).map(t=>({t,txt:`已提交，${status(t).l}`})));
  $('#decTitle').textContent=isBoss()?'待我決策':'等我處理';
  $('#dec').innerHTML=dec.length?dec.map(x=>`<div class="todo ${x.late?'over':x.blk?'blocked':''}"><div class="meta"><span>${esc(STAGES[x.t.stage])}</span>${pill(status(x.t))}</div><button class="ttl" data-open="${x.t.id}">${esc(x.t.sub)}</button><div class="sub">${esc(x.txt)}</div></div>`).join(''):`<div class="empty">${isBoss()?'目前沒有等你核准的項目。':'目前沒有等你處理的事。'}</div>`;
  const mStart=new Date(td.getFullYear(),td.getMonth(),1),mEnd=new Date(td.getFullYear(),td.getMonth()+1,0);
  const mo=mine.filter(t=>tStart(t)<=mEnd&&tEnd(t)>=mStart);
  $('#moCount').textContent=mo.length?mo.length+' 項':'';
  $('#mo').innerHTML=mo.length?mo.map(taskRow).join(''):'<div class="empty">本月沒有任務。</div>';
  const nStart=new Date(td.getFullYear(),td.getMonth()+1,1),nEnd=new Date(td.getFullYear(),td.getMonth()+2,0);
  const nx=mine.filter(t=>tStart(t)>=nStart&&tStart(t)<=nEnd);
  $('#next').innerHTML=nx.length?nx.map(taskRow).join(''):'<div class="empty">下個月沒有新開始的任務。</div>';
}
function taskRow(t){const p=prog(t);return `<div class="row-task"><div class="top-line"><button class="linkbtn" data-open="${t.id}">${esc(t.sub)}</button>${pill(status(t))}</div><div class="sub">${esc(STAGES[t.stage])} · 主責 ${esc(leadTxt(t))} · ${t.start.replace('-','/')} – ${t.end.replace('-','/')}</div><div class="bar"><i style="width:${p}%"></i></div></div>`;}
function checkItem(t,i,tag){
  const c=t.checklist[i];const done=t.locked||c.done;const dis=t.locked||!canAct();
  const due=itemDue(t,i);const late=!done&&due.d<today();
  const dueTxt=`${tag?tag+' · ':''}${due.sug?'建議 ':''}${md(due.d)}${late?' · 逾期 '+days(due.d,today())+' 天':''}`;
  const edit=S.editDates&&S.open===t.id&&isMgr()&&!t.locked;
  return `<label class="check ${done?'done':''}"><input type="checkbox" id="ck-${t.id}-${i}" data-task="${t.id}" data-i="${i}" ${done?'checked':''} ${dis?'disabled':''}><span class="ct"><span>${esc(c.t)}</span>
    ${done&&c.at?`<small>${esc(nm(c.by))} · ${stamp(c.at)}</small>`:edit?`<small><input type="date" class="due-in" id="due-${t.id}-${i}" data-due-task="${t.id}" data-i="${i}" value="${c.due||''}" aria-label="${esc(c.t)} 到期日"> ${c.due?'':'（目前為建議 '+md(due.d)+'）'}</small>`:`<small class="${late?'late':''}">${esc(dueTxt)}</small>`}</span></label>`;
}

/* ---------- render: gantt ---------- */
function renderGantt(){
  const sel=$('#fDept');if(sel.options.length===1)LABELS.forEach(d=>sel.add(new Option(d,d)));
  sel.value=S.filter;
  $('#legend').innerHTML=[['lock','已定案'],['active','進行中'],['over','逾期'],['blocked','卡住']].map(([k,l])=>`<span class="pill p-${k}">${k==='lock'?lockSvg():''}${l}</span>`).join('')+'<span class="lg-base"><i></i>原訂時程</span>';
  const ps=internalProds().sort((a,b)=>(a.order||0)-(b.order||0));
  const ps_=$('#fProd');ps_.innerHTML='<option value="">年度階段</option>'+ps.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.dropped?'（停止開發）':''}</option>`).join('');
  const gp=ps.find(p=>p.id===S.gProd)||null;if(!gp)S.gProd='';ps_.value=S.gProd;
  const td=today();
  const curIdx=(td.getFullYear()-BASE_Y)*12+(td.getMonth()+1-BASE_M);
  const dim=new Date(td.getFullYear(),td.getMonth()+1,0).getDate();
  const todayPct=((curIdx+(td.getDate()-1)/dim)/NM)*100;
  const showToday=curIdx>=0&&curIdx<NM;
  const clampI=i=>Math.max(0,Math.min(NM,i));
  let h=`<div class="g-h left" style="grid-column:1/3"></div><div class="g-h years"><div>2026</div><div>2027</div></div>
   <div class="g-cellh" style="position:sticky;left:0;z-index:3;border-right:1px solid var(--line)">項目 / 次項目 / 主責</div><div class="g-cellh">負責單位</div>
   <div class="months">${Array.from({length:NM},(_,i)=>`<div class="${i===curIdx?'now':''}">${((BASE_M-1+i)%12)+1}月</div>`).join('')}</div>`;
  const ts=(gp?prodCols():sorted()).filter(t=>!S.filter||t.owners.includes(S.filter)||t.owners.includes('全公司'));
  const todayHtml=ri=>showToday?`<div class="today" style="left:${todayPct}%"></div>${ri===0?`<div class="today-tag" style="left:${todayPct}%">今天 ${md(td)}</div>`:''}`:'';
  let prev=0;
  if(gp){
    const cells=gp.cells||{};
    ts.forEach((t,ri)=>{
      const sc=pSched(gp,t),v=cells[t.id]||'',late=pLate(gp,t);
      const a=clampI(mIdx(sc.start)),b=clampI(mIdx(sc.end)+1);
      const first=t.stage!==prev;prev=t.stage;
      let base='';
      if(sc.custom&&(sc.start!==t.start||sc.end!==t.end)){const ba=clampI(mIdx(t.start)),bb=clampI(mIdx(t.end)+1);base=`<div class="g-base" style="left:calc(${ba/NM*100}% + 1px);width:calc(${(bb-ba)/NM*100}% - 2px)"></div>`;}
      const lbl=late?'逾期 '+days(pEnd(gp,t),td)+' 天':CELL_L[v];
      h+=`<div class="g-lab">${first?`<div class="stg"><b>${t.stage}</b>${esc(STAGES[t.stage])}</div>`:''}<div class="s">${esc(t.sub)}</div><div class="s">${esc(mRange(sc.start,sc.end))}${sc.custom?' · <em>自訂</em>':' · 同年度時程'}</div></div>
       <div class="g-own">${esc(ownersTxt(t))}</div>
       <div class="g-track ${ri===0?'first':''}">
         ${base}${todayHtml(ri)}
         <button class="g-bar ${v==='issue'?'blocked':late?'over':''}" style="--stage:${stageColor(t.stage)};left:calc(${a/NM*100}% + 3px);width:calc(${(b-a)/NM*100}% - 6px)" data-prod="${gp.id}" aria-label="${esc(gp.name)} ${esc(t.sub)}，${esc(lbl)}">
           <i style="width:${v==='done'?100:v==='active'?50:0}%"></i><span>${esc(lbl)}</span>
         </button>
       </div>`;
    });
    if(!ts.length)h+=`<div class="g-lab" style="grid-column:1/-1;position:static"><div class="s">沒有符合篩選的任務。</div></div>`;
    $('#ganttGrid').innerHTML=h;return;
  }
  ts.forEach((t,ri)=>{
    const st=status(t),p=prog(t);
    const a=clampI(mIdx(t.start)),b=clampI(mIdx(t.end)+1);
    const first=t.stage!==prev;prev=t.stage;
    const s=slip(t);
    let base='';
    if(hasBase(t)&&(t.baseStart!==t.start||t.baseEnd!==t.end)){const ba=clampI(mIdx(t.baseStart)),bb=clampI(mIdx(t.baseEnd)+1);base=`<div class="g-base" style="left:calc(${ba/NM*100}% + 1px);width:calc(${(bb-ba)/NM*100}% - 2px)"></div>`;}
    h+=`<div class="g-lab">${first?`<div class="stg"><b>${t.stage}</b>${esc(STAGES[t.stage])}</div>`:''}<div class="s">${esc(t.sub)}</div><div class="s">主責 <em>${esc(leadTxt(t))}</em>${s>0?` · <span style="color:var(--danger)">延後 ${s} 天</span>`:''}</div></div>
     <div class="g-own">${esc(ownersTxt(t))}</div>
     <div class="g-track ${ri===0?'first':''}">
       ${base}
       ${todayHtml(ri)}
       <button class="g-bar ${st.k==='blocked'?'blocked':st.over?'over':''} ${t.locked?'lock':''}" style="--stage:${stageColor(t.stage)};left:calc(${a/NM*100}% + 3px);width:calc(${(b-a)/NM*100}% - 6px)" data-open="${t.id}" aria-label="${esc(t.sub)}，${esc(st.l)}，完成 ${p}%">
         <i style="width:${p}%"></i><span>${t.locked?lockSvg():''}${p}%</span>
       </button>
     </div>`;
  });
  if(!ts.length)h+=`<div class="g-lab" style="grid-column:1/-1;position:static"><div class="s">沒有符合篩選的任務。</div></div>`;
  $('#ganttGrid').innerHTML=h;
}

/* ---------- render: products ---------- */
function renderProducts(){
  const cols=prodCols();
  const ps=internalProds().sort((a,b)=>(a.order||0)-(b.order||0));
  const activeN=ps.filter(p=>!p.dropped).length,dropN=ps.length-activeN;
  const lateN=ps.filter(p=>cols.some(t=>pLate(p,t))).length;
  $('#prodSummary').innerHTML=ps.length?`<div class="stat" style="min-width:200px"><div class="k">今年新品</div><div class="v num">${activeN}<small>款開發中</small></div><div class="s">${dropN?dropN+' 款停止開發':'沒有停止開發的品項'}${lateN?` · <span style="color:var(--danger)">${lateN} 款有階段逾期</span>`:''}</div></div>`:'';
  const mg=isMgr()&&canAct(),ed=canAct();
  let h='';
  if(!ps.length){h=`<div class="empty">還沒有新品名單。第 2 階段「新品定案名單」完成後，${mg?'在下方輸入品名逐款加入。':'請產品PM 把定案的品項加進來。'}</div>`;}
  else{
    h=`<div class="pscroll"><table class="pm"><thead><tr><th scope="col">品項</th>${cols.map(t=>`<th scope="col">${esc(t.sub.replace(/（.*?）/g,''))}</th>`).join('')}</tr></thead><tbody>`+
    ps.map(p=>{const cells=p.cells||{};const done=cols.filter(t=>cells[t.id]==='done').length;
      return `<tr class="${p.dropped?'dropped':''}"><td><button class="linkbtn" data-prod="${p.id}" aria-label="${esc(p.name)} 時程">${esc(p.name)}</button><div class="sub">${p.dropped?'停止開發':`完成 ${done}/${cols.length}`}${mg?` · <button class="linkbtn sub" style="font-weight:500" data-drop="${p.id}">${p.dropped?'恢復開發':'停止開發'}</button>`:''}</div></td>`+
      cols.map(t=>{const v=cells[t.id]||'';const sc=pSched(p,t),late=pLate(p,t);return `<td><button class="cell ${v}" data-cell="${p.id}" data-t="${t.id}" ${ed&&!p.dropped?'':'disabled'} aria-label="${esc(p.name)} ${esc(t.sub)}：${CELL_L[v]}">${CELL_L[v]}</button><div class="cd${sc.custom?' custom':''}${late?' late':''}">${esc(mRange(sc.start,sc.end))}${late?' · 逾期':''}</div></td>`;}).join('')+'</tr>';}).join('')+
    '</tbody></table></div>';
  }
  if(mg)h+=`<div class="addrow"><label for="newProd" class="vh">新品名稱</label><input type="text" id="newProd" placeholder="新品名稱，例如：六角黃銅鋼筆 新色"><button class="btn primary sm" data-act="addProd">加入新品</button></div>`;
  $('#prodWrap').innerHTML=h;
}

/* ---------- render: all-projects tab ---------- */
function projRow(P){
  const pc=P.total?Math.round(P.done/P.total*100):0;
  return `<tr class="${P.p.dropped?'dropped':''}"><td><button class="linkbtn" ${openAttr(P)}>${esc(P.name)}</button>${P.p.client?`<div class="sub">${esc(P.p.client)}</div>`:''}</td>
    <td>${typeBadge(P.type)}</td><td>${esc(P.p.lead?pname(P.p.lead):'未指定')}</td>
    <td>${P.cur&&!P.p.dropped?esc(P.cur.n)+`<div class="sub">${md(P.cur.s)}–${md(P.cur.e)}</div>`:'—'}</td>
    <td><div class="row" style="flex-wrap:nowrap"><div class="bar"><i style="width:${pc}%"></i></div><span class="num sub">${P.done}/${P.total}</span></div></td>
    <td class="num">${ymd(P.start)} – ${ymd(P.end)}</td><td>${pill(P.state)}</td></tr>`;
}
const projTable=list=>list.length?`<table class="pl"><thead><tr><th scope="col">專案</th><th scope="col">類型</th><th scope="col">主責</th><th scope="col">目前階段</th><th scope="col">進度</th><th scope="col">期間</th><th scope="col">狀態</th></tr></thead><tbody>${list.map(projRow).join('')}</tbody></table>`:'<div class="empty" style="margin:12px">沒有符合的專案。</div>';
function fillLead(sel){if(!sel)return;const mem=memberList();const want=mem.map(m=>m.id).join(',');if(sel.dataset.ids===want)return;const v=sel.value;sel.dataset.ids=want;sel.innerHTML='<option value="">未指定</option>'+mem.map(m=>`<option value="${m.id}">${esc(m.name)}（${esc(m.dept)}）</option>`).join('');sel.value=v;}
function syncForm(f,ty){
  const box=$('#'+f+'Form');if(!box)return;box.hidden=!(isMgr()&&canAct());
  fillLead($('#'+f+'Lead'));const st=$('#'+f+'Start');if(st&&!st.value)st.value=iso(today());
  box.querySelectorAll('[data-ext]').forEach(el=>el.hidden=ty==='internal');
  const hint=$('#'+f+'Hint');
  if(ty==='internal')hint.textContent='內部新品會加入「內部新品開發」分頁，沿用年度階段時程，之後可在產品表個別調整。';
  else{const s0=st.value?pd(st.value):today(),du=$('#'+f+'Due').value;const end=du?pd(du):addDays(s0,tplDays(ty)-1);
    hint.textContent=`${PTYPES[ty].l}：${PTYPES[ty].stages.map(x=>x[1]).join(' → ')}。${du?'依交期排程':'未填交期，依範本約 '+Math.round(tplDays(ty)/7)+' 週'}，預計 ${ymd(end)} 完成。`;}
}
function renderAll(){
  const list=allProjects();const open=list.filter(P=>!P.closed);
  $('#allStats').innerHTML=TYPE_KEYS.map(ty=>{const l=open.filter(P=>P.type===ty);const o=l.filter(P=>P.state.k==='over'||P.state.k==='blocked').length;
    const nx=l.filter(P=>P.due>=today()).sort((a,b)=>a.due-b.due)[0];
    return `<button class="stat" data-tab="${ty}"><div class="k">${typeBadge(ty)}</div><div class="v num">${l.length}<small>${ty==='internal'?'款開發中':'案進行中'}</small></div><div class="s">${o?`<span style="color:var(--danger)">${o} 項落後或有問題</span>`:'沒有落後'}${nx?` · 最近交期 ${md(nx.due)}`:''}</div></button>`;}).join('')+
    `<div class="stat hot"><div class="k">全公司</div><div class="v num">${open.length}<small>個專案進行中</small></div><div class="s">${open.filter(P=>P.state.k==='over').length} 項逾期</div></div>`;
  $('#allFilter').innerHTML='<span>類型</span>'+[['','全部']].concat(TYPE_KEYS.map(k=>[k,PTYPES[k].l])).map(([k,l])=>`<button class="chip" aria-pressed="${S.allType===k}" data-tfilter="${k}">${l}</button>`).join('');
  $('#allClosed').checked=S.showClosed;$('#allLegend').innerHTML=dgLegend();
  const shown=sortProj(list.filter(P=>(!S.allType||P.type===S.allType)&&(S.showClosed||!P.closed)));
  $('#allGantt').innerHTML=dateGantt(shown,'專案');
  $('#allList').innerHTML=projTable(shown);
  $('#allBanner').innerHTML=list.length?'':'<div class="banner">還沒有任何專案。用下方表單新增第一個專案。</div>';
  syncForm('af',$('#afType').value);
}
function renderType(ty){
  const T=PTYPES[ty];
  $('#tyEyebrow').textContent=T.l;$('#tyTitle').textContent=ty==='external'?'外部設計案時程':'企禮客製案時程';
  $('#tyDesc').textContent=T.hint+' 點專案名稱可調整各階段日期、切換狀態與留言。';
  const list=typedProjs(ty).map(normProj);const open=list.filter(P=>!P.closed);
  const over=open.filter(P=>P.state.k==='over').length;
  $('#tySummary').innerHTML=`<div class="stat" style="min-width:200px"><div class="k">進行中</div><div class="v num">${open.length}<small>案</small></div><div class="s">${over?`<span style="color:var(--danger)">${over} 案逾期</span>`:'沒有逾期'}</div></div>`;
  $('#tyClosed').checked=S.showClosed;$('#tyLegend').innerHTML=dgLegend();
  const shown=sortProj(list.filter(P=>S.showClosed||!P.closed));
  $('#tyBanner').innerHTML=list.length?'':`<div class="banner">還沒有${T.l}。${isMgr()&&canAct()?'用下方表單建立，時程會依範本自動排好。':'請產品PM 或老闆建立專案。'}</div>`;
  $('#tyGantt').innerHTML=dateGantt(shown,'專案 / 客戶');
  // stage matrix: columns follow the type template
  const ed=canAct();
  $('#tyList').innerHTML=shown.length?`<table class="pm"><thead><tr><th scope="col">專案</th>${T.stages.map(x=>`<th scope="col">${esc(x[1])}</th>`).join('')}<th scope="col">狀態</th></tr></thead><tbody>`+shown.map(P=>{const p=P.p;
    return `<tr class="${p.dropped?'dropped':''}"><td><button class="linkbtn" data-proj="${esc(p.id)}">${esc(p.name)}</button><div class="sub">${esc(p.client||'')}${p.client?' · ':''}主責 ${esc(p.lead?pname(p.lead):'未指定')}${p.due?' · 交期 '+md(pd(p.due)):''}</div></td>`+
      T.stages.map(([k])=>{const x=P.stages.find(y=>y.k===k);if(!x)return '<td>—</td>';
        return `<td><button class="cell ${x.v}" data-pcell="${esc(p.id)}" data-k="${k}" ${ed&&!p.dropped?'':'disabled'} aria-label="${esc(p.name)} ${esc(x.n)}：${CELL_L[x.v]}">${CELL_L[x.v]}</button><div class="cd${x.late?' late':''}">${md(x.s)}–${md(x.e)}${x.late?' · 逾期':''}</div></td>`;}).join('')+
      `<td>${pill(P.state)}</td></tr>`;}).join('')+'</tbody></table>':'';
  $('#tyList').hidden=!shown.length;
  syncForm('tf',ty);
}
function renderTabs(){
  const n=ty=>S.products.filter(p=>pType(p)===ty&&!normProj(p).closed).length;
  document.querySelectorAll('.tab').forEach(b=>{const k=b.dataset.tab;b.setAttribute('aria-selected',String(k===S.tab));b.tabIndex=k===S.tab?0:-1;
    const c=k==='all'?'':n(k);b.innerHTML=esc(k==='all'?'全部專案':PTYPES[k].l)+(c?`<span class="num">${c}</span>`:'');});
  $('#pane-all').hidden=S.tab!=='all';$('#pane-internal').hidden=S.tab!=='internal';
  const tyOn=S.tab==='external'||S.tab==='gift';$('#pane-type').hidden=!tyOn;if(tyOn)$('#pane-type').setAttribute('aria-labelledby','tab-'+S.tab);
  $('#secNav').hidden=S.tab!=='internal';
  if(S.tab==='all')renderAll();else if(tyOn)renderType(S.tab);
}
function setTab(t,scroll){
  if(!['all','internal','external','gift'].includes(t))t='all';
  S.tab=t;try{localStorage.setItem('np-tab',t);}catch(e){}
  const h='#'+(t==='internal'?'overview':t);if(location.hash!==h)history.replaceState(null,'',h);
  renderTabs();if(scroll)scrollTo({top:0});onScroll();
}

/* ---------- render: dashboard ---------- */
function renderDash(){
  const ts=sorted();const td=today();
  const rateOf=list=>{const it=list.flatMap(t=>t.locked?t.checklist.map(()=>({done:true})):t.checklist);return it.length?Math.round(it.filter(c=>c.done).length/it.length*100):0;};
  $('#stageRates').innerHTML=Object.keys(STAGES).map(k=>{const l=ts.filter(t=>t.stage==k);if(!l.length)return '';const r=rateOf(l);return `<div class="mrow"><span>${k}. ${STAGES[k]}</span><div class="bar"><i style="width:${r}%;background:${stageColor(k)}"></i></div><span class="num">${r}%</span></div>`;}).join('')||'<div class="empty">尚無任務。</div>';
  $('#deptRates').innerHTML=LABELS.filter(d=>ts.some(t=>t.owners.includes(d))).map(d=>{const l=ts.filter(t=>t.owners.includes(d));const r=rateOf(l);const o=l.filter(t=>status(t).over).length;return `<div class="mrow"><span>${d}${o?` <span class="pill p-over">逾期 ${o}</span>`:''}</span><div class="bar"><i style="width:${r}%"></i></div><span class="num">${r}%</span></div>`;}).join('');
  const al=ts.filter(t=>!t.locked&&(status(t).over||t.blocked||t.review)||t.changeRequest);
  $('#alerts').innerHTML=al.length?al.map(t=>`<div class="ms"><span class="d">${md(tEnd(t))}</span><button class="linkbtn" data-open="${t.id}">${esc(t.sub)}</button><span class="r">${t.changeRequest?'<span class="pill p-review">變更申請</span>':pill(status(t))}</span></div>`).join(''):'<div class="empty">沒有逾期、卡住或待決策的項目。</div>';
  const sl=ts.filter(t=>slip(t)>0);
  const tot=sl.reduce((a,t)=>a+slip(t),0);
  $('#slips').innerHTML=sl.length?`<div class="sub" style="margin-bottom:6px">共 ${sl.length} 項延後，累計 ${tot} 天</div>`+sl.map(t=>`<div class="ms"><span class="d">${md(bEnd(t))}→</span><button class="linkbtn" data-open="${t.id}">${esc(t.sub)}</button><span class="r">${slipPill(t)}</span></div>`).join(''):'<div class="empty">所有任務都維持原訂時程。調整時程時，原訂日期會保留在這裡。</div>';
  const ev=[];ts.forEach(t=>{if(t.locked)return;ev.push({d:tStart(t),t,txt:'開始'});ev.push({d:tEnd(t),t,txt:'截止'});});
  const up=ev.filter(e=>e.d>=td).sort((a,b)=>a.d-b.d).slice(0,6);
  $('#miles').innerHTML=up.length?up.map(e=>`<div class="ms"><span class="d">${e.d.getFullYear()!==td.getFullYear()?e.d.getFullYear()+'/':''}${md(e.d)}</span><button class="linkbtn" data-open="${e.t.id}">${esc(e.t.sub)} ${e.txt}</button><span class="num sub r">${days(td,e.d)} 天後 · 主責 ${esc(leadTxt(e.t))}</span></div>`).join(''):'<div class="empty">沒有即將到來的里程碑。</div>';
}

/* ---------- render: reminders ---------- */
function renderRemind(){
  const set=S.setDraft||settings();const mg=isMgr()&&canAct();const dis=mg?'':'disabled';
  $('#remSettings').innerHTML=`<div class="form">
    <div class="field"><span>截止前提醒主責人</span><div class="opts">${OFFSET_CHOICES.map(o=>`<label><input type="checkbox" id="off-${o}" data-off="${o}" ${set.offsets.includes(o)?'checked':''} ${dis}>${o===0?'當天':'前 '+o+' 天'}</label>`).join('')}</div></div>
    <div class="field"><span>升級通知</span>
      <label class="inline"><input type="checkbox" id="s-ccPM" ${set.ccPM?'checked':''} ${dis}>截止前 3 天內副本給產品PM</label>
      <label class="inline"><input type="checkbox" id="s-over" ${set.overdueDaily?'checked':''} ${dis}>逾期後每天提醒</label>
      <label class="inline">逾期 <input type="number" id="s-esc" min="1" max="30" value="${set.escalateDays}" ${dis}> 天起副本給老闆</label></div>
    <div class="field"><span>決策時限</span><label class="inline">提交審核後 <input type="number" id="s-dec" min="1" max="15" value="${set.decisionDays}" ${dis}> 個工作天未核准，提醒老闆</label></div>
    <div class="field"><span>每週摘要</span><label class="inline"><input type="checkbox" id="s-week" ${set.weeklyDigest?'checked':''} ${dis}>每週一寄本週重點給全體成員</label></div>
    ${mg?'<button class="btn primary sm" data-act="saveSet" style="justify-self:start">儲存規則</button>':'<small class="sub">由產品PM 或老闆調整規則。</small>'}
  </div>`;
  const rs=reminders();
  $('#previewTitle').textContent=`今天（${md(today())}）會寄出的提醒`;
  if(!memberList().length)$('#remPreview').innerHTML='<div class="empty">還沒有人員名冊，提醒不會寄給任何人。</div>';
  else $('#remPreview').innerHTML=rs.length?rs.map(r=>`<div class="mail"><div class="to"><b>${esc(r.m.name)}（${esc(r.m.dept)}${r.m.pm?'・產品PM':''}）</b><span class="sub">${r.m.email?esc(r.m.email):'<span style="color:var(--danger)">未填 Email，無法寄送</span>'}</span></div><ul>${r.items.map(i=>`<li class="${i.kind==='over'?'over':''}">${esc(i.t.sub)}：${esc(i.txt)}</li>`).join('')}</ul></div>`).join(''):'<div class="empty">依目前規則，今天沒有需要寄出的提醒。</div>';
  // people roster
  const mem=memberList();
  const adm=S.isAdmin&&live();
  const boundBy=pid=>Object.keys(S.claims).filter(u=>S.claims[u]===pid);
  let h='';
  if(!mem.length)h+='<div class="empty" style="margin-bottom:12px">還沒有人員。</div>';
  h+='<div class="members">'+mem.map(m=>{const bb=boundBy(m.id);const bind=bb.length?`<span class="sub">已綁定${bb.length>1?`<span style="color:var(--danger)">（${bb.length} 個帳號）</span>`:''}${adm?bb.map(u=>` · ${esc(nm(u))} <button class="linkbtn sub" style="font-weight:500" data-unbind="${u}">解除</button>`).join(''):''}</span>`:'<span class="sub">尚未綁定帳號</span>';
    return adm?`<div class="mem"><div><b>${esc(m.name)}</b><div>${bind}</div></div>
     <div style="display:grid;gap:4px"><select id="md-${m.id}" data-pdept="${m.id}" aria-label="${esc(m.name)} 部門">${DEPTS.map(d=>`<option ${d===m.dept?'selected':''}>${d}</option>`).join('')}</select><label class="inline sub"><input type="checkbox" id="pm-${m.id}" data-ppm="${m.id}" ${m.pm?'checked':''}>兼產品PM</label></div>
     <input type="email" id="me-${m.id}" data-pemail="${m.id}" value="${esc(m.email||'')}" placeholder="name@ystudiostyle.com" aria-label="${esc(m.name)} Email">
     <button class="btn sm" data-rmp="${m.id}">移除</button></div>`
    :`<div class="mem"><div><b>${esc(m.name)}</b><div>${bind}</div></div><span>${esc(m.dept)}${m.pm?'・產品PM':''}</span><span class="sub">${esc(m.email||'未填 Email')}</span><span></span></div>`;}).join('')+'</div>';
  if(adm)h+=`<div class="addrow" style="margin-top:16px"><label for="npName" class="vh">姓名</label><input type="text" id="npName" placeholder="姓名" style="max-width:160px"><label for="npDept" class="vh">部門</label><select id="npDept">${DEPTS.map(d=>`<option>${d}</option>`).join('')}</select><label for="npEmail" class="vh">Email</label><input type="text" id="npEmail" placeholder="Email" style="max-width:260px"><button class="btn primary sm" data-act="addPerson">加入人員</button></div>`;
  else if(live())h+='<p class="sub" style="margin-top:12px">名冊由網站擁有者或編輯者維護。</p>';
  $('#memberPanel').innerHTML=h;
  const lg=S.logs.slice().sort((a,b)=>b.id.localeCompare(a.id)).slice(0,7);
  $('#remLog').innerHTML=lg.length?lg.map(l=>`<div class="ms"><span class="d">${esc(l.id.slice(5).replace('-','/'))}</span><span>${esc(l.summary||'')}</span><span class="sub r">${l.sent||0} 封</span></div>`).join(''):'<div class="empty">還沒有寄出紀錄。排程開始後，每天的寄送摘要會出現在這裡。</div>';
}

/* ---------- render: drawer ---------- */
function renderProdDrawer(){
  const p=S.products.find(x=>x.id===S.openProd);const dw=$('#dw');
  if(!p){dw.innerHTML='';return;}
  const cols=prodCols(),cells=p.cells||{},mg=isMgr()&&canAct()&&!p.dropped;
  const nCustom=cols.filter(t=>pSched(p,t).custom).length;
  const rows=cols.map(t=>{const sc=pSched(p,t),v=cells[t.id]||'',late=pLate(p,t);
    return `<tr><th scope="row"><div>${esc(t.sub)}</div><div class="sub">${t.stage}. ${esc(STAGES[t.stage])} · 年度 ${esc(mRange(t.start,t.end))}</div></th>
      <td><span class="cell ${v}" style="display:inline-block;width:auto">${CELL_L[v]}</span>${late?' <span class="pill p-over">逾期</span>':''}</td>
      ${mg?`<td><input type="month" id="ps-${t.id}" data-ps="${t.id}" value="${sc.start}" aria-label="${esc(t.sub)} 開始月份"></td><td><input type="month" id="pe-${t.id}" data-pe="${t.id}" value="${sc.end}" aria-label="${esc(t.sub)} 結束月份"></td>`
      :`<td class="num">${esc(mRange(sc.start,sc.end))}${sc.custom?' <span class="sub">自訂</span>':''}</td>`}</tr>`;}).join('');
  dw.innerHTML=`
   <div class="dw-head">
     <button class="x" data-act="close" aria-label="關閉">×</button>
     <div class="eyebrow">產品時程</div>
     <h3 id="dwTitle">${esc(p.name)}</h3>
     <div class="row"><span class="sub">${nCustom?`${nCustom} 個階段使用自訂時程，其餘沿用年度時程。`:'全部階段沿用年度時程。'}</span></div>
   </div>
   <div class="dw-body">
     <table class="ptab"><thead><tr><th scope="col">階段</th><th scope="col">狀態</th>${mg?'<th scope="col">開始</th><th scope="col">結束</th>':'<th scope="col">時程</th>'}</tr></thead><tbody>${rows}</tbody></table>
     ${mg?`<div class="box plain"><b>整批調整</b><div class="row"><label class="inline" for="pShift">未完成的階段全部移動</label><input type="number" id="pShift" value="1" min="-12" max="12" style="width:64px"><span>個月</span><button class="btn sm" data-act="shiftProd">套用到上方</button><button class="btn sm" data-act="resetProd">全部改回年度時程</button></div><div class="sub">調整後按「儲存時程」才會生效。和年度時程相同的階段不會另外儲存，之後年度時程改動時會一起跟著動。</div></div>
     <div class="row"><button class="btn primary" data-act="saveProd">儲存時程</button><button class="btn" data-act="close">取消</button></div>`
     :p.dropped?'<div class="sub">此品項已停止開發。</div>':'<div class="sub">由產品PM 或老闆調整各品項時程。</div>'}
     ${p.schedAt?`<div class="sub">最後調整：${esc(nm(p.schedBy))} · ${stamp(p.schedAt)}</div>`:''}
   </div>`;
}
function renderProjDrawer(){
  const p=S.products.find(x=>x.id===S.openProj);const dw=$('#dw');
  if(!p){dw.innerHTML='';return;}
  const P=normProj(p),a=canAct(),mg=isMgr()&&a&&!p.dropped,mem=memberList();
  const notes=S.notes.filter(n=>n.taskId===p.id).sort((x,y)=>x.at-y.at);
  const rows=(p.stages||[]).map((x,i)=>{const N=P.stages[i];
    return `<tr><th scope="row">${esc(x.n)}</th>
      <td><button class="cell ${x.v||''}" data-pcell="${esc(p.id)}" data-k="${x.k}" ${a&&!p.dropped?'':'disabled'} style="width:auto">${CELL_L[x.v||'']}</button>${N.late?' <span class="pill p-over">逾期</span>':''}</td>
      ${mg?`<td><input type="date" id="js-${x.k}" value="${x.start}" aria-label="${esc(x.n)} 開始"></td><td><input type="date" id="je-${x.k}" value="${x.end}" aria-label="${esc(x.n)} 結束"></td>`
      :`<td class="num">${ymd(N.s)} – ${ymd(N.e)}</td>`}</tr>`;}).join('');
  dw.innerHTML=`
   <div class="dw-head">
     <button class="x" data-act="close" aria-label="關閉">×</button>
     <div class="eyebrow">${esc(PTYPES[pType(p)].l)}</div>
     <h3 id="dwTitle">${esc(p.name)}</h3>
     <div class="row">${pill(P.state)}<span class="sub num">${P.done}/${P.total} 階段完成</span></div>
     <div class="bar"><i style="width:${P.total?Math.round(P.done/P.total*100):0}%"></i></div>
   </div>
   <div class="dw-body">
     <dl class="kv">
       <dt>客戶</dt><dd>${mg?`<input type="text" id="jClient" value="${esc(p.client||'')}" aria-label="客戶">`:esc(p.client||'—')}</dd>
       <dt>主責人</dt><dd>${mg?`<select id="jLead" data-plead="${esc(p.id)}" aria-label="主責人"><option value="">未指定</option>${mem.map(m=>`<option value="${m.id}" ${m.id===p.lead?'selected':''}>${esc(m.name)}（${esc(m.dept)}）</option>`).join('')}</select>`:esc(p.lead?pname(p.lead):'未指定')}</dd>
       <dt>客戶交期</dt><dd>${mg?`<input type="date" id="jDue" value="${p.due||''}" aria-label="客戶交期">`:p.due?ymd(pd(p.due)):'未設定'}</dd>
       <dt>目前時程</dt><dd class="num">${ymd(P.start)} – ${ymd(P.end)}${p.due&&P.end>pd(p.due)?' <span class="pill p-over">超過交期 '+days(pd(p.due),P.end)+' 天</span>':''}</dd>
     </dl>
     <div class="blk"><h4>階段時程</h4>
       <table class="ptab"><thead><tr><th scope="col">階段</th><th scope="col">狀態（點擊切換）</th>${mg?'<th scope="col">開始</th><th scope="col">結束</th>':'<th scope="col">時程</th>'}</tr></thead><tbody>${rows}</tbody></table></div>
     ${mg?`<div class="box plain"><b>整批調整</b>
       <div class="row"><label class="inline" for="jShift">未完成的階段全部移動</label><input type="number" id="jShift" value="7" min="-180" max="180" style="width:72px"><span>天</span><button class="btn sm" data-act="shiftProj">套用到上方</button></div>
       <div class="row"><button class="btn sm" data-act="refitProj">依交期重新排程</button><span class="sub">從開始日到客戶交期，依範本比例重排所有階段。</span></div>
       <label for="jReason" class="vh">調整原因</label><input type="text" id="jReason" placeholder="調整原因（選填，會留存紀錄）">
       <div class="row"><button class="btn primary" data-act="saveProj">儲存</button></div></div>`:''}
     ${isMgr()&&a?`<div class="row"><button class="btn sm" data-act="dropProj">${p.dropped?'恢復此專案':'停止此專案'}</button></div>`:''}
     <div class="blk"><h4>討論與紀錄</h4>
       <div class="notes">${notes.map(noteHtml).join('')||'<div class="empty">還沒有留言。</div>'}</div>
       ${a?`<div class="compose" style="margin-top:12px"><label for="noteIn" class="vh">內容</label><textarea id="noteIn" rows="3" placeholder="留言給同事，例如客戶回覆、規格變更…">${esc(S.drafts[p.id]||'')}</textarea><button class="btn primary sm" data-act="postProj" style="justify-self:end">送出留言</button></div>`:''}
     </div>
   </div>`;
}
function renderDrawer(){
  if(S.openProj){renderProjDrawer();return;}
  if(S.openProd){renderProdDrawer();return;}
  const t=S.tasks.find(x=>x.id===S.open);const dw=$('#dw');
  if(!t){dw.innerHTML='';return;}
  const st=status(t),p=prog(t),td=today(),set=settings();
  const notes=S.notes.filter(n=>n.taskId===t.id).sort((a,b)=>a.at-b.at);
  const decs=notes.filter(n=>n.kind==='decision');
  const files=S.files.filter(f=>f.taskId===t.id).sort((a,b)=>b.at-a.at);
  const a=canAct(),mg=isMgr()&&a,boss=isBoss()&&a;
  const left=days(td,tEnd(t));const f=S.form;
  const mem=memberList();
  const leadSel=mg&&!t.locked?`<select id="leadSel" data-lead="${t.id}" aria-label="主責人"><option value="">未指定</option>${mem.map(m=>`<option value="${m.id}" ${m.id===t.lead?'selected':''}>${esc(m.name)}（${esc(m.dept)}${m.pm?'・PM':''}）</option>`).join('')}</select>${!mem.length?' <span class="sub">先加入成員</span>':''}`:esc(leadTxt(t));
  const diff=hasBase(t)&&(t.baseStart!==t.start||t.baseEnd!==t.end||(t.baseDue||'')!==(t.due||''));
  let lock='';
  if(t.locked){
    lock=`<div class="box lock"><div>${lockSvg()} 已定案鎖定${t.lockedAt?' · '+stamp(t.lockedAt):''}${t.lockedBy?' · 核准人 '+esc(nm(t.lockedBy)):''}。內容、檔案與時程都不可修改。</div>
     ${t.changeRequest?`<div><b>變更申請中</b>：${esc(t.changeRequest.reason)}<br><span style="opacity:.8">影響：${esc(t.changeRequest.impact||'未填')}</span> · ${esc(nm(t.changeRequest.by))}</div>
       ${boss?`<div class="row"><button class="btn primary sm" data-act="approveChange">核准變更並解鎖</button><button class="btn sm" data-act="rejectChange">駁回</button></div>`:'<div style="opacity:.8">等待老闆核准。</div>'}`
     :(a&&f!=='change'?`<button class="btn sm" data-act="form" data-f="change">提出變更申請</button>`:'')}
     ${f==='change'?`<div class="compose"><label for="crReason" class="vh">變更原因</label><input type="text" id="crReason" placeholder="變更原因（必填）"><label for="crImpact" class="vh">影響</label><input type="text" id="crImpact" placeholder="對時程、成本的影響"><div class="row"><button class="btn primary sm" data-act="submitChange">送出申請</button><button class="btn sm" data-act="form" data-f="">取消</button></div></div>`:''}</div>`;
  }
  let block='';
  if(!t.locked){
    if(t.blocked){const since=days(new Date(t.blocked.at).setHours(0,0,0,0),td);
      block=`<div class="box block"><div><b>卡住 ${since} 天</b> · 等 ${esc(t.blocked.waitingOn)}<br>${esc(t.blocked.reason)}<div class="sub">${esc(nm(t.blocked.by))} 回報於 ${stamp(t.blocked.at)}</div></div>${a?'<button class="btn sm" data-act="unblock">已解決，解除卡住</button>':''}</div>`;}
    else if(f==='block')block=`<div class="box plain"><b>回報卡住</b><label for="blReason" class="vh">原因</label><input type="text" id="blReason" placeholder="卡在哪裡？例如：供應商報價還沒回"><label for="blWait" class="sub">在等誰</label><select id="blWait">${WAIT_ON.map(w=>`<option>${w}</option>`).join('')}</select><div class="row"><button class="btn primary sm" data-act="block">送出</button><button class="btn sm" data-act="form" data-f="">取消</button></div><div class="sub">對方部門會在工作台看到「有人在等你」，並收到每日 Email。</div></div>`;
  }
  let sched='';
  if(f==='dates'&&mg&&!t.locked)sched=`<div class="box plain"><b>調整時程</b><div class="grid2"><label>開始月份<input type="month" id="dStart" value="${t.start}"></label><label>結束月份<input type="month" id="dEnd" value="${t.end}"></label></div><label class="sub" for="dDue">指定截止日（選填，空白則為結束月份月底）</label><input type="date" id="dDue" value="${t.due||''}"><label for="dReason" class="vh">原因</label><input type="text" id="dReason" placeholder="調整原因（必填，會留存紀錄）"><div class="row"><button class="btn primary sm" data-act="saveDates">儲存</button><button class="btn sm" data-act="form" data-f="">取消</button></div><div class="sub">原訂時程會保留，延後天數會顯示在甘特圖與儀表。</div></div>`;
  let stageBtn='';
  if(!t.locked&&a){
    if(t.review)stageBtn=boss?`<button class="btn primary" data-act="approve">核准定案並鎖定</button><button class="btn" data-act="sendBack">退回修改</button>`:`<span class="sub">已提交審核，${esc(st.l)}（時限 ${set.decisionDays} 個工作天）。</span>`;
    else stageBtn=`<button class="btn primary" data-act="submit" ${p<100?'disabled':''}>提交審核</button>${p<100?'<span class="sub">檢查清單全部完成後才能提交</span>':''}`;
  }
  const tools=!t.locked&&a?[!t.blocked&&f!=='block'?'<button class="btn sm warnb" data-act="form" data-f="block">回報卡住</button>':'',mg&&f!=='dates'?'<button class="btn sm" data-act="form" data-f="dates">調整時程</button>':'',mg?`<button class="btn sm" data-act="editDates">${S.editDates?'完成日期編輯':'設定項目日期'}</button>`:'',mg&&t.stage===5?'<button class="btn sm" data-act="addRound">加開下一輪打樣</button>':''].join(''):'';
  dw.innerHTML=`
   <div class="dw-head">
     <button class="x" data-act="close" aria-label="關閉">×</button>
     <div class="eyebrow">${t.stage}. ${esc(STAGES[t.stage])}</div>
     <h3 id="dwTitle">${esc(t.sub)}</h3>
     <div class="row">${pill(st)}${slipPill(t)}<span class="sub num">${t.locked||t.review?'':left>=0?`剩 ${left} 天`:''}</span></div>
     <div class="bar"><i style="width:${p}%;background:${stageColor(t.stage)}"></i></div>
   </div>
   <div class="dw-body">
     <dl class="kv"><dt>主責人</dt><dd>${leadSel}</dd><dt>負責單位</dt><dd>${esc(ownersTxt(t))}</dd>
       <dt>目前時程</dt><dd class="num">${t.start.replace('-','/')} – ${t.end.replace('-','/')} · 截止 ${ymd(tEnd(t))}</dd>
       ${diff?`<dt>原訂時程</dt><dd class="num">${t.baseStart.replace('-','/')} – ${t.baseEnd.replace('-','/')} · 截止 ${ymd(bEnd(t))}</dd>`:''}
       <dt>完成</dt><dd class="num">${p}%</dd></dl>
     ${tools?`<div class="row">${tools}</div>`:''}
     ${lock}${block}${sched}
     <div class="blk"><h4>檢查清單 <span class="sub num">${t.checklist.filter(c=>c.done).length}/${t.checklist.length}</span></h4><div style="display:grid;gap:10px">${t.checklist.map((c,i)=>checkItem(t,i,'')).join('')}</div></div>
     ${stageBtn?`<div class="row">${stageBtn}</div>`:''}
     <div class="blk"><h4>進度檔案 ${!t.locked&&a&&S.assets?`<button class="btn sm" data-act="upload">上傳檔案</button>`:''}</h4>
       ${files.length?`<div class="files">${files.map(x=>{const u=S.assets?S.assets.url(x.assetId):'#';const img=(x.contentType||'').startsWith('image/');return `<a class="file" href="${u}" target="_blank" rel="noopener"><div class="th">${img?`<img src="${u}" alt="${esc(x.name)}">`:'PDF'}</div><div class="fn">${esc(x.name)}<small>${esc(nm(x.by))} · ${stamp(x.at)}</small></div></a>`;}).join('')}</div>`:`<div class="empty">還沒有檔案。${!t.locked&&a&&S.assets?'上傳設計草稿、打樣照片或包裝稿（圖片或 PDF）。':!S.assets&&live()?'需要編輯者權限才能上傳。':''}</div>`}
     </div>
     <div class="blk"><h4>決策紀錄 <span class="sub">${decs.length} 則</span></h4>
       ${decs.length?`<div class="notes">${decs.map(noteHtml).join('')}</div>`:'<div class="empty">尚無決策。決策一經記錄即為定案依據，不得推翻。</div>'}
     </div>
     <div class="blk"><h4>討論與紀錄</h4>
       <div class="notes">${notes.filter(n=>n.kind!=='decision').map(noteHtml).join('')||'<div class="empty">還沒有留言。</div>'}</div>
       ${a?`<div class="compose" style="margin-top:12px">
         <div class="seg" role="group" aria-label="類型"><button aria-pressed="${S.composeKind==='comment'}" data-kind="comment">留言</button><button aria-pressed="${S.composeKind==='decision'}" data-kind="decision">記錄決策</button></div>
         <label for="noteIn" class="vh">內容</label><textarea id="noteIn" rows="3" placeholder="${S.composeKind==='decision'?'寫下決策內容與決策人':'留言給同事…'}">${esc(S.drafts[t.id]||'')}</textarea>
         <button class="btn primary sm" data-act="post" style="justify-self:end">${S.composeKind==='decision'?'記錄決策':'送出留言'}</button></div>`:''}
     </div>
   </div>`;
}
function noteHtml(n){return `<div class="note ${n.kind}"><div class="who"><b>${n.kind==='system'?'系統':esc(nm(n.by))}</b><span>${stamp(n.at)}</span>${n.kind==='decision'?'<span class="pill p-review">決策</span>':''}</div><p>${esc(n.text)}</p></div>`;}

function render(){renderHero();renderBench();renderGantt();renderProducts();renderDash();renderRemind();renderTabs();if(S.open||S.openProd||S.openProj)renderDrawer();}

/* ---------- writes ---------- */
const queues={};
function queue(key,fn){queues[key]=(queues[key]||Promise.resolve()).then(fn).catch(err);return queues[key];}
function err(e){console.error(e);const c=e&&e.code;
  if(c==='invalid_argument'&&S.canWrite==null){S.canWrite=false;render();toast('你沒有寫入權限，已切換為唯讀。');return;}
  toast(c==='quota_exceeded'?'儲存空間已滿，請刪除舊資料後再試。':c==='unsupported_type'?'這個格式無法上傳，請轉成 PDF 或圖片。':c==='too_large'?'檔案太大，請小於 20MB。':'儲存失敗，請稍後再試。');}
function patchTask(t,patch){Object.assign(t,patch);render();if(!live())return;queue('t:'+t.id,()=>S.db.doc('tasks/'+t.id).update(patch));}
function addNote(taskId,kind,text){const n={taskId,kind,text,by:S.me,at:Date.now()};if(!live()){S.notes.push(n);render();return;}queue('notes',()=>S.db.collection('notes').add(n));}
function toggle(id,i,checked){
  const t=S.tasks.find(x=>x.id===id);if(!t||t.locked||!canAct())return;
  const cl=clone(t.checklist);cl[i]={...cl[i],done:checked,by:checked?S.me:null,at:checked?Date.now():null};
  const patch={checklist:cl};if(!checked&&t.review)patch.review=false;
  patchTask(t,patch);
}

/* ---------- events ---------- */
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.matches('input[type=checkbox][data-task]'))toggle(el.dataset.task,+el.dataset.i,el.checked);
  else if(el.id==='fDept'){S.filter=el.value;renderGantt();}
  else if(el.id==='fProd'){S.gProd=el.value;renderGantt();}
  else if(el.id==='allClosed'||el.id==='tyClosed'){S.showClosed=el.checked;renderTabs();}
  else if(['afType','afStart','afDue'].includes(el.id))syncForm('af',$('#afType').value);
  else if(['tfStart','tfDue'].includes(el.id))syncForm('tf',S.tab);
  else if(el.dataset.plead){const p=S.products.find(x=>x.id===el.dataset.plead);const v=el.value||null;updProj(p,{lead:v});addNote(p.id,'system',v?`主責人設為 ${pname(v)}`:'取消主責人');}
  else if(el.id==='fileIn'&&el.files[0])upload(el.files[0]);
  else if(el.dataset.lead!==undefined){const t=S.tasks.find(x=>x.id===el.dataset.lead);const v=el.value||null;patchTask(t,{lead:v});addNote(t.id,'system',v?`主責人設為 ${pname(v)}`:'取消主責人');}
  else if(el.dataset.dueTask){const t=S.tasks.find(x=>x.id===el.dataset.dueTask);const cl=clone(t.checklist);const i=+el.dataset.i;cl[i].due=el.value||null;if(!el.value)delete cl[i].due;patchTask(t,{checklist:cl});}
  else if(el.dataset.pdept)updPerson(el.dataset.pdept,{dept:el.value});
  else if(el.dataset.ppm)updPerson(el.dataset.ppm,{pm:el.checked});
  else if(el.dataset.pemail){updPerson(el.dataset.pemail,{email:el.value.trim()});toast('Email 已儲存');}
  else if(el.dataset.off!==undefined||['s-ccPM','s-over','s-esc','s-dec','s-week'].includes(el.id)){
    const d={...(S.setDraft||settings())};
    d.offsets=OFFSET_CHOICES.filter(o=>$('#off-'+o)?.checked);
    d.ccPM=$('#s-ccPM').checked;d.overdueDaily=$('#s-over').checked;d.escalateDays=Math.max(1,+$('#s-esc').value||3);d.decisionDays=Math.max(1,+$('#s-dec').value||3);d.weeklyDigest=$('#s-week').checked;
    S.setDraft=d;
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='noteIn'&&(S.open||S.openProj))S.drafts[S.open||S.openProj]=e.target.value;
});
function updPerson(id,patch){S.people[id]={...S.people[id],...patch};render();queue('pp:'+id,()=>S.db.doc('people/'+id).update(patch));}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-open],[data-prod],[data-proj],[data-tab],[data-tfilter],[data-pcell],[data-view],[data-act],[data-kind],[data-cell],[data-drop],[data-rmp],[data-unbind]');if(!b)return;
  if(b.dataset.open){openTask(b.dataset.open);return;}
  if(b.dataset.prod){openProduct(b.dataset.prod);return;}
  if(b.dataset.proj){openProj(b.dataset.proj);return;}
  if(b.dataset.tab){if($('#drawer').open)$('#drawer').close();setTab(b.dataset.tab,true);return;}
  if(b.dataset.tfilter!==undefined){S.allType=b.dataset.tfilter;renderTabs();return;}
  if(b.dataset.pcell){cycleStage(b.dataset.pcell,b.dataset.k);return;}
  if(b.dataset.view){S.view=b.dataset.view;try{localStorage.setItem('np-view',S.view);}catch(x){}renderBench();return;}
  if(b.dataset.kind){S.composeKind=b.dataset.kind;renderDrawer();$('#noteIn')?.focus();return;}
  if(b.dataset.cell){cycleCell(b.dataset.cell,b.dataset.t);return;}
  if(b.dataset.drop){const p=S.products.find(x=>x.id===b.dataset.drop);p.dropped=!p.dropped;render();queue('p:'+p.id,()=>S.db.doc('products/'+p.id).update({dropped:p.dropped}));toast(p.dropped?`${p.name} 已停止開發`:`${p.name} 恢復開發`);return;}
  if(b.dataset.rmp){const id=b.dataset.rmp;if(b.dataset.confirm!=='1'){b.dataset.confirm='1';b.textContent='確定移除？';return;}delete S.people[id];render();queue('pp:'+id,()=>S.db.doc('people/'+id).delete());return;}
  if(b.dataset.unbind){const u=b.dataset.unbind;delete S.claims[u];render();queue('c:'+u,()=>S.db.doc('claims/'+u).delete());return;}
  const t=S.tasks.find(x=>x.id===S.open);
  switch(b.dataset.act){
    case 'close':$('#drawer').close();break;
    case 'import':importTemplate(b);break;
    case 'upload':$('#fileIn').click();break;
    case 'form':S.form=b.dataset.f||null;renderDrawer();(document.querySelector('#blReason,#crReason,#dReason'))?.focus();break;
    case 'editDates':S.editDates=!S.editDates;renderDrawer();break;
    case 'post':{const v=($('#noteIn').value||'').trim();if(!v)return;addNote(t.id,S.composeKind,v);S.drafts[t.id]='';renderDrawer();toast(S.composeKind==='decision'?'決策已記錄':'留言已送出');break;}
    case 'submit':patchTask(t,{review:true,reviewAt:Date.now()});addNote(t.id,'system',`提交審核，等待老闆核准定案（時限 ${settings().decisionDays} 個工作天）。`);toast('已提交審核');break;
    case 'sendBack':patchTask(t,{review:false,reviewAt:null});addNote(t.id,'system','老闆退回修改。');break;
    case 'approve':patchTask(t,{review:false,reviewAt:null,locked:true,lockedAt:Date.now(),lockedBy:S.me,blocked:null});addNote(t.id,'system','已核准定案並鎖定。嚴禁回頭。');toast('已定案鎖定');break;
    case 'block':{const r=$('#blReason').value.trim();if(!r){toast('請寫明卡在哪裡');$('#blReason').focus();return;}const w=$('#blWait').value;S.form=null;patchTask(t,{blocked:{reason:r,waitingOn:w,by:S.me,at:Date.now()}});addNote(t.id,'system',`回報卡住，等待${w}：${r}`);toast('已通知'+w);break;}
    case 'unblock':{const bl=t.blocked;patchTask(t,{blocked:null});addNote(t.id,'system',`解除卡住（原因：${bl.reason}，卡了 ${days(new Date(bl.at).setHours(0,0,0,0),today())} 天）`);break;}
    case 'saveDates':{const s=$('#dStart').value,en=$('#dEnd').value,du=$('#dDue').value,r=$('#dReason').value.trim();
      if(!s||!en||en<s){toast('結束月份不能早於開始月份');return;}if(!r){toast('請填寫調整原因');$('#dReason').focus();return;}
      const before=`${t.start}~${t.end}${t.due?'（'+t.due+'）':''}`;const patch={start:s,end:en,due:du||null};
      if(!hasBase(t)){patch.baseStart=t.start;patch.baseEnd=t.end;patch.baseDue=t.due||null;}
      S.form=null;patchTask(t,patch);addNote(t.id,'system',`時程調整：${before} → ${s}~${en}${du?'（'+du+'）':''}。原因：${r}`);toast('時程已更新');break;}
    case 'addRound':addRound(t);break;
    case 'submitChange':{const r=$('#crReason').value.trim();if(!r){toast('請填寫變更原因');$('#crReason').focus();return;}const im=$('#crImpact').value.trim();S.form=null;patchTask(t,{changeRequest:{reason:r,impact:im,by:S.me,at:Date.now()}});addNote(t.id,'system','提出變更申請：'+r+(im?'（影響：'+im+'）':''));toast('變更申請已送出');break;}
    case 'approveChange':addNote(t.id,'system','老闆核准變更申請：'+t.changeRequest.reason+'，階段解鎖。');patchTask(t,{locked:false,changeRequest:null,lockedAt:null,lockedBy:null});toast('已解鎖');break;
    case 'rejectChange':addNote(t.id,'system','老闆駁回變更申請：'+t.changeRequest.reason);patchTask(t,{changeRequest:null});break;
    case 'addProd':addProduct();break;
    case 'shiftProd':{const p=S.products.find(x=>x.id===S.openProd);const n=Math.round(+$('#pShift').value||0);if(!p||!n)return;
      prodCols().forEach(c=>{if((p.cells||{})[c.id]==='done')return;const a=$('#ps-'+c.id),z=$('#pe-'+c.id);if(a&&a.value)a.value=addMonths(a.value,n);if(z&&z.value)z.value=addMonths(z.value,n);});
      toast(`未完成階段已${n>0?'往後':'往前'}移 ${Math.abs(n)} 個月，記得儲存`);break;}
    case 'resetProd':prodCols().forEach(c=>{const a=$('#ps-'+c.id),z=$('#pe-'+c.id);if(a)a.value=c.start;if(z)z.value=c.end;});toast('已改回年度時程，記得儲存');break;
    case 'saveProd':saveProdSched();break;
    case 'createProj':createProj(b.dataset.f);break;
    case 'shiftProj':{const p=S.products.find(x=>x.id===S.openProj);const n=Math.round(+$('#jShift').value||0);if(!p||!n)return;
      p.stages.forEach(x=>{if(x.v==='done')return;const a=$('#js-'+x.k),z=$('#je-'+x.k);if(a&&a.value)a.value=iso(addDays(pd(a.value),n));if(z&&z.value)z.value=iso(addDays(pd(z.value),n));});
      toast(`未完成階段已${n>0?'往後':'往前'}移 ${Math.abs(n)} 天，記得儲存`);break;}
    case 'refitProj':{const p=S.products.find(x=>x.id===S.openProj);const du=$('#jDue').value;if(!p)return;if(!du){toast('請先填客戶交期');$('#jDue').focus();return;}
      const s0=pd($('#js-'+p.stages[0].k).value||p.start);if(days(s0,pd(du))+1<p.stages.length){toast('交期太近，排不下所有階段');return;}
      genStages(pType(p),s0,pd(du)).forEach(x=>{const a=$('#js-'+x.k),z=$('#je-'+x.k);if(a)a.value=x.start;if(z)z.value=x.end;});toast('已依交期重排，記得儲存');break;}
    case 'saveProj':saveProj();break;
    case 'dropProj':{const p=S.products.find(x=>x.id===S.openProj);if(!p)return;const d=!p.dropped;updProj(p,{dropped:d});addNote(p.id,'system',d?'專案停止。':'專案恢復進行。');toast(d?'已停止專案':'已恢復專案');break;}
    case 'postProj':{const v=($('#noteIn').value||'').trim();if(!v)return;addNote(S.openProj,'comment',v);S.drafts[S.openProj]='';renderDrawer();toast('留言已送出');break;}
    case 'claim':{const v=$('#claimSel').value;if(!v){toast('請先選擇你的名字');return;}S.claims[S.me]=v;render();queue('c:'+S.me,()=>S.db.doc('claims/'+S.me).set({personId:v,at:Date.now()}));toast(`歡迎，${pname(v)}`);break;}
    case 'addPerson':{const n=$('#npName').value.trim(),d=$('#npDept').value,em=$('#npEmail').value.trim();if(!n){toast('請填寫姓名');return;}const id=(em.split('@')[0]||'').replace(/[^A-Za-z0-9_.~-]/g,'')||'p'+Date.now().toString(36);const doc={name:n,dept:d,email:em,pm:false,order:Date.now()};S.people[id]=doc;render();queue('pp:'+id,()=>S.db.doc('people/'+id).set(doc));toast('已加入 '+n);break;}
    case 'saveSet':{const d=S.setDraft||settings();S.settings=d;S.setDraft=null;render();queue('set',()=>S.db.doc('settings/reminders').set(d));toast('提醒規則已儲存');break;}
  }
});
function openTask(id){S.open=id;S.openProd=null;S.openProj=null;S.form=null;S.editDates=false;renderDrawer();const d=$('#drawer');if(!d.open)d.showModal();}
function openProduct(id){S.openProd=id;S.open=null;S.openProj=null;S.form=null;renderDrawer();const d=$('#drawer');if(!d.open)d.showModal();}
function openProj(id){S.openProj=id;S.open=null;S.openProd=null;S.form=null;renderDrawer();const d=$('#drawer');if(!d.open)d.showModal();}
$('#drawer').addEventListener('close',()=>{S.open=null;S.openProd=null;S.openProj=null;S.form=null;S.editDates=false;});
$('#drawer').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close();});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='newProd'){e.preventDefault();addProduct();}});
addEventListener('np-blob-urls',()=>{if(S.open)renderDrawer();});

function cycleCell(pid,tid){
  const p=S.products.find(x=>x.id===pid);if(!p||!canAct())return;
  const cells={...(p.cells||{})};const v=cells[tid]||'';cells[tid]=CELL[(CELL.indexOf(v)+1)%CELL.length];
  p.cells=cells;render();queue('p:'+pid,()=>S.db.doc('products/'+pid).update({cells}));
}
function updProj(p,patch){Object.assign(p,patch);render();if(live())queue('p:'+p.id,()=>S.db.doc('products/'+p.id).update(patch));}
function cycleStage(pid,k){
  const p=S.products.find(x=>x.id===pid);if(!p||p.dropped||!canAct())return;
  const st=clone(p.stages||[]);const x=st.find(y=>y.k===k);if(!x)return;
  x.v=CELL[(CELL.indexOf(x.v||'')+1)%CELL.length];x.by=S.me;x.at=Date.now();updProj(p,{stages:st});
}
function createProj(f){
  if(!isMgr()||!canAct())return;
  const ty=f==='af'?$('#afType').value:S.tab;const name=$('#'+f+'Name').value.trim();
  if(!name){toast('請填寫專案名稱');$('#'+f+'Name').focus();return;}
  const id='p'+Date.now().toString(36);let doc;
  if(ty==='internal')doc={type:'internal',name,order:Date.now(),cells:{},dropped:false,by:S.me,at:Date.now()};
  else{
    const sv=$('#'+f+'Start').value,dv=$('#'+f+'Due').value;
    if(!sv){toast('請填開始日');$('#'+f+'Start').focus();return;}
    const s0=pd(sv),due=dv?pd(dv):null;
    if(due&&days(s0,due)+1<PTYPES[ty].stages.length){toast('交期必須晚於開始日，且至少留 '+PTYPES[ty].stages.length+' 天');$('#'+f+'Due').focus();return;}
    doc={type:ty,name,client:$('#'+f+'Client').value.trim(),lead:$('#'+f+'Lead').value||null,start:sv,due:dv||null,
      stages:genStages(ty,s0,due),dropped:false,order:Date.now(),by:S.me,at:Date.now()};
  }
  S.products.push({id,...doc});['Name','Client','Due'].forEach(k=>{const el=$('#'+f+k);if(el)el.value='';});
  render();if(live())queue('p:'+id,()=>S.db.doc('products/'+id).set(doc));
  toast(`已建立${PTYPES[ty].l}：${name}`);
  if(ty==='internal')setTab('internal');else{if(f==='af')setTab(ty);openProj(id);}
}
function saveProj(){
  const p=S.products.find(x=>x.id===S.openProj);if(!p||!isMgr()||!canAct())return;
  const st=clone(p.stages);
  for(const x of st){const a=$('#js-'+x.k).value,z=$('#je-'+x.k).value;
    if(!a||!z){toast(`「${x.n}」的開始與結束日期都要填`);return;}
    if(z<a){toast(`「${x.n}」結束日不能早於開始日`);$('#je-'+x.k).focus();return;}
    x.start=a;x.end=z;}
  const before=`${p.stages[0].start}~${p.stages[p.stages.length-1].end}`,after=`${st[0].start}~${st[st.length-1].end}`;
  const moved=st.filter((x,i)=>x.start!==p.stages[i].start||x.end!==p.stages[i].end).length;
  const patch={stages:st,client:$('#jClient').value.trim(),due:$('#jDue').value||null,start:st[0].start};
  const r=$('#jReason').value.trim();
  updProj(p,patch);
  if(moved)addNote(p.id,'system',`時程調整（${moved} 個階段）：${before} → ${after}${r?'。原因：'+r:''}`);
  toast('已儲存');
}
function saveProdSched(){
  const p=S.products.find(x=>x.id===S.openProd);if(!p||!isMgr()||!canAct())return;
  const sched={};
  for(const t of prodCols()){
    const a=$('#ps-'+t.id)?.value,z=$('#pe-'+t.id)?.value;
    if(!a||!z){toast(`「${t.sub}」的開始與結束月份都要填`);return;}
    if(z<a){toast(`「${t.sub}」結束月份不能早於開始月份`);$('#pe-'+t.id).focus();return;}
    if(a!==t.start||z!==t.end)sched[t.id]={start:a,end:z};
  }
  const patch={sched,schedBy:S.me,schedAt:Date.now()};
  Object.assign(p,patch);$('#drawer').close();render();
  if(live())queue('p:'+p.id,()=>S.db.doc('products/'+p.id).update(patch));
  toast(`${p.name} 的時程已儲存`);
}
function addProduct(){
  const el=$('#newProd');const v=(el?.value||'').trim();if(!v)return;
  const id='p'+Date.now().toString(36);const doc={type:'internal',name:v,order:Date.now(),cells:{},dropped:false,by:S.me,at:Date.now()};
  S.products.push({id,...doc});render();$('#newProd')?.focus();
  queue('p:'+id,()=>S.db.doc('products/'+id).set(doc));
}
function addRound(t){
  const r5=sorted().filter(x=>x.stage===5);const last=r5.reduce((a,x)=>x.end>a.end?x:a,r5[0]);
  const n=r5.length+1;const {y,m}=ym(last.end);const nd=new Date(y,m,1);const mo=nd.getFullYear()+'-'+String(nd.getMonth()+1).padStart(2,'0');
  const id='s5r'+Date.now().toString(36);const zh=['','一','二','三','四','五','六','七','八','九','十'][n]||n;
  const doc={order:r5[r5.length-1].order+0.01*(n),stage:5,sub:`${zh}次打樣（含測試及調整）`,owners:[...last.owners],start:mo,end:mo,baseStart:mo,baseEnd:mo,baseDue:null,lead:last.lead||null,
    checklist:ci([`收到${zh}次打樣`,'功能與品質測試','彙整調整意見']),review:false,locked:false,changeRequest:null,blocked:null};
  S.tasks.push({id,...doc});addNote(id,'system',`加開${zh}次打樣，排在 ${mo.replace('-','/')}。後續階段的時程請一併檢查。`);
  render();if(live())queue('t:'+id,()=>S.db.doc('tasks/'+id).set(doc));openTask(id);toast(`已加開${zh}次打樣`);
}
async function upload(file){
  const t=S.tasks.find(x=>x.id===S.open);$('#fileIn').value='';
  if(!t||!S.assets)return;
  toast('上傳中…');
  try{const r=await S.assets.upload(file);
    await S.db.collection('files').add({taskId:t.id,assetId:r.id,name:file.name,contentType:r.contentType,size:r.sizeBytes,by:S.me,at:Date.now()});
    toast('已上傳 '+file.name);
  }catch(e){err(e);}
}
async function importTemplate(btn){
  if(!live())return;btn.disabled=true;
  try{for(const t of TEMPLATE){const d=clone(t);delete d.id;Object.assign(d,{baseStart:t.start,baseEnd:t.end,baseDue:t.due||null,review:false,locked:false,changeRequest:null,blocked:null,lead:null});await S.db.doc('tasks/'+t.id).set(d);}toast('已匯入年度範本');}
  catch(e){btn.disabled=false;err(e);}
}

/* ---------- scroll progress + section nav ---------- */
const bar=$('#prog');const links=[...document.querySelectorAll('.nav a')];const secs=links.map(a=>document.querySelector(a.getAttribute('href')));
let ticking=false;
function onScroll(){ticking=false;const h=document.documentElement;const max=h.scrollHeight-h.clientHeight;bar.style.transform=`scaleX(${max>0?Math.min(h.scrollTop/max,1):0})`;
  if(S.tab!=='internal')return;let cur=0;secs.forEach((s,i)=>{if(s.getBoundingClientRect().top<120)cur=i;});links.forEach((a,i)=>a.classList.toggle('on',i===cur));}
addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(onScroll);}},{passive:true});
addEventListener('resize',onScroll);

/* ---------- names ---------- */
async function resolveNames(force){
  if(!S.user)return;const ids=new Set(Object.keys(S.claims));S.me&&ids.add(S.me);
  S.tasks.forEach(t=>{t.checklist.forEach(c=>c.by&&ids.add(c.by));[t.lead,t.lockedBy,t.changeRequest?.by,t.blocked?.by].forEach(x=>x&&ids.add(x));});
  S.notes.forEach(n=>n.by&&ids.add(n.by));S.products.forEach(p=>(p.stages||[]).forEach(x=>x.by&&ids.add(x.by)));S.files.forEach(f=>f.by&&ids.add(f.by));
  const need=[...ids].filter(i=>force||!(i in S.names));if(!need.length)return;
  try{const ps=await S.user.profiles(need);need.forEach(i=>{S.names[i]=(ps[i]&&ps[i].name)||'';});render();}catch(e){}
}

/* ---------- boot ---------- */
function tabFromHash(){const h=location.hash.slice(1);if(['all','internal','external','gift'].includes(h))return h;if(h&&document.getElementById(h)?.closest('#pane-internal'))return 'internal';return null;}
{let t=tabFromHash();if(!t)try{t=localStorage.getItem('np-tab');}catch(e){}S.tab=['all','internal','external','gift'].includes(t)?t:'all';}
addEventListener('hashchange',()=>{const t=tabFromHash();if(t&&t!==S.tab)setTab(t);});
document.getElementById('tabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const ts=[...document.querySelectorAll('.tab')];const i=ts.findIndex(x=>x.dataset.tab===S.tab);const n=ts[(i+(e.key==='ArrowRight'?1:ts.length-1))%ts.length];setTab(n.dataset.tab);n.focus();});
render();onScroll();
if(S.tab==='internal'&&location.hash&&location.hash!=='#overview')requestAnimationFrame(()=>document.querySelector(location.hash)?.scrollIntoView());
(async()=>{
  if(!window.claude||!window.claude.use){S.mode='offline';render();return;}
  const [db,user,assets]=await Promise.all([claude.use('db'),claude.use('user'),claude.use('assets').catch(()=>null)]);
  if(!db){S.mode='offline';render();return;}
  S.db=db;S.user=user;S.assets=assets;
  if(user){try{S.me=await user.id();}catch(e){}try{S.isOwner=await user.isOwner();}catch(e){}try{S.isAdmin=await user.canEdit();}catch(e){}try{S.canWrite=await user.can('data.write');}catch(e){}}
  const doc=d=>({id:d.id,...clone(d.data())});
  db.collection('tasks').onSnapshot(s=>{S.tasks=s.docs.map(d=>{const x=doc(d);x.checklist=x.checklist||[];x.owners=x.owners||[];return x;});S.mode='live';render();resolveNames();},e=>console.error(e));
  db.collection('notes').onSnapshot(s=>{S.notes=s.docs.map(doc);if(live())render();resolveNames();},e=>console.error(e));
  db.collection('files').onSnapshot(s=>{S.files=s.docs.map(doc);if(live())render();resolveNames();},e=>console.error(e));
  db.collection('products').onSnapshot(s=>{S.products=s.docs.map(doc);if(live())render();},e=>console.error(e));
  db.collection('people').onSnapshot(s=>{const m={};s.docs.forEach(d=>m[d.id]=clone(d.data()));S.people=m;if(live())render();},e=>console.error(e));
  db.collection('claims').onSnapshot(s=>{const m={};s.docs.forEach(d=>{const x=d.data();if(x&&x.personId)m[d.id]=x.personId;});S.claims=m;if(live())render();resolveNames();},e=>console.error(e));
  db.collection('reminderLog').onSnapshot(s=>{S.logs=s.docs.map(doc);if(live())render();},e=>console.error(e));
  db.doc('settings/reminders').onSnapshot(s=>{S.settings=s.exists?clone(s.data()):null;if(live())render();},e=>console.error(e));
})();
})();
