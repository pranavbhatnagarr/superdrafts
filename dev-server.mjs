// Local development server. Serves site/ as static files AND runs
// site/api/scenario.mjs, which a plain static server (python -m http.server,
// VS Code Live Server) cannot do, so the fight writer works locally.
//
//   node dev-server.mjs
//   http://localhost:8791
//
// Why this exists rather than `vercel dev`: that command insists on linking the
// folder to a Vercel project first, and linking writes site/.vercel, which is
// what `npm run deploy` reads to decide where to publish. Linking to the wrong
// project silently sends the next deploy to a different URL. This has no such
// side effect and needs no Vercel account at all.
//
// The Groq key is read from site/.env.local, the same file `vercel dev` uses.
// 8791 is deliberate: it is already in the ALLOWED list in scenario.mjs.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, normalize, sep } from "node:path";

const ROOT = resolve("site");
const PORT = Number(process.env.PORT) || 8791;

// Minimal .env.local reader. Deliberately not a dependency: KEY=value lines,
// # comments and blanks are the whole format this file ever uses.
const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)){
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)){
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;                                  // comment or blank
    const val = m[2].replace(/^["']|["']$/g, "");      // tolerate quotes
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
  console.log("Loaded site/.env.local");
} else {
  console.log("No site/.env.local found. The auction will run, but writing the");
  console.log("fight will fail until GROQ_API_KEY is set there.");
}

const TYPES = {
  ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8",
  ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png",
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".gif":"image/gif",
  ".webp":"image/webp", ".ico":"image/x-icon", ".woff2":"font/woff2"
};

// Vercel hands the function an Express-ish res. Provide just the parts
// scenario.mjs actually calls: setHeader, status().json(), end().
function shimRes(res){
  return {
    setHeader: (k, v) => res.setHeader(k, v),
    status(code){ res.statusCode = code; return this; },
    json(obj){
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
      return this;
    },
    end(){ res.end(); return this; }
  };
}

const readBody = req => new Promise(ok => {
  let s = ""; req.on("data", c => { s += c; }); req.on("end", () => ok(s));
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/scenario"){
    try {
      // Imported lazily and cache-busted so edits to the prompt take effect on
      // the next request, without restarting the server.
      const mod = await import("./site/api/scenario.mjs?t=" + Date.now());
      const raw = await readBody(req);
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      const shim = {
        method: req.method,
        headers: { ...req.headers, "x-forwarded-for": "127.0.0.1" },
        body
      };
      await mod.default(shim, shimRes(res));
    } catch (e){
      console.error("api/scenario threw:", e);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Dev server: " + e.message }));
    }
    return;
  }

  // Static files, confined to site/ so a crafted path cannot walk out of it.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const file = rel === "" ? join(ROOT, "index.html") : join(ROOT, rel);
  if (!file.startsWith(ROOT + sep) && file !== join(ROOT, "index.html")){
    res.statusCode = 403; res.end("Forbidden"); return;
  }
  try {
    const data = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");     // always serve fresh edits
    res.end(data);
  } catch {
    res.statusCode = 404; res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`\nSuper Drafts dev server: http://localhost:${PORT}`);
  console.log("The fight writer is live on /api/scenario. Ctrl+C to stop.\n");
});
