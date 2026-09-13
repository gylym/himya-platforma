import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile,filterMaterials,errorMessage } from '../platform-utils.js';
import { SupabaseStore } from '../store.js';
let storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
test('file size and extension checks',()=>{for(const name of ['a.pdf','a.doc','a.docx','a.ppt','a.pptx','a.png','a.mp4'])assert.doesNotThrow(()=>validateFile({name,size:40}));for(const file of [null,{name:'a.pdf',size:0},{name:'a.pdf',size:20971521},{name:'a.html',size:1},{name:'a.svg',size:100}])assert.throws(()=>validateFile(file));});
test('Kazakh search and combined filters',()=>{const rows=[{title:'Химиялық байланыс',filename:'a.pdf',type:'pdf',subject:'Химия',category:'Теория'},{title:'Ерітінділер',filename:'b.pptx',type:'ppt',subject:'Химия',category:'Презентация'}];assert.equal(filterMaterials(rows,{query:'  ХИМИЯЛЫҚ ',type:'pdf',category:'Теория'}).length,1);assert.equal(filterMaterials(rows,{query:'жоқ'}).length,0);});
test('publishable API key is never sent as bearer JWT',()=>{assert.equal(new SupabaseStore('https://example.test','sb_publishable_test').headers().Authorization,undefined);});
test('concurrent expired sessions refresh only once',async()=>{storage.clear();const store=new SupabaseStore('https://example.test','key');store.saveSession({access_token:'old',refresh_token:'refresh',expires_at:1});let count=0;store.request=async()=>{count++;await new Promise(r=>setTimeout(r,20));return{access_token:'new',refresh_token:'new-refresh',expires_in:3600};};const sessions=await Promise.all(Array.from({length:8},()=>store.validSession()));assert.equal(count,1);assert.ok(sessions.every(s=>s.access_token==='new'));});
test('invalid refresh clears stale authorization',async()=>{storage.clear();const store=new SupabaseStore('https://example.test','key');store.saveSession({access_token:'old',refresh_token:'refresh',expires_at:1});store.request=async()=>{throw Object.assign(new Error('expired'),{status:400});};assert.equal(await store.validSession(),null);assert.equal(store.session(),null);});
test('email confirmation is a successful pending registration',async()=>{storage.clear();const store=new SupabaseStore('https://example.test','key');store.request=async()=>({user:{id:'id'}});assert.deepEqual(await store.register({displayName:'QA',email:'qa@example.test',password:'12345678',username:'qa_user'}),{confirmationRequired:true});assert.equal(store.session(),null);});
test('login determines role from the verified server profile',async()=>{storage.clear();const store=new SupabaseStore('https://example.test','key');store.request=async()=>({access_token:'token'});store.currentUser=async()=>({id:'id',role:'admin'});assert.equal((await store.login({email:'admin@example.test',password:'test'})).role,'admin');});
test('storage URLs are signed and expire promptly',async()=>{storage.clear();const store=new SupabaseStore('https://example.test','key');store.validSession=async()=>null;store.request=async(path,options)=>{assert.ok(path.includes('/object/sign/'));assert.equal(JSON.parse(options.body).expiresIn,60);return{signedURL:'/object/sign/content-assets/a.pdf?token=signature'};};const url=await store.resourceUrl({storage_path:'a.pdf',filename:'a.pdf'});assert.equal(url,'https://example.test/storage/v1/object/sign/content-assets/a.pdf?token=signature');});
test('errors provide readable feedback',()=>assert.equal(errorMessage('Invalid login credentials'),'Email/логин немесе пароль қате'));

