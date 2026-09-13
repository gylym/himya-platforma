// SUPABASE_SERVICE_ROLE_KEY exists only in the Edge Function environment.
// Never include it in config.js, HTML, browser requests, logs, or GitHub secrets output.
const json = (body: unknown,status=200,origin='') => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin'}});
Deno.serve(async request => {
 const origin=request.headers.get('origin')||'';
 const allowed=(Deno.env.get('ALLOWED_ORIGINS')||'https://gylym.github.io').split(',');
 if(origin&&!allowed.includes(origin))return json({message:'Origin denied'},403);
 if(request.method==='OPTIONS')return new Response(null,{headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'apikey,content-type','Access-Control-Allow-Methods':'POST','Vary':'Origin'}});
 if(request.method!=='POST')return json({message:'Method not allowed'},405,origin);
 const url=Deno.env.get('SUPABASE_URL')!,secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,key=Deno.env.get('SUPABASE_ANON_KEY')!;
 const headers={apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'};
 try{
  const {username,password}=await request.json();
  if(typeof username!=='string'||typeof password!=='string'||password.length>1024||!(/^[a-z0-9_]{3,32}$/i.test(username)))return json({message:'Email/логин немесе пароль қате'},400,origin);
  const normalized=username.toLowerCase();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
  const rateKey=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  const limit=await fetch(url+'/rest/v1/rpc/consume_login_attempt',{method:'POST',headers,body:JSON.stringify({rate_key:rateKey})});
  if(!limit.ok)throw new Error('rate service');if(!(await limit.json()))return json({message:'Әрекет саны шектелді. 15 минуттан кейін қайталаңыз'},429,origin);
  const profile=await fetch(url+'/rest/v1/profiles?username=eq.'+encodeURIComponent(normalized)+'&select=email&limit=1',{headers});
  if(!profile.ok)throw new Error('profile service');const rows=await profile.json();
  // Always use Auth to verify the password; no password hashes or credentials in profiles.
  const auth=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:rows[0]?.email||'missing-account@example.invalid',password})});
  if(!auth.ok)return json({message:'Email/логин немесе пароль қате'},401,origin);
  return json(await auth.json(),200,origin);
 }catch{return json({message:'Кіру қызметі уақытша қолжетімсіз. Қайта әрекет жасаңыз'},503,origin);}
});
