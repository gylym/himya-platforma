import { errorMessage, uploadRequest, validateFile } from "./platform-utils.js";
const KEYS = { localToken:"chem_server_session_v1", supabase:"chem_supabase_session_v1" };
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function safeJson(value, fallback) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }

export class LocalApiStore {
  mode = "local-server";
  token() { return ""; }
  headers(extra={}) { const token=this.token(); return { ...(token?{Authorization:`Bearer ${token}`}:{}) , ...extra }; }
  async request(path, options={}) {
    const response=await fetch(`/api${path}`,{...options,headers:this.headers(options.headers||{})});
    const data=await response.json().catch(()=>null);
    if(!response.ok) throw new Error(data?.message || "Сұрау орындалмады");
    return data;
  }
  async init() { return this.currentUser(); }
  async getSettings() { return this.request("/settings"); }
  async saveSettings(settings) { return this.request("/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)}); }
  async currentUser() { return (await this.request("/session")).user; }
  async register(payload) { const data=await this.request("/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,email:normalizeEmail(payload.email)})});localStorage.setItem(KEYS.localToken,"cookie:"+Date.now());return data.user; }
  async login(payload) { const data=await this.request("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,email:normalizeEmail(payload.email)})});localStorage.setItem(KEYS.localToken,"cookie:"+Date.now());return data.user; }
  async logout() { await this.request("/logout",{method:"POST"}).catch(()=>null);localStorage.removeItem(KEYS.localToken); }
  async listContent(adminView=false) { return this.request(`/content${adminView?"?admin=1":""}`); }
  async createContent(input) { return this.request("/content",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)}); }
  async updateContent(id,patch) { return this.request(`/content/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)}); }
  async reorderContent(ids) { return this.request("/content/reorder",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids})}); }
  async deleteContent(id) { return this.request(`/content/${encodeURIComponent(id)}`,{method:"DELETE"}); }
  async listUsers() { return this.request("/users"); }
  async updateUserRole(id,role) { return this.request(`/users/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({role})}); }
  async listResources(itemId) { return this.request(`/resources?item_id=${encodeURIComponent(itemId)}`); }
  async uploadResource(itemId,file,onProgress) { return uploadRequest("/api/resources",this.headers({"X-Item-Id":itemId,"X-Filename":encodeURIComponent(file.name),"Content-Type":file.type||"application/octet-stream"}),file,onProgress); }
  async listPopularity(){return this.request("/popularity");}
  async listAllResources(){ return this.request("/resources"); }
  async updateResourceMetadata(id,patch){return this.request(`/resources/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});}
  async resourceUrl(resource){ return resource.url; }
  async deleteResource(id) { return this.request(`/resources/${encodeURIComponent(id)}`,{method:"DELETE"}); }
  async getProgress() { return this.request("/progress"); }
  async saveProgress(itemId,patch) { return this.request("/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({item_id:itemId,...patch})}); }
  async submitQuiz(itemId,answers) { return this.saveProgress(itemId,{progress:100,completed:true,score:0,max_score:answers.length,quiz_answers:answers}); }
  async recordView(itemId) { return this.saveProgress(itemId,{view:true}); }
  async getAnalytics() { return this.request("/analytics"); }
}

export class SupabaseStore {
  mode = "supabase";
  constructor(url,anonKey){this.url=url.replace(/\/$/,"");this.key=anonKey;this.authVersion=0;}
  session(){return safeJson(localStorage.getItem(KEYS.supabase),null);}
  saveSession(session){if(session)localStorage.setItem(KEYS.supabase,JSON.stringify(session));else localStorage.removeItem(KEYS.supabase);}
  headers(token,extra={}){return{apikey:this.key,...(token?{Authorization:`Bearer ${token}`}:{ }),"Content-Type":"application/json",...extra};}
  async request(path,options={}) {
    let response; try { response=await fetch(`${this.url}${path}`,{...options,signal:options.signal||AbortSignal.timeout(30000)}); }
    catch(error){ throw new Error(errorMessage(error)); }
    const data=await response.json().catch(()=>null);
    if(!response.ok){const error=new Error(errorMessage(data?.msg||data?.message||data?.error_description||data?.error||'Сұрау орындалмады'));error.status=response.status;throw error;}
    return data;
  }
  async init(){await this.currentUser();}
  async getSettings(){const rows=await this.request("/rest/v1/site_settings?id=eq.main&select=settings",{headers:this.headers((await this.validSession())?.access_token)});return rows?.[0]?.settings||{};}
  async saveSettings(settings){const session=await this.validSession();const rows=await this.request("/rest/v1/site_settings?id=eq.main",{method:"PATCH",headers:this.headers(session?.access_token,{Prefer:"return=representation"}),body:JSON.stringify({settings})});if(!rows?.[0])throw new Error('Баптаулар сақталмады. Әкімші рұқсаты қажет');return rows[0].settings;}
  async validSession(){
    const refresh=async()=>{
      let session=this.session(); if(!session?.access_token)return null;
      const originalToken=session.refresh_token,version=this.authVersion;
      const expiry=session.expires_at||((()=>{try{return JSON.parse(atob(session.access_token.split('.')[1])).exp;}catch{return 0;}})());
      if(expiry*1000>Date.now()+60000)return session;
      if(!session.refresh_token){this.saveSession(null);return null;}
      try{session=await this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:this.headers(null),body:JSON.stringify({refresh_token:originalToken})});
        if(version!==this.authVersion||this.session()?.refresh_token!==originalToken)return this.session();
        this.saveSession({...session,expires_at:session.expires_at||Math.floor(Date.now()/1000)+(session.expires_in||3600)});return this.session();}
      catch(error){if(version!==this.authVersion||this.session()?.refresh_token!==originalToken)return this.session();if([400,401,403].includes(error.status)){this.saveSession(null);return null;}throw error;}
    };
    if(!this.refreshing)this.refreshing=(navigator.locks?navigator.locks.request('chem-auth-refresh',refresh):refresh()).finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  async currentUser(){
    const session=await this.validSession();if(!session)return null;
    let user;try{user=await this.request('/auth/v1/user',{headers:this.headers(session.access_token)});}catch(error){if([401,403].includes(error.status)){if(this.session()?.access_token===session.access_token)this.saveSession(null);return null;}throw error;}
    const rows=await this.request(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,display_name,email,role`,{headers:this.headers(session.access_token)});
    if(!rows?.[0])throw new Error('Профиль табылмады. Әкімшіге хабарласыңыз');
    if(this.session()?.access_token!==session.access_token)return null;
    return {...rows[0],email:user.email||rows[0].email};
  }
  async register({displayName,email,password,username,role='student'}){
    if(!['student','university_student'].includes(role))throw new Error('Бұл рөлмен тіркелуге болмайды');
    if(!String(displayName||'').trim())throw new Error('Атыңызды енгізіңіз');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)))throw new Error('Email мекенжайын дұрыс енгізіңіз');
    if(typeof password!=='string'||password.length<8)throw new Error('Пароль кемінде 8 таңбадан тұруы керек');
    if(username&&!/^[a-z0-9_]{3,32}$/i.test(username.trim()))throw new Error('Логин 3–32 латын әрпі, сан немесе _ таңбасынан тұруы керек');
    const version=++this.authVersion;
    const session=await this.request('/auth/v1/signup',{method:'POST',headers:this.headers(null),body:JSON.stringify({email:normalizeEmail(email),password,data:{display_name:displayName.trim(),username:username?.trim().toLowerCase(),role}})});
    if(version!==this.authVersion)throw new Error('Кіру әрекеті тоқтатылды');
    if(!session?.access_token)return {confirmationRequired:true};
    this.saveSession(session);return this.currentUser();
  }
  async login({email,password}){
    const identifier=normalizeEmail(email);
    if(!identifier||!password)throw new Error('Email/логин мен парольді енгізіңіз');
    const version=++this.authVersion;
    const path=identifier.includes('@')?'/auth/v1/token?grant_type=password':'/functions/v1/username-login';
    const session=await this.request(path,{method:'POST',headers:this.headers(null),body:JSON.stringify(identifier.includes('@')?{email:identifier,password}:{username:identifier,password})});
    if(version!==this.authVersion)throw new Error('Кіру әрекеті тоқтатылды');
    this.saveSession(session);try{return await this.currentUser();}catch(error){if(version===this.authVersion)this.saveSession(null);throw error;}
  }
  async logout(){
    const version=++this.authVersion,session=this.session();this.saveSession(null);
    let revoked=true;try{if(session?.access_token)await this.request('/auth/v1/logout?scope=local',{method:'POST',headers:this.headers(session.access_token)});}catch{revoked=false;}
    // A newer login must survive a delayed logout response.
    if(version===this.authVersion)this.saveSession(null);return {revoked};
  }
  async listContent(adminView=false){
    const session=await this.validSession(),all=[];
    for(let offset=0;;offset+=1000){const rows=await this.request(`/rest/v1/content_items?select=*&order=sort_order.asc,id.asc&limit=1000&offset=${offset}`,{headers:this.headers(session?.access_token)})||[];all.push(...rows);if(rows.length<1000)return all.filter(item=>adminView||item.is_published);}
  }
  async createContent(input){const session=await this.validSession();const rows=await this.request("/rest/v1/content_items",{method:"POST",headers:this.headers(session?.access_token,{Prefer:"return=representation"}),body:JSON.stringify(input)});if(!rows?.[0])throw new Error('Материал сақталмады. Рұқсатыңызды тексеріңіз');return rows[0];}
  async updateContent(id,patch){const session=await this.validSession();const rows=await this.request(`/rest/v1/content_items?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:this.headers(session?.access_token,{Prefer:"return=representation"}),body:JSON.stringify(patch)});if(!rows?.[0])throw new Error('Материал табылмады немесе өңдеуге рұқсатыңыз жоқ');return rows[0];}
  async reorderContent(ids){const session=await this.validSession();await this.request("/rest/v1/rpc/admin_reorder_content",{method:"POST",headers:this.headers(session?.access_token),body:JSON.stringify({p_ids:ids})});return{ok:true};}
  async deleteContent(id){
    const session=await this.validSession();const items=await this.listContent(true),ids=new Set([id]);
    for(let n=0;n<items.length;n++)for(const item of items)if(ids.has(item.parent_id))ids.add(item.id);
    const resources=await this.listAllResources();for(const resource of resources)if(ids.has(resource.item_id))await this.deleteResource(resource.id);
    await this.request(`/rest/v1/content_items?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:this.headers(session?.access_token)});
  }
  async listUsers(){const session=await this.validSession();return this.request("/rest/v1/profiles?select=id,display_name,email,role,created_at&order=created_at.desc",{headers:this.headers(session?.access_token)});}
  async updateUserRole(id,role){const session=await this.validSession();await this.request("/rest/v1/rpc/admin_set_user_role",{method:"POST",headers:this.headers(session?.access_token),body:JSON.stringify({target_user:id,new_role:role})});}
  async listResources(itemId){
    const session=await this.validSession();
    return await this.request(`/rest/v1/content_resources?item_id=eq.${encodeURIComponent(itemId)}&select=*&order=created_at.asc`,{headers:this.headers(session?.access_token)})||[];
  }
  async listAllResources(){const session=await this.validSession(),all=[];for(let offset=0;;offset+=1000){const rows=await this.request(`/rest/v1/content_resources?select=*&order=created_at.desc,id.asc&limit=1000&offset=${offset}`,{headers:this.headers(session?.access_token)})||[];all.push(...rows);if(rows.length<1000)return all;}}
  async listPopularity(){const session=await this.validSession();return this.request("/rest/v1/rpc/material_popularity",{method:"POST",headers:this.headers(session?.access_token),body:"{}"});}
  async updateResourceMetadata(id,patch){const session=await this.validSession();const rows=await this.request(`/rest/v1/content_resources?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:this.headers(session?.access_token,{Prefer:'return=representation'}),body:JSON.stringify(patch)});if(!rows?.[0])throw new Error('Материал сақталмады');return rows[0];}
  async resourceUrl(resource,download=false){
    const session=await this.validSession();const path=resource.storage_path.split('/').map(encodeURIComponent).join('/');
    const data=await this.request(`/storage/v1/object/sign/content-assets/${path}`,{method:'POST',headers:this.headers(session?.access_token),body:JSON.stringify({expiresIn:60,...(download?{download:resource.filename}:{})})});
    const signed=data.signedURL||data.signedUrl;if(!signed)throw new Error('Файл сілтемесі алынбады');
    const url=new URL(signed.startsWith('/object/')?'/storage/v1'+signed:signed,this.url);
    if(download)url.searchParams.set('download',resource.filename);return url.href;
  }
  async uploadResource(itemId,file,onProgress=()=>{}){
    validateFile(file);const session=await this.validSession();if(!session)throw new Error('Алдымен жүйеге кіріңіз');
    const storagePath=`${itemId}/${uid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    await uploadRequest(`${this.url}/storage/v1/object/content-assets/${storagePath}`,{apikey:this.key,Authorization:`Bearer ${session.access_token}`,'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},file,onProgress);
    try{
      const rows=await this.request('/rest/v1/content_resources',{method:'POST',headers:this.headers(session.access_token,{Prefer:'return=representation'}),body:JSON.stringify({item_id:itemId,filename:file.name,storage_path:storagePath,mime_type:file.type||'application/octet-stream',size:file.size})});
      if(!rows?.[0])throw new Error('Файл мәліметі сақталмады');onProgress(100);return rows[0];
    }catch(error){
      // Reconcile an uncertain response before removing the uploaded object.
      let rows;try{rows=await this.request(`/rest/v1/content_resources?storage_path=eq.${encodeURIComponent(storagePath)}&select=*`,{headers:this.headers(session.access_token)});}catch{throw new Error('Файл жіберілді, бірақ сақталуын растау мүмкін болмады. Тізімді жаңартыңыз');}
      if(rows?.[0]){onProgress(100);return rows[0];}
      await this.request('/storage/v1/object/content-assets',{method:'DELETE',headers:this.headers(session.access_token),body:JSON.stringify({prefixes:[storagePath]})}).catch(()=>null);throw error;
    }
  }
  async deleteResource(id){
    const session=await this.validSession();if(!session)throw new Error('Алдымен жүйеге кіріңіз');
    const rows=await this.request(`/rest/v1/content_resources?id=eq.${encodeURIComponent(id)}&select=*`,{headers:this.headers(session.access_token)});
    if(!rows?.[0])return;
    await this.request('/storage/v1/object/content-assets',{method:'DELETE',headers:this.headers(session.access_token),body:JSON.stringify({prefixes:[rows[0].storage_path]})});
    await this.request(`/rest/v1/content_resources?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:this.headers(session.access_token)});
  }
  async getProgress(){const session=await this.validSession();if(!session)return[];return this.request(`/rest/v1/user_progress?user_id=eq.${session.user.id}&select=*&order=updated_at.desc`,{headers:this.headers(session.access_token)});}
  async saveProgress(itemId,patch){const session=await this.validSession();if(!session)throw new Error('Алдымен жүйеге кіріңіз');const old=(await this.request(`/rest/v1/user_progress?user_id=eq.${session.user.id}&item_id=eq.${encodeURIComponent(itemId)}&select=*`,{headers:this.headers(session.access_token)}))?.[0]||{},isTest=patch.score!==undefined&&patch.max_score!==undefined,stamp=new Date().toISOString();const record={user_id:session.user.id,item_id:itemId,progress:patch.progress??old.progress??0,completed:patch.completed??old.completed??false,score:patch.score??old.score??null,max_score:patch.max_score??old.max_score??null,quiz_answers:patch.quiz_answers??old.quiz_answers??[],attempt_count:(old.attempt_count||0)+(isTest?1:0),tested_at:isTest?stamp:old.tested_at,view_count:(old.view_count||0)+(patch.view?1:0),last_opened:patch.view?stamp:old.last_opened};const rows=await this.request("/rest/v1/user_progress?on_conflict=user_id,item_id",{method:"POST",headers:this.headers(session.access_token,{Prefer:"resolution=merge-duplicates,return=representation"}),body:JSON.stringify(record)});return rows?.[0];}
  async submitQuiz(itemId,answers){const session=await this.validSession();const rows=await this.request("/rest/v1/rpc/submit_quiz_attempt",{method:"POST",headers:this.headers(session.access_token),body:JSON.stringify({p_item_id:itemId,p_answers:answers})});return rows?.[0]||rows;}
  async recordView(itemId){return this.saveProgress(itemId,{view:true});}
  async getAnalytics(){const session=await this.validSession();const [users,details,content]=await Promise.all([this.listUsers(),this.request("/rest/v1/user_progress?select=*&order=updated_at.desc",{headers:this.headers(session.access_token)}),this.listContent(true)]);const contentMap=Object.fromEntries(content.map((item)=>[item.id,item.title]));const detailRows=(details||[]).map((row)=>({...row,title:contentMap[row.item_id],...users.find((user)=>user.id===row.user_id)}));const summaries=users.filter((user)=>user.role!=="admin").map((user)=>{const rows=detailRows.filter((row)=>row.user_id===user.id);const average=(values)=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;return{...user,average_progress:average(rows.map((row)=>row.progress||0)),completed_count:rows.filter((row)=>row.completed).length,average_score:average(rows.filter((row)=>row.max_score).map((row)=>row.score*100/row.max_score)),last_active:rows.map((row)=>row.last_opened).filter(Boolean).sort().at(-1)||null};});return{users:summaries,details:detailRows};}
}

export function createStore(){const config=window.__CHEM_CONFIG__||{};return config.supabaseUrl&&config.supabaseAnonKey?new SupabaseStore(config.supabaseUrl,config.supabaseAnonKey):new LocalApiStore();}
