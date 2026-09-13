from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote, quote
from pathlib import Path
from datetime import datetime, timezone
from html import escape
from html.parser import HTMLParser
import re
from http.cookies import SimpleCookie
import hashlib
import json
import mimetypes
import os
import secrets
import sqlite3
import uuid
import zipfile
import posixpath
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("CHEM_DATA_DIR", ROOT / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "chemistry.db"
MAX_UPLOAD = 20 * 1024 * 1024
os.chdir(ROOT)

DEFAULT_SETTINGS = {
    "site_title":"Үздіксіз білім беру платформасы", "font_family":"Inter", "heading_font":"Inter", "base_size":16, "heading_scale":100,
    "background":"#070b14", "surface":"#0f1627", "text":"#f5f7ff", "muted":"#9aa7be",
    "school":"#20d7c3", "university":"#8a8cff", "bridge":"#ffb648",
    "diagnostic":"#ff6fae", "card_radius":30, "button_radius":14, "content_width":1240, "page_gutter":30,
    "density":"comfortable", "header_style":"floating", "hero_style":"spotlight", "card_style":"glass",
    "home_layout":"bento", "background_style":"aurora", "shadow_style":"soft", "visual_effects":True,
}

ALLOWED_RICH_TAGS = {"div","p","br","strong","b","em","i","u","h2","h3","h4","ul","ol","li","blockquote","span","font","a"}
ALLOWED_RICH_STYLES = {"font-family","font-size","text-align","color"}

class RichTextSanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.output = []
        self.suppressed = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ("script", "style", "iframe", "object"):
            self.suppressed += 1
            return
        if self.suppressed or tag not in ALLOWED_RICH_TAGS:
            return
        safe = []
        for name, value in attrs:
            name, value = name.lower(), value or ""
            if tag == "a" and name == "href" and (value.startswith("/") or value.lower().startswith(("http://", "https://"))):
                safe.extend([("href", value), ("target", "_blank"), ("rel", "noopener")])
            elif tag == "font" and name in ("face", "size", "color"):
                safe.append((name, value))
            elif name == "style":
                declarations = []
                for part in value.split(";"):
                    key, separator, raw = part.partition(":")
                    if separator and key.strip().lower() in ALLOWED_RICH_STYLES:
                        declarations.append(f"{key.strip().lower()}:{raw.strip()}")
                if declarations: safe.append(("style", ";".join(declarations)))
        rendered = "".join(f' {name}="{escape(value, quote=True)}"' for name, value in safe)
        self.output.append(f"<{tag}{rendered}>")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ("script", "style", "iframe", "object"):
            self.suppressed = max(0, self.suppressed - 1)
        elif not self.suppressed and tag in ALLOWED_RICH_TAGS and tag != "br":
            self.output.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.suppressed: self.output.append(escape(data))

def sanitize_rich_text(value):
    parser = RichTextSanitizer()
    parser.feed(str(value or ""))
    parser.close()
    return "".join(parser.output)

PPT_NS = {
    "a":"http://schemas.openxmlformats.org/drawingml/2006/main",
    "p":"http://schemas.openxmlformats.org/presentationml/2006/main",
    "r":"http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel":"http://schemas.openxmlformats.org/package/2006/relationships",
}

def ppt_color(node, path, default="transparent"):
    color = node.find(path + "/a:srgbClr", PPT_NS) if node is not None else None
    value = color.get("val", "") if color is not None else ""
    return f"#{value}" if len(value) == 6 and all(c in "0123456789abcdefABCDEF" for c in value) else default

def ppt_relationships(archive, source_path):
    rel_path = posixpath.join(posixpath.dirname(source_path), "_rels", posixpath.basename(source_path) + ".rels")
    try: root = ET.fromstring(archive.read(rel_path))
    except (KeyError, ET.ParseError): return {}
    return {node.get("Id"):posixpath.normpath(posixpath.join(posixpath.dirname(source_path), node.get("Target", ""))).lstrip("/") for node in root.findall("rel:Relationship", PPT_NS)}

def presentation_preview(file_path, resource_id):
    try:
        with zipfile.ZipFile(file_path) as archive:
            presentation = ET.fromstring(archive.read("ppt/presentation.xml"))
            size = presentation.find("p:sldSz", PPT_NS)
            width, height = int(size.get("cx", "12192000")), int(size.get("cy", "6858000"))
            relationships = ppt_relationships(archive, "ppt/presentation.xml")
            slides = []
            for number, slide_id in enumerate(presentation.findall("p:sldIdLst/p:sldId", PPT_NS), 1):
                slide_path = relationships.get(slide_id.get(f"{{{PPT_NS['r']}}}id"), "")
                if not slide_path: continue
                slide = ET.fromstring(archive.read(slide_path)); slide_rels = ppt_relationships(archive, slide_path)
                background = ppt_color(slide, ".//p:bgPr/a:solidFill", "#ffffff")
                elements = []
                tree = slide.find("p:cSld/p:spTree", PPT_NS)
                for shape in list(tree or []):
                    kind = shape.tag.rsplit("}", 1)[-1]
                    if kind not in ("sp", "pic"): continue
                    transform = shape.find("p:spPr/a:xfrm", PPT_NS)
                    if transform is None: continue
                    offset, extent = transform.find("a:off", PPT_NS), transform.find("a:ext", PPT_NS)
                    if offset is None or extent is None: continue
                    box = {"x":round(int(offset.get("x",0))*100/width,4),"y":round(int(offset.get("y",0))*100/height,4),"w":round(int(extent.get("cx",0))*100/width,4),"h":round(int(extent.get("cy",0))*100/height,4)}
                    if kind == "pic":
                        blip = shape.find("p:blipFill/a:blip", PPT_NS); relation = blip.get(f"{{{PPT_NS['r']}}}embed") if blip is not None else ""
                        target = slide_rels.get(relation, "")
                        if target.startswith("ppt/media/"):
                            elements.append({**box,"type":"image","src":f"/api/presentation-assets/{resource_id}?path={quote(target)}"})
                        continue
                    paragraphs = []
                    for paragraph in shape.findall("p:txBody/a:p", PPT_NS):
                        text = "".join(node.text or "" for node in paragraph.findall(".//a:t", PPT_NS)).strip()
                        if text: paragraphs.append(text)
                    text = "\n".join(paragraphs)
                    fill = ppt_color(shape, "p:spPr/a:solidFill")
                    line = ppt_color(shape, "p:spPr/a:ln/a:solidFill")
                    run_props = shape.find(".//a:rPr", PPT_NS)
                    if run_props is None: run_props = shape.find(".//a:defRPr", PPT_NS)
                    font_size = round(int(run_props.get("sz", "1800"))/100, 1) if run_props is not None else 18
                    font_color = ppt_color(run_props, "a:solidFill", "#111827") if run_props is not None else "#111827"
                    align_node = shape.find(".//a:pPr", PPT_NS); alignment = {"ctr":"center","r":"right","just":"justify"}.get(align_node.get("algn") if align_node is not None else "", "left")
                    elements.append({**box,"type":"text","text":text,"fill":fill,"line":line,"font_size":font_size,"color":font_color,"align":alignment})
                slides.append({"number":number,"background":background,"elements":elements})
            return {"width":width,"height":height,"slides":slides}
    except (zipfile.BadZipFile, KeyError, ET.ParseError, ValueError) as error:
        raise ApiError(422, "Презентацияны оқу мүмкін болмады") from error

SEED_CONTENT = [
    ("school-root", None, "school", "Мектеп модулі", "/mektep", 0),
    ("school-program", "school-root", "school", "Оқу бағдарламасы – 7–11 сынып", "/mektep/oku-bagdarlamasy", 0),
    ("school-theory", "school-root", "school", "Теориялық бөлім", "/mektep/teoriya", 1),
    ("grade-7", "school-theory", "school", "7-сынып", "/mektep/teoriya/7-synyp", 0),
    ("grade-8", "school-theory", "school", "8-сынып", "/mektep/teoriya/8-synyp", 1),
    ("grade-9", "school-theory", "school", "9-сынып", "/mektep/teoriya/9-synyp", 2),
    ("grade-10", "school-theory", "school", "10-сынып", "/mektep/teoriya/10-synyp", 3),
    ("grade-11", "school-theory", "school", "11-сынып", "/mektep/teoriya/11-synyp", 4),
    ("school-profile", "school-root", "school", "Жалпы және бейін", "/mektep/zhalpy-zhane-beyin", 2),
    ("school-ubt", "school-root", "school", "ҰБТ-ға дайындық", "/mektep/ubt", 3),
    ("school-map", "school-root", "school", "Оқушының білім картасы", "/mektep/bilim-kartasy", 4),
    ("university-root", None, "university", "Университет модулі", "/universitet", 0),
    ("university-syllabus", "university-root", "university", "Силлабус", "/universitet/sillabus", 0),
    ("university-theory", "university-root", "university", "Теория", "/universitet/teoriya", 1),
    ("university-self", "university-root", "university", "Өзін-өзі дайындау", "/universitet/ozin-ozi-daiyndau", 2),
    ("university-map", "university-root", "university", "Студенттің білім картасы", "/universitet/bilim-kartasy", 3),
    ("bridge-root", None, "bridge", "Сабақтастық көпірі", "/sabaktastyk-kopiri", 0),
    ("bridge-equivalent", "bridge-root", "bridge", "Эквивалент ұғымы", "/sabaktastyk-kopiri/ekvivalent-ugymy", 0),
    ("bridge-bond", "bridge-root", "bridge", "Химиялық байланыс", "/sabaktastyk-kopiri/himiyalyk-bailanys", 1),
    ("bridge-redox", "bridge-root", "bridge", "Тотығу-тотықсыздану реакциялары", "/sabaktastyk-kopiri/totygu-totyksyzdanu", 2),
    ("bridge-solutions", "bridge-root", "bridge", "Ерітінділер", "/sabaktastyk-kopiri/eritindiler", 3),
    ("bridge-complex", "bridge-root", "bridge", "Комплексті қасиеттер", "/sabaktastyk-kopiri/kompleksti-kasietter", 4),
    ("diagnostic-root", None, "diagnostic", "Қорытынды диагностика", "/korytyndy-diagnostika", 0),
]

def now():
    return datetime.now(timezone.utc).isoformat()

def db():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("pragma foreign_keys = on")
    return connection

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180000).hex()
    return f"{salt}${digest}"

