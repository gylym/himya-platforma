import json,os,secrets,subprocess,tempfile,time,unittest
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
ROOT=Path(__file__).resolve().parents[1]
class SecurityTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory();cls.base='http://127.0.0.1:4176';cls.password=secrets.token_urlsafe(24)
  cls.server=subprocess.Popen(['python3','server.py'],cwd=ROOT,env={**os.environ,'PORT':'4176','CHEM_DATA_DIR':cls.temp.name,'INITIAL_ADMIN_PASSWORD':cls.password},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  for _ in range(60):
   try:urlopen(cls.base+'/api/session',timeout=.2);break
   except Exception:time.sleep(.1)
 @classmethod
 def tearDownClass(cls):cls.server.terminate();cls.server.wait();cls.temp.cleanup()
 def call(self,method,path,data=None,token=None,headers=None):
  h=dict(headers or {});body=json.dumps(data).encode() if isinstance(data,dict) else data
  if isinstance(data,dict):h['Content-Type']='application/json'
  if token:h['Authorization']='Bearer '+token
  try:
   r=urlopen(Request(self.base+path,data=body,headers=h,method=method));raw=r.read();return r.status,json.loads(raw) if r.headers.get('Content-Type','').startswith('application/json') else raw
  except HTTPError as e:return e.code,json.loads(e.read()) if e.headers.get('Content-Type','').startswith('application/json') else None
 def test_complete_user_and_admin_flow_with_denials(self):
  status,user=self.call('POST','/api/register',{'displayName':'QA student','username':'qa_student','email':'qa@example.test','password':'qa-test-password','role':'student'});self.assertEqual(status,201)
  t=user['token'];self.assertEqual(self.call('GET','/api/session',token=t)[1]['user']['role'],'student')
  self.assertEqual(self.call('POST','/api/login',{'email':'qa_student','password':'qa-test-password'})[0],200)
  self.assertEqual(self.call('POST','/api/login',{'email':'qa_student','password':'incorrect'})[0],401)
  for route in ['/api/users','/api/analytics']:self.assertEqual(self.call('GET',route,token=t)[0],403)
  self.assertEqual(self.call('POST','/api/register',{'displayName':'bad','email':'bad@example.test','password':'12345678','role':'admin'})[0],400)
  self.assertEqual(self.call('POST','/api/register',{'displayName':'bad','email':'invalid','password':'12345678','role':'student'})[0],400)
  _,admin=self.call('POST','/api/login',{'email':'admin@chem.local','password':self.password});a=admin['token']
  content={'title':'QA chemistry','path':'/qa-private','area':'school','parent_id':'school-root','body':'<script>alert(1)</script><p>Read</p>','description':'Description','subject':'Химия','category':'Теория','is_published':False}
  self.assertEqual(self.call('POST','/api/content',content,t)[0],403)
  status,item=self.call('POST','/api/content',content,a);self.assertEqual(status,201);self.assertNotIn('script',item['body']);self.assertEqual(item['description'],'Description')
  h={'X-Item-Id':item['id'],'X-Filename':'qa.pdf','Content-Type':'application/pdf'}
  self.assertEqual(self.call('POST','/api/resources',b'%PDF-1.4\nQA',t,h)[0],403)
  status,file=self.call('POST','/api/resources',b'%PDF-1.4\nQA',a,h);self.assertEqual(status,201)
  self.assertEqual(self.call('GET',file['url'])[0],403)
  self.assertNotIn(file['id'],[r['id'] for r in self.call('GET','/api/resources',token=t)[1]])
  self.assertEqual(self.call('GET',file['url'],token=a)[0],200)
  updated={**content,'is_published':True,'title':'QA updated'}
  self.assertEqual(self.call('PATCH','/api/content/'+item['id'],updated,a)[0],200)
  self.assertEqual(self.call('GET',file['url'])[0],200)
  status,meta=self.call('PATCH','/api/resources/'+file['id'],{'title':'Renamed PDF','description':'One file only','category':'Тапсырмалар','is_published':False},a);self.assertEqual(status,200);self.assertEqual(meta['title'],'Renamed PDF')
  self.assertEqual(self.call('PATCH','/api/resources/'+file['id'],{'is_published':True},t)[0],403)
  self.assertEqual(self.call('GET',file['url'])[0],403)
  self.assertNotIn(file['id'],[r['id'] for r in self.call('GET','/api/resources')[1]])
  self.assertEqual(self.call('PATCH','/api/resources/'+file['id'],{'is_published':True},a)[0],200)
  self.assertEqual(self.call('GET',file['url']+'?download=1')[0],200)
  self.assertIn(file['id'],[r['id'] for r in self.call('GET','/api/resources')[1]])
  self.assertEqual(self.call('PATCH','/api/content/'+item['id'],{**updated,'parent_id':item['id']},a)[0],400)
  self.assertEqual(self.call('DELETE','/api/content/'+item['id'],token=t)[0],403)
  self.assertEqual(self.call('DELETE','/api/content/'+item['id'],token=a)[0],200)
  self.assertEqual(self.call('GET',file['url'])[0],404)
  self.assertEqual(self.call('POST','/api/logout',token=t)[0],200)
  self.assertIsNone(self.call('GET','/api/session',token=t)[1]['user'])
 def test_server_files_are_never_public(self):
  for path in ['/server.py','/.git/config','/.env','/supabase/seed.sql','/data/chemistry.db','/tests/integration.py']:
   with self.subTest(path=path):self.assertEqual(self.call('GET',path)[0],404)
if __name__=='__main__':unittest.main()
