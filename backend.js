/* Supabase backend: login gate, then a window.claude.use() shim (db / user / assets)
   so app.js runs unchanged. All documents live in one table: docs(collection, id, data jsonb). */
(function(){
"use strict";
const CFG=window.NP_CONFIG||{};
const $=s=>document.querySelector(s);
const gate=$('#gate'),msg=$('#gateMsg'),btnIn=$('#gateLogin'),btnOut=$('#gateLogout');
function showGate(text,{login=false,logout=false,error=false}={}){
  gate.hidden=false;msg.textContent=text;msg.classList.toggle('gate-err',error);btnIn.hidden=!login;btnOut.hidden=!logout;
}
if(!window.supabase||!CFG.url||!CFG.anonKey){showGate('網站尚未完成設定（缺少 Supabase 連線資訊）。',{error:true});return;}
const sb=window.supabase.createClient(CFG.url,CFG.anonKey,{auth:{persistSession:true,detectSessionInUrl:true,flowType:'pkce'}});
const domain=(CFG.domain||'').toLowerCase();

function signIn(){
  sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,
    queryParams:{prompt:'select_account',...(domain?{hd:domain}:{})}}});
}
btnIn.addEventListener('click',signIn);
btnOut.addEventListener('click',async()=>{await sb.auth.signOut();showGate(`請使用 @${domain} 的 Google 帳號登入。`,{login:true});});

/* ---------- document cache + listeners ---------- */
const cache={};                 // collection -> Map(id -> data)
const colL={},docL={};          // collection -> [cb], 'c/id' -> [cb]
const coll=c=>cache[c]||(cache[c]=new Map());
const clone=o=>o==null?o:JSON.parse(JSON.stringify(o));
const split=p=>{const i=p.indexOf('/');return [p.slice(0,i),p.slice(i+1)];};
const qsnap=c=>({docs:[...coll(c)].map(([id,d])=>({id,data:()=>clone(d)}))});
const dsnap=(c,id)=>{const d=coll(c).get(id);return {id,exists:d!==undefined,data:()=>clone(d)};};
function emit(c,id){
  (colL[c]||[]).forEach(cb=>{try{cb(qsnap(c));}catch(e){console.error(e);}});
  if(id!=null)(docL[c+'/'+id]||[]).forEach(cb=>{try{cb(dsnap(c,id));}catch(e){console.error(e);}});
}
function applyRow(row){coll(row.collection).set(row.id,row.data);emit(row.collection,row.id);}
function dropRow(c,id){coll(c).delete(id);emit(c,id);}

function fail(e){
  const m=(e&&(e.message||e.error))||'';const err=new Error(m||'request failed');
  err.code=e&&(e.code==='42501'||/row-level security/i.test(m))?'permission_denied'
    :/exceed|too large|maximum allowed size/i.test(m)?'too_large'
    :/mime|content type/i.test(m)?'unsupported_type':'unknown';
  throw err;
}
const ok=r=>{if(r.error)fail(r.error);return r.data;};

const db={
  collection(c){return {
    onSnapshot(cb,onErr){(colL[c]||(colL[c]=[])).push(cb);queueMicrotask(()=>cb(qsnap(c)));return ()=>{colL[c]=colL[c].filter(x=>x!==cb);};},
    async add(data){const id=crypto.randomUUID();const row=ok(await sb.from('docs').insert({collection:c,id,data}).select().single());applyRow(row);return {id};}
  };},
  doc(path){const [c,id]=split(path);return {
    onSnapshot(cb,onErr){const k=c+'/'+id;(docL[k]||(docL[k]=[])).push(cb);queueMicrotask(()=>cb(dsnap(c,id)));return ()=>{docL[k]=docL[k].filter(x=>x!==cb);};},
    async set(data){applyRow(ok(await sb.from('docs').upsert({collection:c,id,data}).select().single()));},
    async update(patch){applyRow(ok(await sb.rpc('doc_merge',{p_collection:c,p_id:id,p_patch:patch})));},
    async delete(){ok(await sb.from('docs').delete().match({collection:c,id}));dropRow(c,id);}
  };}
};

