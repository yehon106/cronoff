// Gathers everything the app needs into desktop/site (the website) and desktop/server (the program that runs Java etc.),
// including the Python / SQL / Lua / Ruby runtimes, so the finished app needs NO internet. (made by yehon106)
"use strict";
const fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..", ".."), site = path.resolve(__dirname, "..", "site"), server = path.resolve(__dirname, "..", "server");

fs.rmSync(site, { recursive: true, force: true });
fs.rmSync(server, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });
fs.mkdirSync(server, { recursive: true });
const { listSiteFiles } = require(path.join(root, "local-server", "site-files.js"));
for (const name of listSiteFiles(root)) fs.copyFileSync(path.join(root, name), path.join(site, name));
fs.mkdirSync(path.resolve(__dirname, "..", "build"), { recursive: true });
fs.copyFileSync(path.join(root, "icon-512.png"), path.resolve(__dirname, "..", "build", "icon.png"));   // the app icon is the site icon
for (const f of ["cronoff-server.js", "get-vendor.js"]) fs.copyFileSync(path.join(root, "local-server", f), path.join(server, f));

require(path.join(server, "get-vendor.js")).ensureVendor({ out: path.join(site, "vendor"), ruby: true }).then((r) => {
  if (r.failed.length) { console.error("Could not download: " + r.failed.map((f) => f.name).join(", ")); process.exit(1); }
  for (const f of ["index.html", "vendor/pyodide/pyodide.asm.wasm", "vendor/pyodide/pyodide.js", "vendor/pyodide/python_stdlib.zip", "vendor/pyodide/pyodide-lock.json", "vendor/sqljs/sql-wasm.wasm", "vendor/wasmoon/glue.wasm"]) {
    if (!fs.existsSync(path.join(site, f))) { console.error("Missing from the app: " + f); process.exit(1); }     // never build an app without Python
  }
  // what this app was built from, so it can later tell whether the website has something new
  fs.writeFileSync(path.join(site, "app-manifest.json"), JSON.stringify(require(path.join(root, "local-server", "make-manifest.js")).makeManifest(site)));
  console.log("Site ready: " + fs.readdirSync(site).length + " items in desktop/site");
});
