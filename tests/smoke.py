import unittest
from urllib.request import urlopen

BASE = "http://127.0.0.1:4173"

class SiteSmokeTests(unittest.TestCase):
    def test_routes_return_shell(self):
        routes = [
            "/", "/mektep", "/universitet", "/sabaktastyk-kopiri",
            "/korytyndy-diagnostika", "/login", "/register", "/admin", "/kabinet",
            "/mektep/teoriya/7-synyp", "/belgisiz-bet",
        ]
        for route in routes:
            with self.subTest(route=route):
                response = urlopen(BASE + route)
                self.assertEqual(response.status, 200)
                self.assertIn("Үздіксіз білім беру платформасы", response.read().decode("utf-8"))

    def test_assets(self):
        for path in ["/app.js", "/store.js", "/data.js", "/styles.css", "/components.css", "/accessibility.css", "/learning.css", "/config.js"]:
            with self.subTest(path=path):
                self.assertEqual(urlopen(BASE + path).status, 200)

if __name__ == "__main__":
    unittest.main()
