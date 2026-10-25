// Keeps the desktop app's copy of the Cronoff website up to date. (made by yehon106)
//
// How: your online site publishes /app-manifest.json (a list of files with SHA-256 hashes, made at every deploy).
// The app reads it, downloads only the files that differ from the ones built into the app, checks every hash, and keeps them in its
// own data folder. The server then uses those files first. The next start (or "Restart now") uses them.
// Safe by design: https only, hashes must match, a new copy that fails to load is thrown away, and the built-in copy is always there.
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const APP_API = 1;                                    // the version of the app's own (native) part; the site says which one it needs
const MAX_FILE = 30 * 1024 * 1024;
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

async function getBuf(url, max) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60000), headers: { "User-Agent": "Cronoff-Desktop" } });
  if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > max) throw new Error("file too large: " + url);
  return buf;
}
// The manifest that describes what the app is using right now.
function effective(bundledDir, dataDir) {
  const bundled = readJson(path.join(bundledDir, "app-manifest.json")) || { version: "built-in", built: 0, appApi: APP_API, files: {} };
  const cur = readJson(path.join(dataDir, "current", "app-manifest.json"));
  return { bundled, current: cur && cur.built > bundled.built ? cur : bundled, overlayDir: cur && cur.built > bundled.built ? path.join(dataDir, "current") : null };
}

// Result: { status, version?, built?, error? }
//   none: nothing new   ready: new files downloaded (restart to use)   offline / error: could not check   incompatible: needs a new app
async function checkForUpdate({ siteUrl, bundledDir, dataDir, allowLocalHttp }) {
  const base = String(siteUrl || "").replace(/\/+$/, "");
  if (!base) return { status: "error", error: "No site address is set (desktop/app-config.json)." };
  if (!/^https:\/\//.test(base) && !(allowLocalHttp && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))) return { status: "error", error: "The site address must start with https://" };
  const { bundled, current } = effective(bundledDir, dataDir);
  let remote;
  try { remote = JSON.parse((await getBuf(base + "/app-manifest.json", 2 * 1024 * 1024)).toString("utf8")); }
  catch (e) { return { status: "offline", error: String((e && e.message) || e) }; }
  if (!remote || typeof remote !== "object" || typeof remote.files !== "object" || typeof remote.built !== "number") return { status: "error", error: "The site's app-manifest.json is not valid." };
  if (remote.appApi > APP_API) return { status: "incompatible", version: remote.version };
  if (remote.built <= current.built) return { status: "none", version: current.version, built: current.built };

  // The new files must be in the data folder if they differ from the ones built into the app.
  const curOverlay = path.join(dataDir, "current"), tmp = path.join(dataDir, "tmp-" + remote.built);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const [name, meta] of Object.entries(remote.files)) {
      if (!SAFE.test(name) || name === "app-manifest.json" || !meta || !/^[0-9a-f]{64}$/.test(meta.sha256)) continue;
      if (bundled.files[name] && bundled.files[name].sha256 === meta.sha256) continue;     // the built-in copy is already right
      let data = null;
      const old = path.join(curOverlay, name);
      if (fs.existsSync(old)) { const d = fs.readFileSync(old); if (sha(d) === meta.sha256) data = d; }
      if (!data) { data = await getBuf(base + "/" + encodeURIComponent(name), MAX_FILE); if (sha(data) !== meta.sha256) throw new Error("the downloaded " + name + " does not match its hash; refusing to use it"); }
      fs.writeFileSync(path.join(tmp, name), data);
    }
    fs.writeFileSync(path.join(tmp, "app-manifest.json"), JSON.stringify(remote));
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { status: /HTTP|fetch|network|timeout|abort/i.test(String(e && e.message)) ? "offline" : "error", error: String((e && e.message) || e) };
  }
  const names = new Set([...Object.keys(current.files), ...Object.keys(remote.files)]);
  const differs = [...names].some((n) => (current.files[n] || {}).sha256 !== (remote.files[n] || {}).sha256);
  fs.rmSync(path.join(dataDir, "previous"), { recursive: true, force: true });
  if (fs.existsSync(curOverlay)) fs.renameSync(curOverlay, path.join(dataDir, "previous"));
  fs.renameSync(tmp, curOverlay);
  return { status: differs ? "ready" : "none", version: remote.version, built: remote.built };
}
// Throws away the downloaded copy (when it turned out not to load) so the built-in copy is used.
function dropOverlay(dataDir) {
  const cur = path.join(dataDir, "current"), bad = path.join(dataDir, "bad");
  fs.rmSync(bad, { recursive: true, force: true });
  if (fs.existsSync(cur)) fs.renameSync(cur, bad);
}
module.exports = { checkForUpdate, effective, dropOverlay, APP_API };
