// Which files make up the Cronoff website itself (the ones the desktop app bundles and keeps up to date). (made by yehon106)
"use strict";
const fs = require("fs"), path = require("path");
const SKIP = new Set(["api", "desktop", "local-server", "node_modules", "vendor", "vercel.json", "LICENSE", "app-manifest.json", "package.json", "package-lock.json"]);
// top-level files only: index.html, about.html, sw.js, icons, jscpp.js ...
function listSiteFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isFile() && !SKIP.has(d.name) && !d.name.startsWith(".") && !/\.(md|bat|sh|yml|yaml)$/i.test(d.name) && !/^SETUP/.test(d.name))
    .map((d) => d.name).sort();
}
module.exports = { listSiteFiles, SKIP };
