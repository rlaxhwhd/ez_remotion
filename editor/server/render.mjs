// Local render server: turns the editor project into an mp4 via @remotion/renderer.
// Run alongside `npm run dev`:  npm run server
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5280;
const ASSETS_DIR = path.join(__dirname, "render-assets");
const OUT_DIR = path.join(__dirname, "render-out");
fs.mkdirSync(ASSETS_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// Bundle the Remotion entry once and reuse it across renders.
let bundlePromise = null;
const getBundle = () => {
  if (!bundlePromise) {
    console.log("[render] bundling composition…");
    bundlePromise = bundle({ entryPoint: path.join(__dirname, "..", "src", "remotion", "index.ts") });
  }
  return bundlePromise;
};

const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const contentTypeForExt = (ext) =>
  ({ mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", png: "image/png", jpg: "image/jpeg", gif: "image/gif", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4" }[ext] ?? "application/octet-stream");

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // health check — the browser pings this before exporting
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // serve an uploaded asset to the headless renderer (with Range support — the
  // video decoder issues partial requests and expects 206 responses)
  if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
    const file = path.join(ASSETS_DIR, path.basename(url.pathname));
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const stat = fs.statSync(file);
    const type = contentTypeForExt(file.split(".").pop());
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
      if (start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes" });
      fs.createReadStream(file).pipe(res);
    }
    return;
  }

  // receive a media file (raw body) from the browser
  if (req.method === "POST" && url.pathname === "/upload") {
    const id = url.searchParams.get("id");
    const ext = url.searchParams.get("ext") || "bin";
    if (!id) {
      res.writeHead(400);
      res.end();
      return;
    }
    const name = `${id}.${ext}`;
    const ws = fs.createWriteStream(path.join(ASSETS_DIR, name));
    req.pipe(ws);
    ws.on("finish", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ url: `http://localhost:${PORT}/assets/${name}` }));
    });
    ws.on("error", (e) => {
      res.writeHead(500);
      res.end(String(e));
    });
    return;
  }

  // render the project to mp4 and stream it back
  if (req.method === "POST" && url.pathname === "/render") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const project = JSON.parse(body);
        const serveUrl = await getBundle();
        const composition = await selectComposition({ serveUrl, id: "main", inputProps: { project } });
        const outPath = path.join(OUT_DIR, `out-${composition.width}x${composition.height}.mp4`);
        console.log(`[render] ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames}f`);
        await renderMedia({
          composition,
          serveUrl,
          codec: "h264",
          outputLocation: outPath,
          inputProps: { project },
          onProgress: ({ progress }) => process.stdout.write(`\r[render] ${(progress * 100).toFixed(0)}%   `),
        });
        process.stdout.write("\n[render] done\n");
        const stat = fs.statSync(outPath);
        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Content-Length": stat.size,
          "Content-Disposition": 'attachment; filename="export.mp4"',
        });
        fs.createReadStream(outPath).pipe(res);
      } catch (e) {
        console.error("[render] error:", e);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String((e && e.stack) || e) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`[render] server ready on http://localhost:${PORT}`));
