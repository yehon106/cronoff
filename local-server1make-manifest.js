#!/usr/bin/env node
// Writes app-manifest.json: a list of the website's files with their SHA-256 hashes and a version.
// The desktop app reads it from your site to find out whether there is something new, then downloads only the files that changed.
// Runs at every Vercel deploy (see vercel.json) and when the desktop app is built. (made by yehon106)
//   node local-server/make-manifest.js [--root DIR] [--out FILE] [--soft]
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { listSiteFiles } = require("./site-files.js");

const APP_API = 1;   // raise this when a change needs a newer desktop app (the app then asks you to install a new version instead of updating itself)
function makeManifest(root) {
  const files = {};
  for (const name of listSiteFiles(root)) {
    const data = fs.readFileSync(path.join(root, name));
    files[name] = { sha256: crypto.createHash("sha256").update(data).digest("hex"), size: data.length };
  }
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "").slice(0, 7);
  return { version: sha || "dev", built: Date.now(), appApi: APP_API, files };
}
module.exports = { makeManifest, APP_API };

if (require.main === module) {
  const a = process.argv.slice(2), val = (n, d) => { const i = a.indexOf("--" + n); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
  const root = path.resolve(val("root", path.join(__dirname, ".."))), out = path.resolve(val("out", path.join(root, "app-manifest.json")));
  try {
    const m = makeManifest(root);
    fs.writeFileSync(out, JSON.stringify(m));
    console.log("app-manifest.json: " + Object.keys(m.files).length + " files, version " + m.version);
  } catch (e) {
    console.error("Could not write app-manifest.json: " + ((e && e.message) || e));
    process.exit(a.includes("--soft") ? 0 : 1);
  }
}
