#!/usr/bin/env node
// Cronoff: moves loose files into their folders, so you never have to upload a folder. (made by yehon106)
//
// A loose file named like   api1auth.js   becomes   api/auth.js.   The SEPARATOR (the digit 1 by default) stands for "/".
//   desktop1scripts1prepare-site.js   ->   desktop/scripts/prepare-site.js
//
//   node arrange-files.js                      move the loose files (separator 1)
//   node arrange-files.js --sep --             the same, with another separator (for example --  or  __  or  ~)
//   node arrange-files.js --dry                only show what would happen
//   node arrange-files.js --rename-from 1 --rename-to --
//                                              rename the loose files you have on your computer from one separator to another
//                                              (do this before uploading, if you want to use a different separator than 1)
//   node arrange-files.js --dir "C:\path\to\the\unzipped\files"      work in another folder
//
// On GitHub this runs by itself after every upload (the workflow file cronoff.yml). The separator is the line  SEPARATOR: "1"  at the top of it.
"use strict";
const fs = require("fs"), path = require("path");

const FOLDERS = ["api", "desktop", "local-server"];                 // the only folders files may be moved into
const OLD = ["monitor", "api/track.js", "SETUP-ACCOUNTS-AND-STATS.md"];   // files from earlier versions that are not used any more
// every name that lives inside those folders: the separator must not appear in any of them, or the names could be split wrongly
const KNOWN = ["_lib.js", "auth.js", "files.js", "google.js", "robots.js", "run.js", "sitemap.js", "main.js", "preload.js", "updater.js", "app-config.json", "package.json", "scripts", "prepare-site.js", "cronoff-server.js", "get-vendor.js", "make-manifest.js", "site-files.js"];

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf("--" + n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : undefined; };
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Returns "" when the separator is fine, otherwise the reason it is not.
function whySeparatorIsBad(sep) {
  if (typeof sep !== "string" || sep.length < 1 || sep.length > 4) return "it must be 1 to 4 characters long";
  if (!/^[A-Za-z0-9_.~+=-]+$/.test(sep)) return "it may only use letters, digits and _ . ~ + = -";
  if (/^\.+$/.test(sep)) return "it cannot be just dots";
  for (const part of [...FOLDERS, ...KNOWN]) if (part.includes(sep)) return "\"" + sep + "\" appears inside the name \"" + part + "\", so the names could be split in the wrong place. Try 1, __, -- or ~";
  return "";
}
const pattern = (sep) => new RegExp("^(" + FOLDERS.map(escRe).join("|") + ")" + escRe(sep) + "(.+)$");
const okPart = (p) => /^[A-Za-z0-9_][A-Za-z0-9._+-]*$/.test(p);

function arrange(dir, sep, dry) {
  let changed = 0;
  for (const old of OLD) {
    const p = path.join(dir, old);
    if (fs.existsSync(p)) { console.log((dry ? "would remove " : "removed ") + old); if (!dry) fs.rmSync(p, { recursive: true, force: true }); changed++; }
  }
  const re = pattern(sep);
  for (const name of fs.readdirSync(dir)) {
    const m = re.exec(name);
    if (!m || !fs.statSync(path.join(dir, name)).isFile()) continue;
    const parts = [m[1], ...m[2].split(sep)];
    if (!parts.every(okPart)) { console.log("left alone: " + name); continue; }
    const dest = path.join(dir, ...parts);
    console.log(name + "  ->  " + parts.join("/"));
    if (!dry) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(path.join(dir, name), dest); }
    changed++;
  }
  return changed;
}
function rename(dir, from, to, dry) {
  let changed = 0;
  const re = pattern(from);
  for (const name of fs.readdirSync(dir)) {
    const m = re.exec(name);
    if (!m || !fs.statSync(path.join(dir, name)).isFile()) continue;
    const next = [m[1], ...m[2].split(from)].join(to);
    console.log(name + "  ->  " + next);
    if (!dry) fs.renameSync(path.join(dir, name), path.join(dir, next));
    changed++;
  }
  return changed;
}

module.exports = { whySeparatorIsBad, arrange, rename, pattern };

if (require.main === module) {
  const dir = path.resolve(opt("dir") || "."), dry = args.includes("--dry");
  const from = opt("rename-from"), to = opt("rename-to");
  const sep = opt("sep") || process.env.SEPARATOR || "1";
  const bad = from !== undefined || to !== undefined ? (whySeparatorIsBad(from) && "--rename-from: " + whySeparatorIsBad(from)) || (whySeparatorIsBad(to) && "--rename-to: " + whySeparatorIsBad(to)) : whySeparatorIsBad(sep);
  if (bad) { console.error("Cannot use that separator: " + bad); process.exit(1); }
  const n = from !== undefined ? rename(dir, from, to, dry) : arrange(dir, sep, dry);
  console.log(n ? (dry ? "(dry run: nothing was changed) " : "") + n + " change" + (n === 1 ? "" : "s") + "." : "Nothing to do.");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "moved=" + (dry ? 0 : n) + "\n");
}
