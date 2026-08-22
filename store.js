const KEYS = { localToken:"chem_server_session_v1", supabase:"chem_supabase_session_v1" };
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function safeJson(value, fallback) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }

export class LocalApiStore {
  mode = "local-server";
  token() { return localStorage.getItem(KEYS.localToken) || ""; }
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
  async register(payload) { const data=await this.request("/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,email:normalizeEmail(payload.email)})});localStorage.setItem(KEYS.localToken,data.token);return data.user; }
  async login(payload) { const data=await this.request("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,email:normalizeEmail(payload.email)})});localStorage.setItem(KEYS.localToken,data.token);return data.user; }
  async logout() { await this.request("/logout",{method:"POST"}).catch(()=>null);localStorage.removeItem(KEYS.localToken); }
  async listContent(adminView=false) { return this.request(`/content${adminView?"?admin=1":""}`); }
  async createContent(input) { return this.request("/content",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)}); }
  async updateContent(id,patch) { return this.request(`/content/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)}); }
  async reorderContent(ids) { return this.request("/content/reorder",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids})}); }
  async deleteContent(id) { return this.request(`/content/${encodeURIComponent(id)}`,{method:"DELETE"}); }
  async listUsers() { return this.request("/users"); }
  async updateUserRole(id,role) { return this.request(`/users/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({role})}); }
  async listResources(itemId) { return this.request(`/resources?item_id=${encodeURIComponent(itemId)}`); }
  async uploadResource(itemId,file) { return this.request("/resources",{method:"POST",headers:{"X-Item-Id":itemId,"X-Filename":encodeURIComponent(file.name),"Content-Type":file.type||"application/octet-stream"},body:file}); }
  async deleteResource(id) { return this.request(`/resources/${encodeURIComponent(id)}`,{method:"DELETE"}); }
  async getProgress() { return this.request("/progress"); }
  async saveProgress(itemId,patch) { return this.request("/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({item_id:itemId,...patch})}); }
  async submitQuiz(itemId,answers) { return this.saveProgress(itemId,{progress:100,completed:true,score:0,max_score:answers.length,quiz_answers:answers}); }
  async recordView(itemId) { return this.saveProgress(itemId,{view:true}); }
  async getAnalytics() { return this.request("/analytics"); }
}

export class SupabaseStore {
  mode = "supabase";
  constructor(url,anonKey){this.url=url.replace(/\/$/,"");this.key=anonKey;}
  session(){return safeJson(localStorage.getItem(KEYS.supabase),null);}
  saveSession(session){if(session)localStorage.setItem(KEYS.supabase,JSON.stringify(session));else localStorage.removeItem(KEYS.supabase);}
  headers(token,extra={}){return{apikey:this.key,Authorization:`Bearer ${token||this.key}`,"Content-Type":"application/json",...extra};}
  async request(path,options={}){const response=await fetch(`${this.url}${path}`,options);if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.msg||data.message||data.error_description||"Сұрау орындалмады");}if(response.status===204)return null;return response.json().catch(()=>null);}
  async init(){await this.currentUser();}
  async getSettings(){const rows=await this.request("/rest/v1/site_settings?id=eq.main&select=settings",{headers:this.headers((await this.validSession())?.access_token)});return rows?.[0]?.settings||{};}
  async saveSettings(settings){const session=await this.validSession();const rows=await this.request("/rest/v1/site_settings?id=eq.main",{method:"PATCH",headers:this.headers(session?.access_token,{Prefer:"return=representation"}),body:JSON.stringify({settings})});return rows?.[0]?.settings||settings;}
  async validSession(){let session=this.session();if(!session)return null;const expiresAt=(session.expires_at||0)*1000;if(expiresAt&&expiresAt<Date.now()+60000&&session.refresh_token){session=await this.request("/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:this.headers(null),body:JSON.stringify({refresh_token:session.refresh_token})});this.saveSession(session);}return session;}
  async currentUser(){const session=await this.validSession();if(!session?.user)return null;const rows=await this.request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,display_name,email,role`,{headers:this.headers(session.access_token)});const profile=rows?.[0];return profile?{...profile,email:profile.email||session.user.email}:null;}
  async register({displayName,email,password,role}){if(!["student","university_student"].includes(role))throw new Error("Бұл рөлмен тіркелуге болмайды");const session=await this.request("/auth/v1/signup",{method:"POST",headers:this.headers(null),body:JSON.stringify({email:normalizeEmail(email),password,data:{display_name:displayName.trim(),role}})});if(session?.access_token)this.saveSession(session);else throw new Error("Email растау қажет");return this.currentUser();}
  async login({email,password,role}){const session=await this.request("/auth/v1/token?grant_type=password",{method:"POST",headers:this.headers(null),body:JSON.stringify({email:normalizeEmail(email),password})});this.saveSession(session);const user=await this.currentUser();if(!user||user.role!==role){await this.logout();throw new Error("Таңдалған рөл сәйкес келмейді");}return user;}
  async logout(){const session=this.session();if(session?.access_token)await this.request("/auth/v1/logout",{method:"POST",headers:this.headers(session.access_token)}).catch(()=>null);this.saveSession(null);}
  async listContent(adminView=false){const session=await this.validSession();const rows=await this.request("/rest/v1/content_items?select=*&order=sort_order.asc",{headers:this.headers(session?.access_token)});return(rows||[]).filter((item)=>adminView||item.is_published);}
  async createContent(input){const session=await this.validSession();const rows=await this.request("/rest/v1/content_items",{method:"POST",headers:this.headers(session?.access_token,{Prefer:"return=representation"}),body:JSON.stringify(input)});return rows?.[0];}
  async updateContent(id,patch){const session=await this.validSession();const rows=await this.request(`/rest/v1/content_items?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:this.headers(session?.access_token,{Prefer:"return=representation"}),body:JSON.stringify(patch)});return rows?.[0];}
  async reorderContent(ids){const session=await this.validSession();await this.request("/rest/v1/rpc/admin_reorder_content",{method:"POST",headers:this.headers(session?.access_token),body:JSON.stringify({p_ids:ids})});return{ok:true};}
  async deleteContent(id){const session=await this.validSession();await this.request(`/rest/v1/content_items?id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:this.headers(session?.access_token)});}
  async listUsers(){const session=await this.validSession();return this.request("/rest/v1/profiles?select=id,display_name,email,role,created_at&order=created_at.desc",{headers:this.headers(session?.access_token)});}
  async updateUserRole(id,role){const session=await this.validSession();await this.request("/rest/v1/rpc/admin_set_user_role",{method:"POST",headers:this.headers(session?.access_token),body:JSON.stringify({target_user:id,new_role:role})});}
  async listResources(itemId){const session=await this.validSession();const rows=await this.request(`/rest/v1/content_resources?item_id=eq.${encodeURIComponent(itemId)}&select=*&order=created_at.asc`,{headers:this.headers(session?.access_token)});return(rows||[]).map((row)=>({...row,url:`${this.url}/storage/v1/object/public/content-assets/${row.storage_path}`}));}
  async uploadResource(itemId,file){const session=await this.validSession();const storagePath=`${itemId}/${uid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;await this.request(`/storage/v1/object/content-assets/${storagePath}`,{method:"POST",headers:{apikey:this.key,Authorization:`Bearer ${session.access_token}`,"Content-Type":file.type||"application/octet-stream","x-upsert":"false"},body:file});const rows=await this.request("/rest/v1/content_resources",{method:"POST",headers:this.headers(session.access_token,{Prefer:"return=representation"}),body:JSON.stringify({item_id:itemId,filename:file.name,storage_path:storagePath,mime_type:file.type||"application/octet-stream",size:file.size})});return{...rows[0],url:`${this.url}/storage/v1/object/public/content-assets/${storagePath}`};}
  async deleteResource(id){const session=await this.validSession();const rows=await this.request(`/rest/v1/content_resources?id=eq.${encodeURIComponent(id)}&select=*`,{headers:this.headers(session.access_token)});if(rows?.[0]){await this.request(`/storage/v1/object/content-assets/${rows[0].storage_path}`,{method:"DELETE",headers:{apikey:this.key,Authorization:`Bearer ${session.access_token}`}});await this.request(`/rest/v1/content_resources?id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:this.headers(session.access_token)});}}
  async getProgress(){const session=await this.validSession();if(!session)return[];return this.request(`/rest/v1/user_progress?user_id=eq.${session.user.id}&select=*&order=updated_at.desc`,{headers:this.headers(session.access_token)});}
  async saveProgress(itemId,patch){const session=await this.validSession();const old=(await this.request(`/rest/v1/user_progress?user_id=eq.${session.user.id}&item_id=eq.${encodeURIComponent(itemId)}&select=*`,{headers:this.headers(session.access_token)}))?.[0]||{},isTest=patch.score!==undefined&&patch.max_score!==undefined,stamp=new Date().toISOString();const record={user_id:session.user.id,item_id:itemId,progress:patch.progress??old.progress??0,completed:patch.completed??old.completed??false,score:patch.score??old.score??null,max_score:patch.max_score??old.max_score??null,quiz_answers:patch.quiz_answers??old.quiz_answers??[],attempt_count:(old.attempt_count||0)+(isTest?1:0),tested_at:isTest?stamp:old.tested_at,view_count:(old.view_count||0)+(patch.view?1:0),last_opened:patch.view?stamp:old.last_opened};const rows=await this.request("/rest/v1/user_progress?on_conflict=user_id,item_id",{method:"POST",headers:this.headers(session.access_token,{Prefer:"resolution=merge-duplicates,return=representation"}),body:JSON.stringify(record)});return rows?.[0];}
  async submitQuiz(itemId,answers){const session=await this.validSession();const rows=await this.request("/rest/v1/rpc/submit_quiz_attempt",{method:"POST",headers:this.headers(session.access_token),body:JSON.stringify({p_item_id:itemId,p_answers:answers})});return rows?.[0]||rows;}
  async recordView(itemId){return this.saveProgress(itemId,{view:true});}
  async getAnalytics(){const session=await this.validSession();const [users,details,content]=await Promise.all([this.listUsers(),this.request("/rest/v1/user_progress?select=*&order=updated_at.desc",{headers:this.headers(session.access_token)}),this.listContent(true)]);const contentMap=Object.fromEntries(content.map((item)=>[item.id,item.title]));const detailRows=(details||[]).map((row)=>({...row,title:contentMap[row.item_id],...users.find((user)=>user.id===row.user_id)}));const summaries=users.filter((user)=>user.role!=="admin").map((user)=>{const rows=detailRows.filter((row)=>row.user_id===user.id);const average=(values)=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;return{...user,average_progress:average(rows.map((row)=>row.progress||0)),completed_count:rows.filter((row)=>row.completed).length,average_score:average(rows.filter((row)=>row.max_score).map((row)=>row.score*100/row.max_score)),last_active:rows.map((row)=>row.last_opened).filter(Boolean).sort().at(-1)||null};});return{users:summaries,details:detailRows};}
}

export function createStore(){const config=window.__CHEM_CONFIG__||{};return config.supabaseUrl&&config.supabaseAnonKey?new SupabaseStore(config.supabaseUrl,config.supabaseAnonKey):new LocalApiStore();}