function pending(){let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});return {promise,resolve,reject};}
test('late token refresh cannot restore an account after logout',async()=>{
 storage.clear();const store=new SupabaseStore('https://example.test','key'),response=pending();
 store.saveSession({access_token:'old',refresh_token:'refresh',expires_at:1});
 store.request=async path=>path.includes('refresh_token')?response.promise:{};
 const refresh=store.validSession();await Promise.resolve();await store.logout();
 response.resolve({access_token:'late',refresh_token:'late-refresh',expires_in:3600});
 assert.equal(await refresh,null);assert.equal(store.session(),null);
});
test('late refresh cannot overwrite a newer account session',async()=>{
 storage.clear();const store=new SupabaseStore('https://example.test','key'),response=pending();
 store.saveSession({access_token:'old',refresh_token:'refresh',expires_at:1});store.request=()=>response.promise;
 const refresh=store.validSession();await Promise.resolve();
 store.saveSession({access_token:'new-account',refresh_token:'new-account-refresh',expires_at:9999999999});
 response.resolve({access_token:'late',refresh_token:'late-refresh',expires_in:3600});
 assert.equal((await refresh).access_token,'new-account');
});
test('late failed refresh does not clear a newer account',async()=>{
 storage.clear();const store=new SupabaseStore('https://example.test','key'),response=pending();
 store.saveSession({access_token:'old',refresh_token:'refresh',expires_at:1});store.request=()=>response.promise;
 const refresh=store.validSession();await Promise.resolve();
 store.saveSession({access_token:'new-account',refresh_token:'new-account-refresh',expires_at:9999999999});
 response.reject(Object.assign(new Error('expired'),{status:400}));
 assert.equal((await refresh).access_token,'new-account');
});
test('logout cancels an in-flight login',async()=>{
 storage.clear();const store=new SupabaseStore('https://example.test','key'),response=pending();store.request=()=>response.promise;
 const login=store.login({email:'qa@example.test',password:'test'});await store.logout();
 response.resolve({access_token:'late'});await assert.rejects(login,/тоқтатылды/);assert.equal(store.session(),null);
});
test('logout response does not clear a later login',async()=>{
 storage.clear();const store=new SupabaseStore('https://example.test','key'),response=pending();store.saveSession({access_token:'old'});
 store.request=path=>path.includes('/logout')?response.promise:Promise.resolve({access_token:'new'});store.currentUser=async()=>({id:'new'});
 const logout=store.logout();await store.login({email:'qa@example.test',password:'test'});response.resolve({});await logout;
 assert.equal(store.session().access_token,'new');
});
test('registration validates required values before contacting Auth',async()=>{
 const store=new SupabaseStore('https://example.test','key');store.request=()=>assert.fail('must not send invalid registration');
 const valid={displayName:'QA',email:'qa@example.test',password:'12345678',username:'qa_user'};
 for(const patch of [{displayName:''},{email:'invalid'},{password:'123'},{username:'a!'},{role:'admin'}])await assert.rejects(store.register({...valid,...patch}));
});
test('empty update response is reported as denied or missing, not success',async()=>{
 const store=new SupabaseStore('https://example.test','key');store.validSession=async()=>({access_token:'test'});store.request=async()=>[];
 await assert.rejects(store.updateContent('missing',{title:'New title'}),/рұқсатыңыз/);await assert.rejects(store.saveSettings({}),/сақталмады/);
});
test('catalog content fetch reads more than the API row limit',async()=>{
 const store=new SupabaseStore('https://example.test','key');store.validSession=async()=>null;let calls=0;
 store.request=async path=>{calls++;return path.includes('offset=0')?Array.from({length:1000},(_,id)=>({id,is_published:true})):[{id:1000,is_published:true}];};
 assert.equal((await store.listContent()).length,1001);assert.equal(calls,2);
});
test('unauthenticated progress saving has readable error',async()=>{
 const store=new SupabaseStore('https://example.test','key');store.validSession=async()=>null;
 await assert.rejects(store.saveProgress('test',{progress:50}),/жүйеге кіріңіз/);
});
function successfulUpload(){globalThis.XMLHttpRequest=class {upload={};status=200;responseText='{}';open(){}setRequestHeader(){}send(){queueMicrotask(()=>this.onload());}};}
test('metadata failure reconciles storage and removes only an unregistered upload',async()=>{
 successfulUpload();const store=new SupabaseStore('https://example.test','key');store.validSession=async()=>({access_token:'test'});let cleaned=false;
 store.request=async(path,options)=>{if(options.method==='POST')throw new Error('metadata rejected');if(options.method==='DELETE'){cleaned=true;return {};}return [];};
 await assert.rejects(store.uploadResource('item',{name:'test.pdf',size:20,type:'application/pdf'}),/metadata rejected/);assert.ok(cleaned);
});
test('lost metadata response preserves a successfully registered upload',async()=>{
 successfulUpload();const store=new SupabaseStore('https://example.test','key');store.validSession=async()=>({access_token:'test'});
 store.request=async(path,options)=>{if(options.method==='POST')throw new Error('network');if(options.method==='DELETE')assert.fail('must preserve registered file');return [{id:'confirmed'}];};
 assert.equal((await store.uploadResource('item',{name:'test.pdf',size:20,type:'application/pdf'})).id,'confirmed');
});
