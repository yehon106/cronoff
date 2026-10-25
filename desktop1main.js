// Cronoff desktop app (made by yehon106). A real window around Cronoff with everything inside:
// the website, the Python / SQL / Lua / Ruby runtimes, and a small server on this computer that runs Java, C#, Go, Rust and Kotlin
// with the compilers you have installed. Nothing is downloaded when you start it, and it needs no internet.
// It keeps its copy of the website up to date (see updater.js). It sends nothing about you anywhere.
"use strict";
const { app, BrowserWindow, Menu, shell, dialog, session, clipboard } = require("electron");
const path = require("path"), fs = require("fs");
const updater = require("./updater.js");

app.setName("Cronoff");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const cfg = readJson(path.join(__dirname, "app-config.json")) || {};
const SITE_URL = String(process.env.CRONOFF_SITE_URL || cfg.siteUrl || "").replace(/\/+$/, "");
const TEST = process.env.CRONOFF_TEST === "1";                 // only for automatic tests: allows an http://localhost update server and restarts without asking
const bundledDir = path.join(__dirname, "site");
let win = null, local = null, dataDir = "", userDir = "", timer = null;

const stateFile = () => path.join(userDir, "window.json");
function loadState() { return readJson(stateFile()) || {}; }
function saveState() {
  if (!win || win.isDestroyed()) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() })); } catch {}
}
const when = (ms) => (ms ? new Date(ms).toLocaleString() : "built into the app");

async function createWindow(overlayDir) {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1280, height: st.height || 820, x: st.x, y: st.y, minWidth: 760, minHeight: 480,
    backgroundColor: "#14171c", title: "Cronoff", autoHideMenuBar: false,
    icon: path.join(bundledDir, "icon-512.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.js"), spellcheck: false },
  });
  if (st.max) win.maximize();
  const origin = new URL(local.url).origin;
  // Links to other websites open in the normal browser; the app window only ever shows Cronoff.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (new URL(url).origin !== origin) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  win.on("page-title-updated", (e) => e.preventDefault());     // keep the title "Cronoff"
  win.on("close", saveState);
  win.on("closed", () => { win = null; });
  // An update that does not even load is thrown away, and the built-in copy is used from then on.
  const bootFlag = path.join(dataDir, "booting");
  if (overlayDir) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(bootFlag, String(Date.now())); }
  win.webContents.on("did-fail-load", (_e, code, desc, _url, isMain) => {
    if (code === -3 || isMain === false) return;
    if (overlayDir) { try { updater.dropOverlay(dataDir); fs.rmSync(bootFlag, { force: true }); } catch {} app.relaunch(); app.exit(0); return; }
    dialog.showErrorBox("Cronoff", "The window could not load (" + desc + ").");
  });
  win.webContents.once("did-finish-load", () => { try { fs.rmSync(bootFlag, { force: true }); } catch {} });
  await win.loadURL(local.url + "/index.html");
}

// ---- updates ----
function restart() { app.relaunch(); app.exit(0); }
async function runCheck(manual) {
  const box = (type, message, detail) => (manual && win ? dialog.showMessageBox(win, { type, buttons: ["OK"], title: "Cronoff", message, detail }) : null);
  const r = await updater.checkForUpdate({ siteUrl: SITE_URL, bundledDir, dataDir, allowLocalHttp: TEST });
  if (r.status === "ready") {
    if (TEST && process.env.CRONOFF_AUTO_RESTART === "1") return restart();
    if (!win) return;
    const c = await dialog.showMessageBox(win, { type: "info", buttons: ["Restart now", "Later"], defaultId: 0, cancelId: 1, title: "Cronoff update", message: "A new version of Cronoff is ready.", detail: "Restart the app to use it. Your tabs are saved automatically." });
    if (c.response === 0) restart();
  } else if (r.status === "none") await box("info", "You have the newest version.", "Website version " + (r.version || "") + ", " + when(r.built));
  else if (r.status === "incompatible") await box("warning", "A newer app is needed.", "This update needs a newer Cronoff app. Download it from the Get the app button on the website.");
  else if (r.status === "offline") await box("info", "Could not check for updates.", "No connection to " + SITE_URL + ". The app keeps working as it is.");
  else await box("error", "Could not check for updates.", r.error || "");
}

