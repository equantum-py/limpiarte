import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import handler from "../api/cotizador.js";
const fixture = process.argv.includes("--fixture");
const api = fixture
  ? (await import("../tests/fixture-store.mjs")).fixtureHandler()
  : handler;
if (fixture) console.log("LOCAL QA: in-memory test rates; never production.");
const root = path.resolve("dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};
http
  .createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/cotizador")) return await api(req, res);
      let p = path.resolve(
        root,
        "." + decodeURIComponent(new URL(req.url, "http://local").pathname),
      );
      if (p !== root && !p.startsWith(root + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
      if ((await stat(p)).isDirectory()) p = path.join(p, "index.html");
      res.setHeader(
        "Content-Type",
        types[path.extname(p)] || "application/octet-stream",
      );
      res.end(await readFile(p));
    } catch {
      res.writeHead(404);
      res.end("No encontrado");
    }
  })
  .listen(Number(process.env.PORT) || 4173, "0.0.0.0");
