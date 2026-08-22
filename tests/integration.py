import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PORT = 4174
BASE = f"http://127.0.0.1:{PORT}"

def request(method, path, data=None, token=None, headers=None):
    payload = None
    request_headers = dict(headers or {})
    if isinstance(data, (dict, list)):
        payload = json.dumps(data).encode()
        request_headers["Content-Type"] = "application/json"
    elif data is not None:
        payload = data
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    response = urlopen(Request(BASE + path, data=payload, headers=request_headers, method=method))
    body = response.read()
    return json.loads(body) if body else None

class PlatformIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        env = {**os.environ, "CHEM_DATA_DIR": cls.temp.name, "PORT": str(PORT)}
        cls.server = subprocess.Popen(["python3", "server.py"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(40):
            try:
                urlopen(BASE + "/api/content", timeout=0.2)
                break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("Test server did not start")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)
        cls.temp.cleanup()

    def test_auth_content_upload_progress_and_analytics(self):
        admin = request("POST", "/api/login", {"email":"admin@chem.local", "password":"Admin123!", "role":"admin"})
        admin_token = admin["token"]
        self.assertEqual(request("GET", "/api/settings")["font_family"], "Inter")
        theme = request("PATCH", "/api/settings", {
            "site_title":"Химия платформасы", "font_family":"Manrope", "heading_font":"Georgia", "base_size":18, "heading_scale":112,
            "background":"#08101f", "surface":"#121c30", "text":"#f8fafc", "muted":"#94a3b8",
            "school":"#11aa88", "university":"#5577ff", "bridge":"#ffaa22",
            "diagnostic":"#ee6699", "card_radius":24, "button_radius":18, "content_width":1320,
            "page_gutter":36, "density":"spacious", "header_style":"solid", "hero_style":"gradient",
            "card_style":"solid", "home_layout":"balanced", "background_style":"grid", "shadow_style":"strong",
            "visual_effects":False,
        }, admin_token)
        self.assertEqual(theme["font_family"], "Manrope")
        self.assertEqual(theme["heading_font"], "Georgia")
        self.assertEqual(theme["home_layout"], "balanced")
        self.assertEqual(theme["content_width"], 1320)
        self.assertEqual(theme["card_radius"], 24)
        self.assertFalse(theme["visual_effects"])
        item = request("POST", "/api/content", {
            "parent_id":None, "area":"diagnostic", "item_type":"lesson", "content_mode":"resources", "title":"Қорытынды диагностика",
            "path":"/integration-test", "body":"<script>alert(1)</script><h2 style=\"text-align:center;background:red\"><strong>Мәтін</strong></h2>", "video_url":"https://example.test/video",
            "quiz_data":{"questions":[
                {"question":"Тест 1", "options":["1","2","3","4"], "correct_index":0},
                {"question":"Тест 2", "options":["A","B","C","D"], "correct_index":2},
            ]},
            "sort_order":99, "is_published":True,
        }, admin_token)
        self.assertNotIn("script", item["body"])
        self.assertNotIn("background", item["body"])
        self.assertIn("<strong>Мәтін</strong>", item["body"])
        self.assertEqual(len(item["quiz_data"]["questions"]), 2)
        self.assertEqual(item["item_type"], "lesson")
        self.assertEqual(item["content_mode"], "resources")
        siblings = [entry for entry in request("GET", "/api/content?admin=1", token=admin_token) if entry["area"] == "diagnostic" and entry["parent_id"] is None]
        reordered = [entry["id"] for entry in reversed(siblings)]
        request("PATCH", "/api/content/reorder", {"ids":reordered}, admin_token)
        saved_order = [entry["id"] for entry in request("GET", "/api/content?admin=1", token=admin_token) if entry["area"] == "diagnostic" and entry["parent_id"] is None]
        self.assertEqual(saved_order, reordered)
        resource = request("POST", "/api/resources", b"test-file", admin_token, {
            "X-Item-Id":item["id"], "X-Filename":"syllabus.pdf", "Content-Type":"application/pdf",
        })
        word = request("POST", "/api/resources", b"doc-file", admin_token, {
            "X-Item-Id":item["id"], "X-Filename":"material.docx", "Content-Type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
        slides = request("POST", "/api/resources", b"ppt-file", admin_token, {
            "X-Item-Id":item["id"], "X-Filename":"slides.pptx", "Content-Type":"application/vnd.openxmlformats-officedocument.presentationml.presentation",
        })
        resources = request("GET", f"/api/resources?item_id={item['id']}")
        self.assertEqual({entry["filename"] for entry in resources}, {"syllabus.pdf", "material.docx", "slides.pptx"})
        download = urlopen(BASE + f"/api/files/{resource['id']}?download=1")
        self.assertTrue(download.headers["Content-Disposition"].startswith("attachment"))
        download.close()

        student = request("POST", "/api/register", {"displayName":"Оқушы", "email":"student@test.local", "password":"Student123!", "role":"student"})
        progress = request("POST", "/api/progress", {"item_id":item["id"], "progress":80, "score":2, "max_score":2, "quiz_answers":[0,2], "view":True}, student["token"])
        self.assertEqual(progress["progress"], 80)
        self.assertEqual(progress["score"], 2)
        self.assertEqual(progress["quiz_answers"], [0,2])
        self.assertEqual(progress["attempt_count"], 1)
        self.assertIsNotNone(progress["tested_at"])
        second_attempt = request("POST", "/api/progress", {"item_id":item["id"], "score":1, "max_score":2, "quiz_answers":[1,2]}, student["token"])
        self.assertEqual(second_attempt["attempt_count"], 2)
        self.assertEqual(second_attempt["quiz_answers"], [1,2])

        university = request("POST", "/api/register", {"displayName":"Студент", "email":"university@test.local", "password":"Student123!", "role":"university_student"})
        self.assertEqual(university["user"]["role"], "university_student")
        analytics = request("GET", "/api/analytics", token=admin_token)
        self.assertEqual(len(analytics["users"]), 2)
        self.assertEqual(analytics["users"][1]["average_progress"], 80)
        student_detail = next(row for row in analytics["details"] if row["user_id"] == student["user"]["id"])
        self.assertEqual(student_detail["attempt_count"], 2)
        self.assertEqual(student_detail["quiz_answers"], [1,2])

        request("DELETE", f"/api/resources/{resource['id']}", token=admin_token)
        request("DELETE", f"/api/resources/{word['id']}", token=admin_token)
        request("DELETE", f"/api/resources/{slides['id']}", token=admin_token)
        request("DELETE", f"/api/content/{item['id']}", token=admin_token)

if __name__ == "__main__":
    unittest.main()