function diagText() {
  const vend = ["pyodide/pyodide.js", "pyodide/pyodide.asm.js", "pyodide/pyodide.asm.wasm", "pyodide/python_stdlib.zip", "pyodide/pyodide-lock.json", "sqljs/sql-wasm.wasm", "wasmoon/glue.wasm", "ruby/ruby+stdlib.wasm"]
    .map((f) => { try { return "  ok       " + (fs.statSync(path.join(bundledDir, "vendor", f)).size / 1048576).toFixed(1).padStart(5) + " MB  " + f; } catch { return "  MISSING          " + f; } });
  const eff = updater.effective(bundledDir, dataDir), av = local.available || {};
  return [
    "Cronoff app " + app.getVersion() + " (" + process.platform + " " + process.arch + ")",
    "Website files: " + (eff.overlayDir ? "updated copy " : "built-in copy ") + (eff.current.version || "") + ", " + when(eff.current.built),
    "Updates come from: " + (SITE_URL || "(not set)"),
    "Local server: " + local.url,
    "",
    "Python, SQL, Lua, Ruby files inside this app:", ...vend,
    "",
    "Languages found on this computer: " + (Object.keys(av).map((k) => k + (av[k] ? " yes" : " no")).join(", ") || "-"),
    "Data folder: " + userDir,
    "Electron " + process.versions.electron + ", Chrome " + process.versions.chrome,
  ].join("\n");
}
function diagnostics() {
  const text = diagText();
  dialog.showMessageBox(win, { type: "info", buttons: ["Copy to clipboard", "Close"], defaultId: 1, cancelId: 1, title: "Cronoff diagnostics", message: "Cronoff diagnostics", detail: text }).then((c) => { if (c.response === 0) clipboard.writeText(text); });
}

function buildMenu() {
  const mac = process.platform === "darwin";
  const about = () => {
    const w = new BrowserWindow({ width: 820, height: 760, title: "About Cronoff", backgroundColor: "#14171c", webPreferences: { contextIsolation: true, sandbox: true } });
    w.setMenu(null); w.loadURL(local.url + "/about.html");
    w.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  };
  const template = [
    ...(mac ? [{ role: "appMenu" }] : [{ label: "File", submenu: [{ role: "quit" }] }]),
    { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, { role: "toggleDevTools" }] },
    { role: "windowMenu" },
    { role: "help", submenu: [
      { label: "Check for updates...", click: () => runCheck(true) },
      { label: "Diagnostics...", click: diagnostics },
      { type: "separator" },
      { label: "About Cronoff", click: about },
      { label: "Cronoff on GitHub", click: () => shell.openExternal("https://github.com/yehon106/py") },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    userDir = app.getPath("userData");
    dataDir = path.join(userDir, "site-updates");
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "fullscreen" || permission === "clipboard-sanitized-write"));   // nothing else (camera, location...) is ever allowed
    // a copy of the website that crashed the last start is dropped
    if (fs.existsSync(path.join(dataDir, "booting"))) { try { updater.dropOverlay(dataDir); fs.rmSync(path.join(dataDir, "booting"), { force: true }); } catch {} }
    const eff = updater.effective(bundledDir, dataDir);
    try {
      // the program that runs Java, C#, Go, Rust and Kotlin, and serves the site; this computer only. The same port every time (47321, or the next free one),
      // because your saved tabs and settings belong to the page's address, port included.
      local = await require("./server/cronoff-server.js").start({ root: bundledDir, overlay: eff.overlayDir, ports: Array.from({ length: 20 }, (_, i) => 47321 + i), vendor: false, });
    } catch (e) {
      dialog.showErrorBox("Cronoff could not start", String((e && e.message) || e));
      app.quit();
      return;
    }
    buildMenu();
    await createWindow(eff.overlayDir);
    if (!fs.existsSync(path.join(bundledDir, "vendor", "pyodide", "pyodide.asm.wasm"))) {
      dialog.showMessageBox(win, { type: "warning", buttons: ["OK"], title: "Cronoff", message: "The Python files are missing from this build.", detail: "Python will only work with internet. Rebuild the app (see SETUP-DESKTOP-APP.md). Help, Diagnostics lists what is inside." });
    }
    if (TEST && process.env.CRONOFF_TEST_DIAG === "1") { try { fs.writeFileSync(path.join(userDir, "diag.txt"), diagText()); } catch {} }
    app.on("activate", () => { if (!win) createWindow(null); });
    if (SITE_URL) { setTimeout(() => runCheck(false), TEST ? 6000 : 8000); timer = setInterval(() => runCheck(false), 6 * 3600 * 1000); }
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", () => { saveState(); clearInterval(timer); try { local && local.server.close(); } catch {} });
}
