#!/usr/bin/env node
// Cronoff local server (made by yehon106).
// Runs Cronoff on YOUR computer and runs Java, C#, Go, Rust and Kotlin with the compilers you have installed.
// Nothing to install except Node.js. No packages. Start it with START-CRONOFF.bat (Windows) or `sh start-cronoff.sh` (Mac / Linux).
//
//   node local-server/cronoff-server.js [--port 3000] [--no-open] [--allow https://your-site] [--code secret]
//
// SAFETY: this program runs the code you send it AS YOU, on your computer. So it only listens on this computer (127.0.0.1),
// it refuses requests that name another web address, and it refuses web pages other than itself unless you add --allow AND --code.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

// ---------- options ----------
const isMain = require.main === module;           // started by hand (START-CRONOFF), or used by the desktop app
const argv = isMain ? process.argv.slice(2) : [];
const opt = (name, dflt) => { const i = argv.indexOf("--" + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt; };
const all = (name) => argv.flatMap((a, i) => (a === "--" + name && argv[i + 1] ? [argv[i + 1]] : []));
const PORT = Math.max(1, Math.min(65535, parseInt(opt("port", process.env.PORT || "3000"), 10) || 3000));
let ROOT = path.resolve(opt("root", path.join(__dirname, "..")));
const ALLOW = new Set(all("allow").map((o) => o.replace(/\/+$/, "")));
let CODE = opt("code", process.env.ACCESS_CODE || "");
const WIN = process.platform === "win32";
const EXE = WIN ? ".exe" : "";
const MAX_CODE = 64 * 1024, MAX_STDIN = 16 * 1024, MAX_OUT = 64 * 1024, RUN_MS = +process.env.RUN_TIMEOUT_MS || 10000, BUILD_MS = +process.env.BUILD_TIMEOUT_MS || 90000;
const LAUNCH_EXTRA_MS = +process.env.LAUNCH_EXTRA_MS || 15000;   // `java Main.java` compiles and runs in one step: allow time for the compile
const MAX_BUSY = 2;
let busy = 0;

// ---------- the languages ----------
const HOW = {
  java: "Install a JDK (Java 11 or newer), for example from https://adoptium.net, and make sure `javac` works in a terminal.",
  csharp: "Install the .NET SDK from https://dotnet.microsoft.com/download, and make sure `dotnet` works in a terminal.",
  go: "Install Go from https://go.dev/dl, and make sure `go` works in a terminal.",
  rust: "Install Rust from https://rustup.rs, and make sure `rustc` works in a terminal.",
  kotlin: "Install the Kotlin compiler (https://kotlinlang.org/docs/command-line.html) and a JDK, and make sure `kotlinc` works in a terminal.",
};
const LANGS = {
  java: { name: "Java", file: "Main.java",
    // a full JDK has javac; some JDKs only have `java Main.java` (Java 11+), which compiles and runs in one go
    check: () => (hasTool("javac", ["-version"]) && hasTool("java", ["-version"])) || javaSourceLauncher(),
    steps: () => (hasTool("javac", ["-version"])
      ? [{ phase: "compile", cmd: "javac", args: ["Main.java"] }, { phase: "run", cmd: "java", args: ["-cp", ".", "Main"] }]
      : [{ phase: "run", cmd: "java", args: ["Main.java"], extra: LAUNCH_EXTRA_MS }]) },
  csharp: { name: "C#", need: [["dotnet", ["--version"]]], file: "Program.cs",
    prepare(dir) {
      const v = /^(\d+)/.exec(String(spawnSync("dotnet", ["--version"], { encoding: "utf8", windowsHide: true }).stdout || "").trim());
      fs.writeFileSync(path.join(dir, "Main.csproj"), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net' + (v ? v[1] : "8") + '.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>disable</Nullable></PropertyGroup></Project>');
    },
    steps: () => [{ phase: "compile", cmd: "dotnet", args: ["build", "--nologo", "-v", "q", "-o", "out"] }, { phase: "run", cmd: "dotnet", args: ["out/Main.dll"] }] },
  go: { name: "Go", need: [["go", ["version"]]], file: "main.go",
    steps: (dir) => [{ phase: "compile", cmd: "go", args: ["build", "-o", "main" + EXE, "main.go"] }, { phase: "run", cmd: path.join(dir, "main" + EXE), args: [] }] },
  rust: { name: "Rust", need: [["rustc", ["--version"]]], file: "main.rs",
    steps: (dir) => [{ phase: "compile", cmd: "rustc", args: ["main.rs", "-o", "main" + EXE] }, { phase: "run", cmd: path.join(dir, "main" + EXE), args: [] }] },
  kotlin: { name: "Kotlin", need: [["kotlinc", ["-version"]], ["java", ["-version"]]], file: "Main.kt",
    steps: () => [{ phase: "compile", cmd: "kotlinc", args: ["Main.kt", "-include-runtime", "-d", "main.jar"] }, { phase: "run", cmd: "java", args: ["-jar", "main.jar"] }] },
};
const hasTool = (cmd, args) => {
  const bat = WIN && cmd === "kotlinc";
  const r = spawnSync(bat ? "kotlinc.bat" : cmd, args, { timeout: 15000, windowsHide: true, shell: bat });
  return !r.error && r.status !== null;
};
function javaSourceLauncher() {
  const r = spawnSync("java", ["--list-modules"], { encoding: "utf8", timeout: 15000, windowsHide: true });
  return !r.error && /jdk\.compiler/.test(String(r.stdout));
}
function detect() { const o = {}; for (const k in LANGS) o[k] = LANGS[k].check ? !!LANGS[k].check() : LANGS[k].need.every(([c, a]) => hasTool(c, a)); return o; }
let available = {};
let OVERLAY = null;                  // a folder with newer copies of some website files (the desktop app's updates); looked at before ROOT

// ---------- running a program ----------
function killTree(child) {
  try {
    if (WIN) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    else process.kill(-child.pid, "SIGKILL");
  } catch { try { child.kill("SIGKILL"); } catch {} }
}
function exec(cmd, args, o) {
  return new Promise((resolve) => {
    let out = "", err = "", cut = false, timedOut = false, done = false, child;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); resolve(Object.assign({ stdout: out, stderr: err, cut, timedOut }, r)); };
    const bat = WIN && cmd === "kotlinc";
    try {
      child = spawn(bat ? "kotlinc.bat" : cmd, args, { cwd: o.cwd, detached: !WIN, windowsHide: true, shell: bat,
        env: Object.assign({}, process.env, { DOTNET_NOLOGO: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1", HOME: process.env.HOME || o.cwd }) });
    } catch (e) { return finish({ code: -1, missing: true }); }
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, o.timeout);
    const take = (isErr) => (d) => {
      if (cut) return;
      if (out.length + err.length > MAX_OUT) { cut = true; killTree(child); return; }
      if (isErr) err += d; else out += d;
    };
    child.stdout.on("data", take(false)); child.stderr.on("data", take(true));
    child.stdin.on("error", () => {});
    child.stdin.end(o.stdin || "");
    child.on("error", (e) => finish({ code: -1, missing: e && e.code === "ENOENT" }));
    child.on("close", (code) => finish({ code: code === null ? 1 : code }));
  });
}

async function runCode(lang, code, stdin) {
  const L = LANGS[lang];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cronoff-"));
  try {
    fs.writeFileSync(path.join(dir, L.file), code);
    if (L.prepare) L.prepare(dir);
    let last = { stdout: "", stderr: "", code: 0 };
    for (const st of L.steps(dir)) {
      const r = await exec(st.cmd, st.args, { cwd: dir, stdin: st.phase === "run" ? stdin : "", timeout: st.phase === "compile" ? BUILD_MS : RUN_MS + (st.extra || 0) });
      if (r.missing) return { stdout: "", stderr: L.name + " is not installed on this PC.\n" + HOW[lang], code: 127, note: "" };
      if (st.phase === "compile") {
        if (r.timedOut) return { stdout: "", stderr: r.stderr, code: 124, note: "Stopped: building took longer than " + BUILD_MS / 1000 + " seconds." };
        if (r.code !== 0) return { stdout: r.stdout, stderr: r.stderr || r.stdout, code: r.code, note: "compile error" };
        continue;
      }
      last = r;
      const note = r.timedOut ? "Stopped: the program ran longer than " + RUN_MS / 1000 + " seconds." : r.cut ? "Output cut at 64 KB." : "";
      return { stdout: r.stdout, stderr: r.stderr, code: r.timedOut ? 124 : r.code, note };
    }
    return last;
  } finally { fs.rm(dir, { recursive: true, force: true }, () => {}); }
}

// ---------- the web server ----------
const TYPES = { ".wasm": "application/wasm", ".zip": "application/zip", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const OWN = new Set();
const setPort = (p) => { OWN.clear(); OWN.add("localhost:" + p); OWN.add("127.0.0.1:" + p); };
const send = (res, code, body, type) => { res.statusCode = code; res.setHeader("Content-Type", type || "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(typeof body === "string" || Buffer.isBuffer(body) || body === undefined ? body : JSON.stringify(body)); };

function readBody(req, max) {
  return new Promise((ok) => {
    const chunks = []; let n = 0, dead = false;
    req.on("data", (c) => { n += c.length; if (n > max) { if (!dead) { dead = true; ok("TOO_BIG"); } } else if (!dead) chunks.push(c); });
    req.on("end", () => { if (dead) return; try { ok(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { ok(null); } });
    req.on("error", () => ok(null));
  });
}

const server = http.createServer(async (req, res) => {
  // Only talk to pages opened at this computer's own address (blocks "DNS rebinding").
  if (!OWN.has(String(req.headers.host || "").toLowerCase())) return send(res, 403, { error: "Wrong address. Open http://localhost:" + (server.address() ? server.address().port : PORT) });
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");        // Cronoff needs these two to run Python etc. in the browser
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  const url = new URL(req.url, "http://localhost");
  const origin = String(req.headers.origin || "").replace(/\/+$/, "");
  const own = !origin || OWN.has(origin.replace(/^https?:\/\//, "").toLowerCase()) && /^http:\/\//.test(origin);
  const allowed = !own && ALLOW.has(origin);
  if (origin && !own && !allowed) return send(res, 403, { error: "This web page is not allowed to use the local server." });
  if (allowed) {                                                      // another page you chose with --allow
    res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-access-code"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true"); res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  }

  if (url.pathname === "/api/run") {
    if (allowed && (!CODE || req.headers["x-access-code"] !== CODE)) return send(res, 401, { error: "access-code", message: "Wrong or missing access code." });
    if (req.method === "GET") return send(res, 200, { ready: true, local: true, languages: available });
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    const b = await readBody(req, 200000);
    if (b === "TOO_BIG") { res.setHeader("Connection", "close"); res.on("finish", () => req.destroy()); return send(res, 413, { error: "too-big", message: "Code or input is too large." }); }
    if (!b || typeof b !== "object") return send(res, 400, { error: "bad-request", message: "Bad request." });
    const lang = String(b.lang || ""), code = typeof b.code === "string" ? b.code : "", stdin = typeof b.stdin === "string" ? b.stdin : "";
    if (!Object.prototype.hasOwnProperty.call(LANGS, lang)) return send(res, 400, { error: "bad-language", message: "This language is not available on the local server." });
    if (!code.trim()) return send(res, 400, { error: "empty", message: "Nothing to run." });
    if (code.length > MAX_CODE || stdin.length > MAX_STDIN) return send(res, 413, { error: "too-big", message: "Code or input is too large." });
    if (busy >= MAX_BUSY) return send(res, 429, { error: "slow-down", message: "The local server is busy with other runs. Try again in a moment." });
    busy++;
    try {
      if (!available[lang]) available = detect();                    // maybe you just installed it
      if (!available[lang]) return send(res, 200, { stdout: "", stderr: LANGS[lang].name + " is not installed on this PC.\n" + HOW[lang], code: 127, note: "" });
      const out = await runCode(lang, code, stdin);
      const clip = (s) => String(s || "").slice(0, MAX_OUT);
      return send(res, 200, { stdout: clip(out.stdout), stderr: clip(out.stderr), code: out.code, note: out.note || "" });
    } catch (e) {
      return send(res, 500, { error: "runner", message: "The local server could not run this." });
    } finally { busy--; }
  }
  // the account / counting features belong to the online site; here they are simply off
  if (url.pathname === "/api/auth") return send(res, 200, { ready: false, user: null });
  if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
  if (url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt") return send(res, 404, "not found", "text/plain");

  // ---- the website itself ----
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed", "text/plain");
  let rel; try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, "bad path", "text/plain"); }
  if (rel === "/") rel = "/index.html";
  let file = null;
  for (const base of OVERLAY ? [OVERLAY, ROOT] : [ROOT]) {
    const f = path.normalize(path.join(base, rel)), parts = path.relative(base, f).split(path.sep);
    if (!f.startsWith(base + path.sep) || parts.some((p) => p.startsWith(".") || p === "node_modules" || p === "local-server" || p === "api")) continue;
    try { if (fs.statSync(f).isFile()) { file = f; break; } } catch {}
  }
  if (!file) return send(res, 404, "not found", "text/plain");
  fs.stat(file, (e, st) => {
    const type = TYPES[path.extname(file).toLowerCase()];
    if (e || !st.isFile() || !type) return send(res, 404, "not found", "text/plain");
    res.statusCode = 200; res.setHeader("Content-Type", type); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Content-Length", st.size);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

// Starts the server. Used by the command line below and by the desktop app. Resolves { url, port, available }.
async function start(o = {}) {
  if (o.root) ROOT = path.resolve(o.root);
  for (const a of o.allow || []) ALLOW.add(String(a).replace(/\/+$/, ""));
  if (o.code != null) CODE = o.code;
  if (o.overlay) OVERLAY = path.resolve(o.overlay);
  const log = o.log || (() => {});
  // the language runtimes (Python, SQL, Lua) are saved next to the site once, so they work with no internet from then on
  if (o.vendor !== false) {
    const dir = path.join(ROOT, "vendor"), need = ["pyodide/pyodide.asm.wasm", "sqljs/sql-wasm.wasm", "wasmoon/glue.wasm"];
    if (!need.every((f) => fs.existsSync(path.join(dir, f)))) {
      log("\n  First start: downloading Python, SQL and Lua once (about 14 MB). After that they work without internet...");
      try { const r = await require("./get-vendor.js").ensureVendor({ out: dir, ruby: false, log }); if (r.failed.length) log("  (Some files could not be downloaded; Cronoff will use the internet copies for those.)"); }
      catch (e) { log("  (Could not download the runtimes: " + ((e && e.message) || e) + ")"); }
    }
  }
  available = detect();
  // The page's saved tabs and settings belong to its address, port included, so the desktop app asks for the same port every time (o.ports).
  const tries = o.ports && o.ports.length ? o.ports : [o.port != null ? o.port : PORT];
  let lastErr = null, listening = false;
  for (const port of tries) {
    try { await new Promise((ok, no) => { server.once("error", no); server.listen(port, "127.0.0.1", () => { server.removeListener("error", no); ok(); }); }); listening = true; break; }
    catch (e) { lastErr = e; if (!e || e.code !== "EADDRINUSE") throw e; }
  }
  if (!listening) throw lastErr || new Error("no free port");
  const actual = server.address().port;
  setPort(actual);
  return { url: "http://localhost:" + actual, port: actual, available, server, setOverlay: (d) => { OVERLAY = d ? path.resolve(d) : null; } };
}
module.exports = { start, setOverlay: (d) => { OVERLAY = d ? path.resolve(d) : null; }, LANGS, HOW };

if (isMain) {
  start({ port: PORT, log: console.log }).then(({ url, available: av }) => {
    console.log("\n  Cronoff is running on your computer:  " + url);
    console.log("  Only this computer can use it. Press Ctrl+C to stop.\n");
    for (const k in LANGS) console.log("  " + (av[k] ? "[ok]     " : "[not installed] ") + LANGS[k].name + (av[k] ? "" : "  -> " + HOW[k]));
    if (!fs.existsSync(path.join(ROOT, "index.html"))) console.log("\n  WARNING: index.html was not found in " + ROOT + " (start the server from the Cronoff folder).");
    console.log("\n  Python, JavaScript, TypeScript, HTML, SQL, Lua, Ruby and C/C++ run inside the browser and need nothing installed.");
    if (!argv.includes("--no-open")) {
      try { (WIN ? spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }) : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" })).on("error", () => {}).unref(); } catch {}
    }
  }).catch((e) => {
    console.error(e && e.code === "EADDRINUSE" ? "\nPort " + PORT + " is already in use. Close the other program or start with:  --port " + (PORT + 1) : "\n" + ((e && e.message) || e));
    process.exit(1);
  });
}