def password_ok(password, stored):
    salt, _ = stored.split("$", 1)
    return secrets.compare_digest(password_hash(password, salt), stored)

def init_database():
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)
    with db() as connection:
        connection.executescript("""
        create table if not exists users (
          id text primary key, display_name text not null, email text not null unique,
          role text not null check(role in ('student','university_student','admin')),
          password_hash text not null, created_at text not null
        );
        create table if not exists sessions (
          token text primary key, user_id text not null references users(id) on delete cascade,
          created_at text not null
        );
        create table if not exists content_items (
          id text primary key, parent_id text references content_items(id) on delete cascade,
          area text not null, item_type text not null default 'lesson', content_mode text not null default 'curriculum', title text not null, path text not null unique, body text not null default '',
          video_url text not null default '', quiz_data text not null default '',
          sort_order integer not null default 0, is_published integer not null default 1,
          created_at text not null, updated_at text not null
        );
        create table if not exists resources (
          id text primary key, item_id text not null references content_items(id) on delete cascade,
          filename text not null, stored_name text not null, mime_type text not null,
          size integer not null, created_at text not null
        );
        create table if not exists progress (
          user_id text not null references users(id) on delete cascade,
          item_id text not null references content_items(id) on delete cascade,
          progress integer not null default 0, completed integer not null default 0,
          score integer, max_score integer, view_count integer not null default 0,
          last_opened text, updated_at text not null,
          primary key(user_id,item_id)
        );
        create table if not exists site_settings (
          id text primary key, settings text not null, updated_at text not null
        );
        """)
        columns = {row["name"] for row in connection.execute("pragma table_info(content_items)")}
        for field,default in [("description",""),("subject","Химия"),("category","Басқа")]:
            if field not in columns: connection.execute(f"alter table content_items add column {field} text not null default '{default}'")
        resource_columns={row['name'] for row in connection.execute('pragma table_info(resources)')}
        for field in ('title','description','subject','category'):
            if field not in resource_columns: connection.execute(f"alter table resources add column {field} text not null default ''")
        if 'is_published' not in resource_columns: connection.execute("alter table resources add column is_published integer not null default 1")
        user_columns = {row["name"] for row in connection.execute("pragma table_info(users)")}
        if "username" not in user_columns: connection.execute("alter table users add column username text")
        connection.execute("create unique index if not exists users_username_unique on users(lower(username)) where username is not null")
        if "item_type" not in columns: connection.execute("alter table content_items add column item_type text not null default 'lesson'")
        if "content_mode" not in columns: connection.execute("alter table content_items add column content_mode text not null default 'curriculum'")
        progress_columns = {row["name"] for row in connection.execute("pragma table_info(progress)")}
        if "quiz_answers" not in progress_columns: connection.execute("alter table progress add column quiz_answers text not null default '[]'")
        if "attempt_count" not in progress_columns: connection.execute("alter table progress add column attempt_count integer not null default 0")
        if "tested_at" not in progress_columns: connection.execute("alter table progress add column tested_at text")
        connection.execute("insert or ignore into site_settings values ('main',?,?)", (json.dumps(DEFAULT_SETTINGS,ensure_ascii=False),now()))
        admin = connection.execute("select id from users where role='admin' limit 1").fetchone()
        if not admin and os.environ.get("INITIAL_ADMIN_PASSWORD"):
            admin_name = os.environ.get("INITIAL_ADMIN_NAME", "Әкімші").strip() or "Әкімші"
            admin_email = os.environ.get("INITIAL_ADMIN_EMAIL", "admin@chem.local").strip().lower()
            admin_password = os.environ["INITIAL_ADMIN_PASSWORD"]
            if len(admin_password) < 8:
                raise RuntimeError("INITIAL_ADMIN_PASSWORD кемінде 8 таңба болуы керек")
            connection.execute("insert into users(id,display_name,email,role,password_hash,created_at) values (?,?,?,?,?,?)", (str(uuid.uuid4()), admin_name, admin_email, "admin", password_hash(admin_password), now()))
        for item_id, parent_id, area, title, path, order in SEED_CONTENT:
            connection.execute("""insert or ignore into content_items
              (id,parent_id,area,title,path,body,video_url,quiz_data,sort_order,is_published,created_at,updated_at)
              values (?,?,?,?,?,'','','',?,1,?,?)""", (item_id,parent_id,area,title,path,order,now(),now()))
        connection.execute("update content_items set item_type='program' where id in ('school-root','university-root','bridge-root')")
        connection.execute("update content_items set item_type='program' where id='school-theory'")
        connection.execute("update content_items set item_type='course' where id in ('school-program','school-profile','school-ubt','university-syllabus','university-theory','university-self','diagnostic-root') or id like 'grade-%'")
        connection.execute("update content_items set item_type='report' where id in ('school-map','university-map')")
        connection.execute("update content_items set content_mode='resources' where id in ('school-program','university-syllabus')")