/* ---------- file storage (private bucket, signed URLs) ---------- */
const urls={},pending=new Set();let urlTimer=null;
function fetchUrls(){
  urlTimer=null;const paths=[...pending];pending.clear();if(!paths.length)return;
  sb.storage.from('files').createSignedUrls(paths,3600).then(({data,error})=>{
    if(error){console.error(error);return;}
    data.forEach(x=>{if(x.signedUrl)urls[x.path]={u:x.signedUrl,t:Date.now()};});
    dispatchEvent(new Event('np-blob-urls'));
  });
}
const assets={
  url(path){const h=urls[path];if(h&&Date.now()-h.t<50*60*1000)return h.u;pending.add(path);if(!urlTimer)urlTimer=setTimeout(fetchUrls,0);return h?h.u:'#';},
  async upload(file){
    const safe=file.name.replace(/[^A-Za-z0-9._-]/g,'_').slice(-80)||'file';
    const path=crypto.randomUUID()+'/'+safe;
    ok(await sb.storage.from('files').upload(path,file,{contentType:file.type||undefined,upsert:false}));
    return {id:path,contentType:file.type,sizeBytes:file.size};
  }
};

/* ---------- user ---------- */
let me=null,admin=false;
const isUuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const user={
  id:async()=>me.id, isOwner:async()=>admin, canEdit:async()=>admin, can:async()=>true,
  async profiles(ids){
    const out={};const q=ids.filter(isUuid);if(!q.length)return out;
    const rows=ok(await sb.from('profiles').select('id,name').in('id',q));rows.forEach(r=>out[r.id]={name:r.name||''});return out;
  }
};

/* ---------- boot ---------- */
let started=false;
async function start(session){
  if(started)return;
  const email=(session.user.email||'').toLowerCase();
  if(domain&&!email.endsWith('@'+domain)){showGate(`${email} 不是公司帳號，請改用 @${domain} 的 Google 帳號登入。`,{logout:true,error:true});return;}
  started=true;me=session.user;showGate('正在載入資料…');
  // subscribe first so nothing written during the initial load is missed
  sb.channel('docs').on('postgres_changes',{event:'*',schema:'public',table:'docs'},p=>{
    if(p.eventType==='DELETE'){if(p.old&&p.old.collection)dropRow(p.old.collection,p.old.id);}
    else if(p.new)applyRow(p.new);
  }).subscribe();
  try{
    const [rows,adm]=await Promise.all([
      (async()=>{const all=[];for(let from=0;;from+=1000){const r=ok(await sb.from('docs').select('collection,id,data').range(from,from+999));all.push(...r);if(r.length<1000)return all;}})(),
      sb.rpc('is_admin')
    ]);
    rows.forEach(r=>coll(r.collection).set(r.id,r.data));
    admin=!!adm.data;
    // bind this login to the roster entry with the same email
    const claims=coll('claims');
    if(!claims.has(me.id)){
      const p=[...coll('people')].find(([,d])=>(d.email||'').toLowerCase()===email);
      if(p)await db.doc('claims/'+me.id).set({personId:p[0],at:Date.now()}).catch(console.error);
    }
  }catch(e){console.error(e);started=false;showGate('資料載入失敗，請重新整理頁面再試一次。',{logout:true,error:true});return;}
  window.claude={use:async n=>n==='db'?db:n==='user'?user:n==='assets'?assets:null};
  addAccount(email);
  const s=document.createElement('script');s.src='app.js';document.body.appendChild(s);
  gate.hidden=true;
}
function addAccount(email){
  const box=document.createElement('div');box.className='acct';
  box.innerHTML='<span></span><button class="btn sm" type="button">登出</button>';
  box.querySelector('span').textContent=email;
  box.querySelector('button').addEventListener('click',async()=>{await sb.auth.signOut();location.reload();});
  document.querySelector('.top .wrap').appendChild(box);
}

// defer: calling Supabase inside the auth callback can deadlock its session lock
sb.auth.onAuthStateChange((ev,session)=>{if(session)setTimeout(()=>start(session),0);});
sb.auth.getSession().then(({data})=>{
  if(data.session)start(data.session);
  else showGate(`請使用 @${domain} 的 Google 帳號登入。`,{login:true});
});
})();
