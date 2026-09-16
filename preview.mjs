// Read-only local preview; only explicit public assets are served.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.dirname(
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);
const assets = new Set([
  "index.html",
  "404.html",
  "app.js",
  "store.js",
  "config.js",
  "data.js",
  "catalog.js",
  "platform-utils.js",
  "learning.js",
  "learning-api.js",
  "redox-data.js",
  "styles.css",
  "components.css",
  "accessibility.css",
  "learning.css",
  "platform.css",
  "experience.css",
]);
http
  .createServer(async (req, res) => {
    try {
      let name = new URL(req.url, "http://localhost").pathname
        .replace(/^\/himya-platforma/, "")
        .replace(/^\//, "");
      if (!name || !path.extname(name)) name = "index.html";
      if (!assets.has(name)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.setHeader(
        "Content-Type",
        name.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : name.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "text/html; charset=utf-8",
      );
      res.setHeader("Cache-Control", "no-store");
      res.end(await readFile(path.join(root, name)));
    } catch {
      res.writeHead(500);
      res.end("Preview error");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log("Preview: http://127.0.0.1:4173"),
  );
