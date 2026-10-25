#!/usr/bin/env node
// Cronoff: download the language runtimes (Python, SQL, Lua, optionally Ruby) so they are served from YOUR site / your PC
// instead of from a public CDN. That is what makes "Failed to load Python" go away: a school network, an outage or a
// blocked CDN can no longer stop them. (made by yehon106)
//
//   node local-server/get-vendor.js [--out DIR] [--ruby] [--soft] [--force] [--quiet]
//
// Runs automatically: on Vercel at every deploy (see vercel.json), when the local server starts, and when the desktop app is built.
// Everything comes from the npm registry and is checked against npm's published SHA-512 hash before it is used.
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib"), crypto = require("crypto");

const PYODIDE = "0.26.4";          // keep these versions in sync with the ones named in index.html and sw.js
const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v" + PYODIDE + "/full/";
const PACKAGES = [
  { name: "pyodide", version: PYODIDE, out: "pyodide", files: { "package/pyodide.js": "pyodide.js", "package/pyodide.asm.js": "pyodide.asm.js", "package/pyodide.asm.wasm": "pyodide.asm.wasm", "package/python_stdlib.zip": "python_stdlib.zip", "package/pyodide-lock.json": "pyodide-lock.json" } },
  { name: "sql.js", version: "1.14.2", out: "sqljs", files: { "package/dist/sql-wasm.js": "sql-wasm.js", "package/dist/sql-wasm.wasm": "sql-wasm.wasm" } },
  { name: "wasmoon", version: "1.16.0", out: "wasmoon", files: { "package/dist/index.js": "index.js", "package/dist/glue.wasm": "glue.wasm" } },
  { name: "@ruby/3.4-wasm-wasi", version: "2.8.1", out: "ruby", optional: true, files: { "package/dist/browser.umd.js": "browser.umd.js", "package/dist/ruby+stdlib.wasm": "ruby+stdlib.wasm" } },
];

async function getBuffer(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { last = e; await new Promise((ok) => setTimeout(ok, 1500 * (i + 1))); }
  }
  throw last;
}
// the files of a .tgz, as { "package/x": Buffer } for the wanted names only
function untar(tgz, wanted) {
  const tar = zlib.gunzipSync(tgz), out = {};
  let off = 0, longName = null;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    let name = h.toString("utf8", 0, 100).replace(/\0.*$/, "");
    const prefix = h.toString("utf8", 345, 500).replace(/\0.*$/, "");
    const size = parseInt(h.toString("utf8", 124, 136).replace(/\0.*$/, "").trim() || "0", 8), type = String.fromCharCode(h[156] || 48);
    off += 512;
    const data = tar.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
    if (type === "L") { longName = data.toString("utf8").replace(/\0.*$/, ""); continue; }   // GNU long file name
    if (longName) { name = longName; longName = null; } else if (prefix) name = prefix + "/" + name;
    if (type === "0" || type === "\0") if (wanted.includes(name)) out[name] = Buffer.from(data);
  }
  return out;
}
// Packages such as numpy stay on the public CDN (they are big and rarely needed); their addresses are written into the lock file in full.
function rewriteLock(buf) {
  const lock = JSON.parse(buf.toString("utf8"));
  for (const k of Object.keys(lock.packages)) {
    const f = lock.packages[k].file_name;
    if (f && !/^https?:/.test(f)) lock.packages[k].file_name = PYODIDE_CDN + f;
  }
  return Buffer.from(JSON.stringify(lock));
}
async function fetchPackage(p, outRoot, log) {
  const meta = JSON.parse((await getBuffer("https://registry.npmjs.org/" + p.name.replace("/", "%2F") + "/" + p.version)).toString("utf8"));
  const tgz = await getBuffer(meta.dist.tarball);
  const want = meta.dist.integrity || "";
  if (want.startsWith("sha512-")) {
    const got = "sha512-" + crypto.createHash("sha512").update(tgz).digest("base64");
    if (got !== want) throw new Error("the download of " + p.name + " does not match npm's hash; refusing to use it");
  }
  const files = untar(tgz, Object.keys(p.files));
  const dir = path.join(outRoot, p.out);
  fs.mkdirSync(dir, { recursive: true });
  for (const [src, dst] of Object.entries(p.files)) {
    if (!files[src]) throw new Error(p.name + " is missing " + src);
    let data = files[src];
    if (p.name === "pyodide" && dst === "pyodide-lock.json") data = rewriteLock(data);
    const tmp = path.join(dir, dst + ".part");
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, path.join(dir, dst));
  }
  log("  ok  " + p.name + "@" + p.version + "  (" + (Object.values(files).reduce((a, b) => a + b.length, 0) / 1048576).toFixed(1) + " MB)");
}
function have(p, outRoot) {
  return Object.values(p.files).every((dst) => fs.existsSync(path.join(outRoot, p.out, dst))) && (() => {
    try { return JSON.parse(fs.readFileSync(path.join(outRoot, "manifest.json"), "utf8"))[p.name] === p.version; } catch { return false; }
  })();
}
// Makes sure the runtime files exist. Returns { ok:[names], failed:[{name, error}] }. Never throws.
async function ensureVendor(opts = {}) {
  const outRoot = path.resolve(opts.out || path.join(__dirname, "..", "vendor")), log = opts.quiet ? () => {} : opts.log || console.log;
  const res = { ok: [], failed: [] };
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(path.join(outRoot, "manifest.json"), "utf8")); } catch {}
  for (const p of PACKAGES) {
    if (p.optional && !opts.ruby) continue;
    if (!opts.force && have(p, outRoot)) { res.ok.push(p.name); continue; }
    try { await fetchPackage(p, outRoot, log); manifest[p.name] = p.version; res.ok.push(p.name); }
    catch (e) { res.failed.push({ name: p.name, error: String((e && e.message) || e) }); log("  FAILED  " + p.name + ": " + ((e && e.message) || e)); }
  }
  try { fs.mkdirSync(outRoot, { recursive: true }); fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 1)); } catch {}
  return res;
}
module.exports = { ensureVendor, PACKAGES, PYODIDE };

if (require.main === module) {
  const a = process.argv.slice(2), i = a.indexOf("--out");
  const opts = { out: i >= 0 ? a[i + 1] : undefined, ruby: a.includes("--ruby"), force: a.includes("--force"), quiet: a.includes("--quiet") };
  console.log("Cronoff: getting the language runtimes (served from your own site, so no CDN can break them)...");
  ensureVendor(opts).then((r) => {
    console.log(r.failed.length ? "Some downloads failed; Cronoff will fall back to the public CDN for those." : "Done.");
    process.exit(r.failed.length && !a.includes("--soft") ? 1 : 0);
  });
}
