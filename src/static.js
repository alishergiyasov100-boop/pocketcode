/* Крошечный сервер статики для «Run it».
   python -m http.server отдаёт html без charset, и любой не-латинский
   текст превращается в кракозябры — новичок решит, что сломал сам. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.argv[2] || process.cwd();
const port = +(process.argv[3] || 8765);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".mp4": "video/mp4"
};

http.createServer((req, res) => {
  const want = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = path.join(root, want === "/" ? "index.html" : want.replace(/^\/+/, ""));
  if (!path.resolve(file).startsWith(path.resolve(root))) { res.writeHead(403).end("no"); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (e2, buf) => {
      if (e2) { res.writeHead(404, { "content-type": TYPES[".html"] }).end("<h1>404</h1><p>No such page here.</p>"); return; }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store"
      });
      res.end(buf);
    });
  });
}).listen(port, "0.0.0.0", () => {
  console.log("serving " + root + " on port " + port);
});
