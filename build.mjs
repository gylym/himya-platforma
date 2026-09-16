import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
const files = [
  "index.html",
  "404.html",
  ".nojekyll",
  "app.js",
  "store.js",
  "data.js",
  "config.js",
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
];
await mkdir("dist", { recursive: true });
const revision = process.env.GITHUB_SHA || "preview";
for (const file of files) {
  let text = await readFile(file, "utf8");
  if (file.endsWith(".js"))
    text = text.replace(
      /(["'])(\.\/[a-zA-Z0-9_.-]+\.js)\1/g,
      (_, q, p) => `${q}${p}?v=${revision}${q}`,
    );
  if (file === "index.html")
    text = text.replace(
      /((?:src|href)=["'])([a-zA-Z0-9_.-]+\.(?:js|css))(["'])/g,
      (_, a, p, q) => `${a}${p}?v=${revision}${q}`,
    );
  if (
    file === "config.js" &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY
  ) {
    if (!process.env.SUPABASE_ANON_KEY.startsWith("sb_publishable_"))
      throw new Error("Use a publishable key, never a service-role/secret key");
    text = `window.__CHEM_CONFIG__=${JSON.stringify({ schemaVersion: 2, supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY })};`;
  }
  await writeFile(`dist/${file}`, text);
}
console.log(`Built ${files.length} public assets in dist/`);