class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message

def calculate_quiz_result(raw_quiz, answers):
    try: questions = json.loads(raw_quiz or "{}").get("questions", []) if isinstance(raw_quiz, str) else (raw_quiz or {}).get("questions", [])
    except json.JSONDecodeError: questions = []
    if not isinstance(answers, list) or not questions or len(answers) != len(questions): raise ApiError(400, "Барлық тест сұрағына жауап беріңіз")
    score = 0
    for index, answer in enumerate(answers):
        options = questions[index].get("options", []) if isinstance(questions[index], dict) else []
        if not isinstance(answer, int) or answer < 0 or answer >= len(options): raise ApiError(400, "Тест жауабы қате")
        if answer == int(questions[index].get("correct_index", 0)): score += 1
    return score, len(questions)

class SpaHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def json_response(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        if isinstance(data,dict) and data.get('token'):
            secure='; Secure' if self.headers.get('X-Forwarded-Proto')=='https' else ''
            self.send_header('Set-Cookie',f"chem_session={data['token']}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800{secure}")
        if urlparse(self.path).path=='/api/logout': self.send_header('Set-Cookie','chem_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 2_000_000:
            raise ApiError(413, "Сұрау тым үлкен")
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            raise ApiError(400, "JSON қате")

    def user(self, required=False):
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        if not token:
            cookie=SimpleCookie(self.headers.get('Cookie',''))
            token=cookie['chem_session'].value if 'chem_session' in cookie else ''
        if not token:
            if required: raise ApiError(401, "Кіру қажет")
            return None
        with db() as connection:
            row = connection.execute("""select users.id,users.display_name,users.email,users.role
              from sessions join users on users.id=sessions.user_id where sessions.token=? and datetime(sessions.created_at)>datetime('now','-7 days')""", (token,)).fetchone()
        if not row and required: raise ApiError(401, "Сессия аяқталды")
        return dict(row) if row else None

    def admin(self):
        user = self.user(True)
        if user["role"] != "admin": raise ApiError(403, "Қолжетім жоқ")
        return user

    def content_visible(self,item_id):
        with db() as connection:
            rows=connection.execute("""with recursive parents(id,parent_id,is_published) as (
              select id,parent_id,is_published from content_items where id=?
              union select c.id,c.parent_id,c.is_published from content_items c join parents p on c.id=p.parent_id)
              select is_published from parents""",(item_id,)).fetchall()
        return bool(rows) and all(row['is_published'] for row in rows)

    def require_content(self,item_id):
        user=self.user(False)
        if not (user and user['role']=='admin') and not self.content_visible(item_id): raise ApiError(403,'Бұл материалға кіруге рұқсатыңыз жоқ')

    def route_api(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if method == "GET" and path == "/api/session":
            return self.json_response({"user": self.user(False)})
        if method == "POST" and path == "/api/register":
            data = self.read_json(); role = data.get("role")
            if role not in ("student", "university_student"): raise ApiError(400, "Бұл рөлмен тіркелуге болмайды")
            if len(data.get("password", "")) < 8: raise ApiError(400, "Құпиясөз кемінде 8 таңба болуы керек")
            email = data.get("email", "").strip().lower(); name = data.get("displayName", "").strip()
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or not name: raise ApiError(400, "Email және аты-жөніңізді дұрыс енгізіңіз")
            username=str(data.get('username') or '').strip().lower() or None
            if username and not re.fullmatch(r'[a-z0-9_]{3,32}',username): raise ApiError(400,'Логин 3–32 латын әрпі, сан немесе _ болуы керек')
            user_id = str(uuid.uuid4()); token = secrets.token_urlsafe(32)
            try:
                with db() as connection:
                    connection.execute("insert into users(id,display_name,email,role,password_hash,created_at) values (?,?,?,?,?,?)", (user_id,name,email,role,password_hash(data["password"]),now()))
                    connection.execute("update users set username=? where id=?",(username,user_id))
                    connection.execute("insert into sessions values (?,?,?)", (token,user_id,now()))
            except sqlite3.IntegrityError: raise ApiError(409, "Бұл email бұрын тіркелген")
            return self.json_response({"token":token,"user":{"id":user_id,"display_name":name,"email":email,"role":role}}, 201)
        if method == "POST" and path == "/api/login":
            data = self.read_json(); email = data.get("email", "").strip().lower()
            with db() as connection:
                row = connection.execute("select * from users where email=? or username=?", (email,email)).fetchone()
                if not row or not password_ok(data.get("password", ""), row["password_hash"]): raise ApiError(401, "Email немесе құпиясөз қате")
                token = secrets.token_urlsafe(32)
                connection.execute("insert into sessions values (?,?,?)", (token,row["id"],now()))
            return self.json_response({"token":token,"user":{key:row[key] for key in ("id","display_name","email","role")}})
        if method == "POST" and path == "/api/logout":
            auth = self.headers.get("Authorization", "")
            cookie=SimpleCookie(self.headers.get('Cookie',''))
            token = auth[7:] if auth.startswith("Bearer ") else (cookie['chem_session'].value if 'chem_session' in cookie else '')
            with db() as connection: connection.execute("delete from sessions where token=?", (token,))
            return self.json_response({"ok":True})

        if method == 'GET' and path == '/api/popularity':
            with db() as connection:rows=connection.execute('select item_id,sum(view_count) as views from progress group by item_id having views>0 order by views desc limit 20').fetchall()
            return self.json_response([dict(row) for row in rows if self.content_visible(row['item_id'])])
        if method == "GET" and path == "/api/settings":
            with db() as connection: row = connection.execute("select settings from site_settings where id='main'").fetchone()
            return self.json_response(json.loads(row["settings"]) if row else DEFAULT_SETTINGS)
        if method == "PATCH" and path == "/api/settings":
            self.admin(); settings = self.validate_settings(self.read_json())
            with db() as connection: connection.execute("update site_settings set settings=?,updated_at=? where id='main'", (json.dumps(settings,ensure_ascii=False),now()))
            return self.json_response(settings)

        if method == "GET" and path == "/api/content":
            user = self.user(False); admin_view = query.get("admin", [""])[0] == "1" and user and user["role"] == "admin"
            where = "" if admin_view else "where is_published=1"
            with db() as connection: rows = connection.execute(f"select * from content_items {where} order by sort_order,title").fetchall()
            return self.json_response([self.content_row(row) for row in rows if admin_view or self.content_visible(row["id"])])
        if method == "POST" and path == "/api/content":
            self.admin(); data = self.read_json(); item_id = str(uuid.uuid4())
            self.validate_content(data)
            with db() as connection:
                connection.execute("""insert into content_items
                  (id,parent_id,area,item_type,content_mode,title,path,body,video_url,quiz_data,sort_order,is_published,created_at,updated_at)
                  values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (item_id,data.get("parent_id"),data["area"],data.get("item_type","lesson"),data.get("content_mode","curriculum"),data["title"].strip(),data["path"].strip(),sanitize_rich_text(data.get("body", "")),data.get("video_url", ""),json.dumps(data.get("quiz_data") or {},ensure_ascii=False),int(data.get("sort_order",0)),1 if data.get("is_published") else 0,now(),now()))
                connection.execute("update content_items set description=?,subject=?,category=? where id=?",(str(data.get('description',''))[:1500],str(data.get('subject','Химия'))[:100],str(data.get('category','Басқа'))[:100],item_id))
                row = connection.execute("select * from content_items where id=?", (item_id,)).fetchone()
            return self.json_response(self.content_row(row), 201)
        if method == "PATCH" and path == "/api/content/reorder":
            self.admin(); ids = self.read_json().get("ids", [])
            if not isinstance(ids, list) or not ids or len(ids) > 500 or len(set(ids)) != len(ids): raise ApiError(400, "Реттеу мәліметі қате")
            placeholders = ",".join("?" for _ in ids)
            with db() as connection:
                rows = connection.execute(f"select id,parent_id,area from content_items where id in ({placeholders})", ids).fetchall()
                if len(rows) != len(ids) or len({(row["parent_id"],row["area"]) for row in rows}) != 1: raise ApiError(400, "Тек бір деңгейдегі блоктарды жылжытуға болады")
                parent_id, area = rows[0]["parent_id"], rows[0]["area"]
                if parent_id is None: current = connection.execute("select id from content_items where parent_id is null and area=?", (area,)).fetchall()
                else: current = connection.execute("select id from content_items where parent_id=? and area=?", (parent_id,area)).fetchall()
                if {row["id"] for row in current} != set(ids): raise ApiError(409, "Құрылым өзгерді. Бетті жаңартып қайталаңыз")
                for order, item_id in enumerate(ids): connection.execute("update content_items set sort_order=?,updated_at=? where id=?", (order*10,now(),item_id))
            return self.json_response({"ok":True})
        if path.startswith("/api/content/") and method in ("PATCH", "DELETE"):
            self.admin(); item_id = unquote(path.rsplit("/",1)[1])
            with db() as connection:
                if method == "DELETE":
                    stored = connection.execute("with recursive children(id) as (select id from content_items where id=? union select c.id from content_items c join children p on c.parent_id=p.id) select stored_name from resources where item_id in (select id from children)", (item_id,)).fetchall()
                    connection.execute("delete from content_items where id=?", (item_id,))
                    for row in stored: (UPLOAD_DIR / row["stored_name"]).unlink(missing_ok=True)
                    return self.json_response({"ok":True})
                data = self.read_json(); self.validate_content(data)
                parent=data.get('parent_id')
                seen={item_id}
                while parent:
                    if parent in seen: raise ApiError(400,'Бөлімді өз ішіне орналастыруға болмайды')
                    seen.add(parent);row_parent=connection.execute('select parent_id from content_items where id=?',(parent,)).fetchone()
                    parent=row_parent['parent_id'] if row_parent else None
                connection.execute("""update content_items set parent_id=?,area=?,item_type=?,content_mode=?,title=?,path=?,body=?,video_url=?,quiz_data=?,sort_order=?,is_published=?,updated_at=? where id=?""", (data.get("parent_id"),data["area"],data.get("item_type","lesson"),data.get("content_mode","curriculum"),data["title"].strip(),data["path"].strip(),sanitize_rich_text(data.get("body", "")),data.get("video_url", ""),json.dumps(data.get("quiz_data") or {},ensure_ascii=False),int(data.get("sort_order",0)),1 if data.get("is_published") else 0,now(),item_id))
                connection.execute("update content_items set description=?,subject=?,category=? where id=?",(str(data.get('description',''))[:1500],str(data.get('subject','Химия'))[:100],str(data.get('category','Басқа'))[:100],item_id))
                row = connection.execute("select * from content_items where id=?", (item_id,)).fetchone()
            if not row: raise ApiError(404, "Бөлім табылмады")
            return self.json_response(self.content_row(row))

        if method == "GET" and path == "/api/resources":
            item_id = query.get("item_id", [""])[0]
            with db() as connection: rows = connection.execute("select * from resources where (?='' or item_id=?) order by created_at desc", (item_id,item_id)).fetchall()
            user=self.user(False)
            return self.json_response([self.resource_row(row) for row in rows if (user and user['role']=='admin') or (row['is_published'] and self.content_visible(row['item_id']))])
        if method == "POST" and path == "/api/resources":
            self.admin(); item_id = self.headers.get("X-Item-Id", ""); filename = unquote(self.headers.get("X-Filename", "file"))
            length = int(self.headers.get("Content-Length", "0"))
            if not item_id or length <= 0 or length > MAX_UPLOAD: raise ApiError(400, "Файл өлшемін тексеріңіз")
            resource_id = str(uuid.uuid4()); stored_name = resource_id
            if Path(filename).suffix.lower() not in {'.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.png','.jpg','.jpeg','.webp','.gif','.mp4','.webm','.mp3','.wav','.zip'}: raise ApiError(400,'Бұл файл түріне қолдау көрсетілмейді')
            with db() as connection:
                if not connection.execute('select id from content_items where id=?',(item_id,)).fetchone(): raise ApiError(404,'Материал табылмады')
            payload = self.rfile.read(length)
            if len(payload)!=length: raise ApiError(400,'Файл толық жүктелмеді')
            (UPLOAD_DIR / stored_name).write_bytes(payload)
            mime = self.headers.get("Content-Type") or mimetypes.guess_type(filename)[0] or "application/octet-stream"
            try:
                with db() as connection: connection.execute("insert into resources(id,item_id,filename,stored_name,mime_type,size,created_at) values (?,?,?,?,?,?,?)", (resource_id,item_id,filename,stored_name,mime,length,now()))
            except Exception:
                (UPLOAD_DIR / stored_name).unlink(missing_ok=True)
                raise
            return self.json_response(self.resource_row({"id":resource_id,"item_id":item_id,"filename":filename,"mime_type":mime,"size":length,"created_at":now()}), 201)
        if method == "GET" and path.startswith("/api/presentations/"):
            resource_id = unquote(path.rsplit("/",1)[1])
            with db() as connection: row = connection.execute("select * from resources where id=?", (resource_id,)).fetchone()
            if not row: raise ApiError(404, "Файл табылмады")
            self.require_content(row["item_id"])
            if not row["is_published"] and (self.user(False) or {}).get("role")!="admin": raise ApiError(403,"Материал жасырылған")
            if not row["filename"].lower().endswith(".pptx"): raise ApiError(422, "PPTX форматы қажет")
            return self.json_response(presentation_preview(UPLOAD_DIR / row["stored_name"], resource_id))
        if method == "GET" and path.startswith("/api/presentation-assets/"):
            resource_id = unquote(path.rsplit("/",1)[1]); asset_path = unquote(query.get("path", [""])[0])
            if not asset_path.startswith("ppt/media/") or ".." in asset_path.split("/"): raise ApiError(400, "Файл жолы қате")
            with db() as connection: row = connection.execute("select * from resources where id=?", (resource_id,)).fetchone()
            if not row: raise ApiError(404, "Файл табылмады")
            self.require_content(row["item_id"])
            if not row["is_published"] and (self.user(False) or {}).get("role")!="admin": raise ApiError(403,"Материал жасырылған")
            try:
                with zipfile.ZipFile(UPLOAD_DIR / row["stored_name"]) as archive:
                    info = archive.getinfo(asset_path)
                    if info.file_size > MAX_UPLOAD: raise ApiError(413, "Сурет тым үлкен")
                    payload = archive.read(info)
            except (zipfile.BadZipFile, KeyError): raise ApiError(404, "Сурет табылмады")
            mime = mimetypes.guess_type(asset_path)[0] or "application/octet-stream"
            self.send_response(200); self.send_header("Content-Type", mime); self.send_header("Cache-Control", "public, max-age=3600"); self.send_header("Content-Length", str(len(payload))); self.end_headers(); self.wfile.write(payload); return
        if method == "GET" and path.startswith("/api/files/"):
            resource_id = unquote(path.rsplit("/",1)[1])
            with db() as connection: row = connection.execute("select * from resources where id=?", (resource_id,)).fetchone()
            if not row: raise ApiError(404, "Файл табылмады")
            self.require_content(row["item_id"])
            if not row["is_published"] and (self.user(False) or {}).get("role")!="admin": raise ApiError(403,"Материал жасырылған")
            file_path = UPLOAD_DIR / row["stored_name"]
            disposition = "attachment" if query.get("download", [""])[0] == "1" else "inline"
            self.send_response(200); self.send_header("Content-Type", row["mime_type"]); self.send_header("Content-Length", str(file_path.stat().st_size)); self.send_header("Content-Disposition", f"{disposition}; filename*=UTF-8''{quote(row['filename'])}"); self.end_headers(); self.wfile.write(file_path.read_bytes()); return
        if method == "PATCH" and path.startswith("/api/resources/"):
            self.admin();resource_id=unquote(path.rsplit('/',1)[1]);patch=self.read_json()
            with db() as connection:
                row=connection.execute('select * from resources where id=?',(resource_id,)).fetchone()
                if not row: raise ApiError(404,'Материал табылмады')
                data=dict(row)
                for field in ('title','description','subject','category'):
                    if field in patch:data[field]=str(patch[field]).strip()[:1500]
                if 'title' in patch and not data['title']: raise ApiError(400,'Материал атауын енгізіңіз')
                data['is_published']=1 if patch.get('is_published',data['is_published']) else 0
                connection.execute('update resources set title=?,description=?,subject=?,category=?,is_published=? where id=?',tuple(data[field] for field in ('title','description','subject','category','is_published'))+(resource_id,))
            return self.json_response(self.resource_row(data))
        if method == "DELETE" and path.startswith("/api/resources/"):
            self.admin(); resource_id = unquote(path.rsplit("/",1)[1])
            with db() as connection:
                row = connection.execute("select stored_name from resources where id=?", (resource_id,)).fetchone()
                connection.execute("delete from resources where id=?", (resource_id,))
            if row: (UPLOAD_DIR / row["stored_name"]).unlink(missing_ok=True)
            return self.json_response({"ok":True})

        if method == "GET" and path == "/api/progress":
            user = self.user(True)
            with db() as connection: rows = connection.execute("select * from progress where user_id=? order by updated_at desc", (user["id"],)).fetchall()
            return self.json_response([self.progress_row(row) for row in rows])
        if method == "POST" and path == "/api/progress":
            user = self.user(True)
            if user["role"] == "admin": raise ApiError(400, "Әкімші прогресі сақталмайды")
            data = self.read_json(); item_id = data.get("item_id")
            if not item_id: raise ApiError(400, "Бөлім көрсетілмеген")
            with db() as connection:
                old = connection.execute("select * from progress where user_id=? and item_id=?", (user["id"],item_id)).fetchone()
                progress = max(0,min(100,int(data.get("progress",old["progress"] if old else 0))))
                completed = 1 if data.get("completed", progress == 100) else 0
                is_test = "score" in data and "max_score" in data
                answers = data.get("quiz_answers", json.loads(old["quiz_answers"] or "[]") if old else [])
                if not isinstance(answers, list) or len(answers) > 200 or any(not isinstance(value, int) or value < 0 for value in answers): raise ApiError(400, "Тест жауаптары қате")
                if is_test:
                    content = connection.execute("select quiz_data from content_items where id=?", (item_id,)).fetchone()
                    score, maximum = calculate_quiz_result(content["quiz_data"] if content else "{}", answers)
                else:
                    score = old["score"] if old else None; maximum = old["max_score"] if old else None
                attempts = (old["attempt_count"] if old else 0) + (1 if is_test else 0)
                tested_at = now() if is_test else (old["tested_at"] if old else None)
                views = (old["view_count"] if old else 0) + (1 if data.get("view") else 0)
                opened = now() if data.get("view") else (old["last_opened"] if old else now())
                connection.execute("""insert into progress
                  (user_id,item_id,progress,completed,score,max_score,view_count,last_opened,updated_at,quiz_answers,attempt_count,tested_at)
                  values (?,?,?,?,?,?,?,?,?,?,?,?)
                  on conflict(user_id,item_id) do update set progress=excluded.progress,completed=excluded.completed,score=excluded.score,max_score=excluded.max_score,view_count=excluded.view_count,last_opened=excluded.last_opened,updated_at=excluded.updated_at,quiz_answers=excluded.quiz_answers,attempt_count=excluded.attempt_count,tested_at=excluded.tested_at""", (user["id"],item_id,progress,completed,score,maximum,views,opened,now(),json.dumps(answers),attempts,tested_at))
                row = connection.execute("select * from progress where user_id=? and item_id=?", (user["id"],item_id)).fetchone()
            return self.json_response(self.progress_row(row))
        if method == "GET" and path == "/api/analytics":
            self.admin()
            with db() as connection:
                users = connection.execute("""select users.id,users.display_name,users.email,users.role,
                  coalesce(round(avg(progress.progress)),0) average_progress,
                  coalesce(sum(progress.completed),0) completed_count,
                  coalesce(round(avg(case when progress.max_score>0 then progress.score*100.0/progress.max_score end)),0) average_score,
                  max(progress.last_opened) last_active
                  from users left join progress on progress.user_id=users.id where users.role!='admin' group by users.id order by users.created_at desc""").fetchall()
                details = connection.execute("""select progress.*,users.display_name,users.email,users.role,content_items.title
                  from progress join users on users.id=progress.user_id join content_items on content_items.id=progress.item_id order by progress.updated_at desc""").fetchall()
            return self.json_response({"users":[dict(row) for row in users],"details":[self.progress_row(row) for row in details]})
        if method == "GET" and path == "/api/users":
            self.admin()
            with db() as connection: rows = connection.execute("select id,display_name,email,role,created_at from users order by created_at desc").fetchall()
            return self.json_response([dict(row) for row in rows])
        if method == "PATCH" and path.startswith("/api/users/"):
            admin = self.admin(); user_id = unquote(path.rsplit("/",1)[1]); role = self.read_json().get("role")
            if role not in ("student","university_student","admin"): raise ApiError(400, "Рөл қате")
            if user_id == admin["id"] and role != "admin": raise ApiError(400, "Өз рөліңізді өзгертуге болмайды")
            with db() as connection: connection.execute("update users set role=? where id=?", (role,user_id))
            return self.json_response({"ok":True})
        raise ApiError(404, "API табылмады")

    def content_row(self, row):
        data = dict(row); data["is_published"] = bool(data["is_published"])
        try: data["quiz_data"] = json.loads(data.get("quiz_data") or "{}")
        except json.JSONDecodeError: data["quiz_data"] = {}
        return data

    def resource_row(self, row):
        data = dict(row); data.pop("stored_name",None); data["url"] = f"/api/files/{data['id']}"
        if data.get("filename", "").lower().endswith(".pptx"): data["presentation_url"] = f"/api/presentations/{data['id']}"
        return data

    def progress_row(self, row):
        data = dict(row)
        try: data["quiz_answers"] = json.loads(data.get("quiz_answers") or "[]")
        except json.JSONDecodeError: data["quiz_answers"] = []
        data["completed"] = bool(data.get("completed"))
        return data

    def validate_content(self, data):
        if not str(data.get("title", "")).strip() or not str(data.get("path", "")).startswith("/"): raise ApiError(400, "Атау мен URL-ді тексеріңіз")
        if data.get("area") not in ("school","university","bridge","diagnostic"): raise ApiError(400, "Бөлім қате")
        if data.get("item_type", "lesson") not in ("program","course","module","lesson","report"): raise ApiError(400, "Контент түрі қате")
        if data.get("content_mode", "curriculum") not in ("curriculum","resources"): raise ApiError(400, "Бөлім форматы қате")
        quiz = data.get("quiz_data") or {}
        questions = quiz.get("questions") if isinstance(quiz, dict) else None
        if questions is not None:
            if not isinstance(questions, list) or len(questions) > 200: raise ApiError(400, "Тест құрылымы қате")
            for question in questions:
                options = question.get("options", []) if isinstance(question, dict) else []
                correct = question.get("correct_index", 0) if isinstance(question, dict) else 0
                if not str(question.get("question", "")).strip() or len([option for option in options if str(option).strip()]) < 2 or not isinstance(correct, int) or correct < 0 or correct >= len(options) or not str(options[correct]).strip():
                    raise ApiError(400, "Тест сұрағын тексеріңіз")

    def validate_settings(self, data):
        settings = dict(DEFAULT_SETTINGS)
        settings["site_title"] = str(data.get("site_title", settings["site_title"])).strip()[:120] or DEFAULT_SETTINGS["site_title"]
        for key in ("font_family","heading_font"):
            settings[key] = data.get(key) if data.get(key) in ("Inter","Manrope","Arial","Georgia","Courier New") else "Inter"
        for key, minimum, maximum in (("base_size",14,20),("heading_scale",85,125),("card_radius",8,40),("button_radius",6,28),("content_width",960,1440),("page_gutter",12,48)):
            try: settings[key] = max(minimum,min(maximum,int(data.get(key,settings[key]))))
            except (TypeError, ValueError): pass
        for key in ("background","surface","text","muted","school","university","bridge","diagnostic"):
            value = str(data.get(key, settings[key]))
            if len(value) == 7 and value.startswith("#") and all(character in "0123456789abcdefABCDEF" for character in value[1:]): settings[key] = value
        enum_values = {"density":("compact","comfortable","spacious"),"header_style":("floating","solid","minimal"),"hero_style":("spotlight","gradient","clean"),"card_style":("glass","solid","outline"),"home_layout":("bento","balanced","stacked"),"background_style":("aurora","grid","plain"),"shadow_style":("none","soft","strong")}
        for key, allowed in enum_values.items():
            if data.get(key) in allowed: settings[key] = data[key]
        settings["visual_effects"] = bool(data.get("visual_effects", True))
        settings["interface_version"] = 2
        return settings

    def handle_api(self, method):
        try: return self.route_api(method)
        except ApiError as error: return self.json_response({"message":error.message}, error.status)
        except sqlite3.IntegrityError: return self.json_response({"message":"URL немесе мәлімет бұрын қолданылған"}, 409)
        except Exception as error:
            return self.json_response({"message":"Сервер қатесі. Қайта әрекет жасап көріңіз"}, 500)

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"): return self.handle_api("GET")
        if path == "/config.js":
            config = {"supabaseUrl":os.environ.get("SUPABASE_URL", ""),"supabaseAnonKey":os.environ.get("SUPABASE_ANON_KEY", "")}
            payload = f"window.__CHEM_CONFIG__ = {json.dumps(config)};".encode("utf-8")
            self.send_response(200); self.send_header("Content-Type","application/javascript; charset=utf-8"); self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(payload))); self.end_headers(); self.wfile.write(payload); return
        public_assets={'/index.html','/404.html','/app.js','/store.js','/data.js','/catalog.js','/platform-utils.js','/styles.css','/components.css','/accessibility.css','/learning.css','/platform.css'}
        target = ROOT / path.lstrip("/")
        if path != "/" and path not in public_assets and (target.exists() or any(part.startswith('.') for part in path.split('/') if part) or '.' in target.name):
            self.send_error(404);return
        if path == "/" or (not target.exists() and "." not in target.name): self.path = "/index.html"
        return super().do_GET()

    def do_HEAD(self):
        path=urlparse(self.path).path
        if path.startswith('/api/') or path not in {'/','/index.html','/404.html','/config.js','/app.js','/store.js','/data.js','/catalog.js','/platform-utils.js','/styles.css','/components.css','/accessibility.css','/learning.css','/platform.css'}:
            self.send_error(404);return
        return super().do_HEAD()

    def do_POST(self): return self.handle_api("POST")
    def do_PATCH(self): return self.handle_api("PATCH")
    def do_DELETE(self): return self.handle_api("DELETE")

if __name__ == "__main__":
    init_database()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "4173"))
    print(f"Chemistry platform: http://{host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), SpaHandler).serve_forever()
