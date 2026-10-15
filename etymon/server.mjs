#!/usr/bin/env node
// Runs Etymon Tree locally. Serves index.html and answers live traces with your
// own Claude Code login (`claude -p`), so no API key is needed.
//
//   node etymon/server.mjs            # http://localhost:8787
//   node etymon/server.mjs --port 9000 --no-open

import http from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const PORT = Number(args[args.indexOf("--port") + 1]) || Number(process.env.PORT) || 8787;
const OPEN = !args.includes("--no-open");
const CLAUDE = process.env.CLAUDE_BIN || "claude";
const MODELS = { default: "sonnet", complex: "opus", quick: "haiku" };

// The published artifact gets this skeleton from claude.ai; locally we add it ourselves.
const SKELETON_HEAD = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

function sendJson(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function readBody(req, limit = 300_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Streams Claude's answer back as NDJSON lines: {t:"delta",text} ... then {t:"done"} or {t:"error",code,message}.
function trace(req, res, prompt, tier) {
  res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
  const line = (obj) => res.write(JSON.stringify(obj) + "\n");

  const child = spawn(CLAUDE, [
    "-p",
    "--model", MODELS[tier] || MODELS.default,
    "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--tools", "",
    "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands",
  ], { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });

  let finished = false, streamed = false, buf = "", stderr = "";
  const finish = (obj) => { if (finished) return; finished = true; line(obj); res.end(); };

  child.on("error", (e) => finish({
    t: "error", code: "local_missing",
    message: e.code === "ENOENT" ? `Couldn't find the "${CLAUDE}" command. Install Claude Code, or set CLAUDE_BIN to its path.` : e.message,
  }));
  child.stderr.on("data", (d) => { stderr += d; });
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!raw) continue;
      let ev;
      try { ev = JSON.parse(raw); } catch { continue; }
      if (ev.type === "stream_event" && ev.event?.type === "content_block_delta" && ev.event.delta?.type === "text_delta") {
        streamed = true;
        line({ t: "delta", text: ev.event.delta.text });
      } else if (ev.type === "result") {
        if (ev.is_error) {
          const msg = String(ev.result || ev.error || "Claude Code reported an error.");
          finish({ t: "error", code: /auth|log ?in|OAuth|credential/i.test(msg) ? "local_auth" : "local_error", message: msg });
        } else {
          if (!streamed && ev.result) line({ t: "delta", text: ev.result });
          finish({ t: "done" });
        }
      }
    }
  });
  child.on("close", (code) => {
    const msg = (stderr || buf).trim();
    if (!finished) finish({
      t: "error",
      code: /auth|log ?in|OAuth|credential/i.test(msg) ? "local_auth" : "local_error",
      message: msg.slice(0, 400) || `claude exited with code ${code}`,
    });
  });

  // Stop Claude if the page aborts the request (Stop button, new word).
  res.on("close", () => { if (!finished) { finished = true; child.kill("SIGTERM"); } });

  child.stdin.end(prompt);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const page = await readFile(path.join(here, "index.html"), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(SKELETON_HEAD + page + "</body></html>");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, backend: "claude-code", models: MODELS });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/trace") {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (e) { sendJson(res, e.status || 400, { error: e.message }); return; }
      if (typeof body.prompt !== "string" || !body.prompt.trim()) { sendJson(res, 400, { error: "Missing prompt" }); return; }
      const t0 = Date.now();
      res.on("close", () => console.log(`trace ${body.tier || "default"} · ${((Date.now() - t0) / 1000).toFixed(1)} s`));
      trace(req, res, body.prompt, body.tier);
      return;
    }
    res.writeHead(404).end("Not found");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: String(e.message || e) });
  }
});

server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is busy. Try: node etymon/server.mjs --port ${PORT + 1}` : e.message);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Etymon Tree running at ${url}`);
  console.log(`Live traces use your Claude Code login (${CLAUDE} -p). Ctrl+C to stop.`);
  if (OPEN && process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
});
