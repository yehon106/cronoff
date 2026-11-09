/* Cronoff (made by yehon106) service worker: offline support + COOP/COEP headers (needed for SharedArrayBuffer) */
const APP_CACHE = "cronoff-app-v8";
const PYO_VERSION = "0.26.4";   // pinned: same as PYODIDE in local-server/get-vendor.js and PYODIDE_VERSION in index.html
// New cache names on purpose: they drop any broken Pyodide copy an older worker may have saved.
const PYO_CACHE = "cronoff-pyodide-" + PYO_VERSION + "-v2";
const LIB_CACHE = "cronoff-libs-v1";
// The runtimes served from this site (filled in at deploy time by local-server/get-vendor.js). Bump the v-number when their versions change.
const VENDOR_CACHE = "cronoff-vendor-v2";
const VENDOR_CORE = ["/vendor/pyodide/pyodide.js", "/vendor/pyodide/pyodide.asm.js", "/vendor/pyodide/pyodide.asm.wasm", "/vendor/pyodide/python_stdlib.zip", "/vendor/pyodide/pyodide-lock.json",
  "/vendor/sqljs/sql-wasm.js", "/vendor/sqljs/sql-wasm.wasm", "/vendor/wasmoon/index.js", "/vendor/wasmoon/glue.wasm"];
const CDN_ORIGIN = "https://jsdelivr.net";

// תוקן: נתיב ה-CDN המדויק ב-jsDelivr ללא ה-v המיותרת
const PYO_PATH = "/pyodide/" + PYO_VERSION + "/full/";
const PYO_BASE = CDN_ORIGIN + PYO_PATH;

// Other languages. Keep these versions in sync with SQL_BASE / LUA_BASE in index.html.
// Ruby (ruby+stdlib.wasm, about 30 MB) is not pre-cached: it is saved the first time Ruby is used.
const LIB_PATHS = ["/npm/sql.js@1.14.2/dist/", "/npm/wasmoon@1.16.0/dist/", "/npm/@ruby/3.4-wasm-wasi@2.8.1/dist/"];
const LIBS = [
  CDN_ORIGIN + "/npm/sql.js@1.14.2/dist/sql-wasm.js",
  CDN_ORIGIN + "/npm/sql.js@1.14.2/dist/sql-wasm.wasm",
  CDN_ORIGIN + "/npm/wasmoon@1.16.0/dist/index.js",
  CDN_ORIGIN + "/npm/wasmoon@1.16.0/dist/glue.wasm",
  CDN_ORIGIN + "/npm/@ruby/3.4-wasm-wasi@2.8.1/dist/browser.umd.js",
];

const CORE = [
  "pyodide.js",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
].map((f) => PYO_BASE + f);

const OPTIONAL = ["/index.html", "/manifest.json", "/jscpp.js", "/ts.js", "/scheme.js", "/prolog.js", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/about.html", "/python-runner.html"];

// תוקן: החרגה מוחלטת של קובצי הליבה של פאיודיד על מנת שלא ייפסלו בבדיקות ה-Content-Type המחמירות
function good(res, url) {
  if (!res || res.status !== 200) return false;
  
  if (url.includes("pyodide") || url.includes("python_stdlib")) {
    return true;
  }
  
  if (res.type === "opaque") return false;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.indexOf("text/html") >= 0 && !/\.html?$|\/$/.test(new URL(url).pathname)) return false;
  if (/\.wasm$/.test(new URL(url).pathname) && ct && ct.indexOf("wasm") < 0 && ct.indexOf("octet-stream") < 0) return false;
  return true;
}

// תוקן מן היסוד: שימוש בשיטה בטוחה להזרקת כותרות אבטחה (COOP/COEP) ללא שכפול או פתיחה של res.body 
// פתרון זה מונע לחלוטין את נעילת או ריקון ה-Stream של קובץ ה-ZIP של ה-Standard Library.
function isolate(res) {
  if (!res || res.status === 0 || res.type === "opaque") return res;
  
  // אם מדובר בקובץ ZIP או קובץ בינארי כבד אחר של פאיודיד, נחזיר אותו כפי שהוא מהרשת/Cache ללא שינוי מבני של הגוף
  if (res.url && (res.url.includes("python_stdlib") || res.url.endsWith(".zip") || res.url.endsWith(".tar"))) {
    return res;
  }

  const h = new Headers(res.headers);
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Resource-Policy", "cross-origin");

  // טיפול ממוקד אך ורק בקובצי WASM (דרישה קשיחה של דפדפנים מודרניים תחת בידוד)
  if (res.url && /\.wasm(\?|$)/.test(res.url)) {
    h.delete("content-encoding");
    h.delete("content-length");
    const ct = (h.get("content-type") || "").toLowerCase();
    if (ct.indexOf("wasm") < 0) h.set("Content-Type", "application/wasm");
  }

  try {
    // החזרת התגובה תוך שימוש ב-Stream המקורי בצורה בטוחה
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: h
    });
  } catch (err) {
    return res;
  }
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    (async () => {
      const vendor = await caches.open(VENDOR_CACHE);
      await Promise.allSettled(
        VENDOR_CORE.map(async (u) => {
          if (await vendor.match(u)) return;
          const r = await fetch(u, { cache: "reload" });
          if (good(r, u)) await vendor.put(u, r);
        })
      );
      
      // תוקן: בדיקת פריט ספציפי (האלמנט הראשון) מתוך המערך במקום העברת אובייקט המערך כולו
      const hasLocalWasm = await vendor.match(VENDOR_CORE[0]);
      if (!hasLocalWasm) {
        const pyo = await caches.open(PYO_CACHE);
        await Promise.allSettled(
          CORE.map(async (u) => {
            if (await pyo.match(u)) return;
            const r = await fetch(u, { mode: "cors", credentials: "omit" });
            if (good(r, u)) await pyo.put(u, r);
          })
        );
      }
      
      const lib = await caches.open(LIB_CACHE);
      await Promise.allSettled(
        LIBS.map(async (u) => {
          if (await lib.match(u)) return;
          const hasLocalLibs = await vendor.match(VENDOR_CORE[0]);
          if (hasLocalLibs && /sql\.js|wasmoon/.test(u)) return;
          const r = await fetch(u, { mode: "cors", credentials: "omit" });
          if (good(r, u)) await lib.put(u, r);
        })
      );
      const app = await caches.open(APP_CACHE);
      await Promise.allSettled([new Request("/", { cache: "reload" })].concat(OPTIONAL.map((u) => new Request(u, { cache: "reload" }))).map((rq) => app.add(rq)));
    })()
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) {
        if (k !== APP_CACHE && k !== PYO_CACHE && k !== LIB_CACHE && k !== VENDOR_CACHE) await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return isolate(res);
  } catch (err) {
    const hit =
      (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === "navigate" ? await cache.match("/") : undefined);
    if (hit) return isolate(hit);
    return new Response("Offline and not cached yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function cdnCacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req.url);
  if (hit && good(hit, req.url)) return isolate(hit);
  if (hit) await cache.delete(req.url);
  const res = await fetch(req.url, { mode: "cors", credentials: "omit" });
  if (good(res, req.url)) cache.put(req.url, res.clone());
  return isolate(res);
}

async function vendorCacheFirst(req) {
  const cache = await caches.open(VENDOR_CACHE);
  const hit = await cache.match(req.url);
  if (hit && good(hit, req.url)) return isolate(hit);
  if (hit) await cache.delete(req.url);
  const res = await fetch(req);
  if (good(res, req.url)) cache.put(req.url, res.clone());
  return isolate(res);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.searchParams.has("nosw")) return;
  if (url.origin === self.location.origin) {
    if (url.pathname === "/sw.js" || url.pathname.startsWith("/_vercel") || url.pathname.startsWith("/api/")) return;
    e.respondWith(url.pathname.startsWith("/vendor/") ? vendorCacheFirst(req) : networkFirst(req));
  } else if (url.origin === CDN_ORIGIN && url.pathname.startsWith(PYO_PATH)) {
    e.respondWith(cdnCacheFirst(PYO_CACHE, req));
  } else if (url.origin === CDN_ORIGIN && LIB_PATHS.some((p) => url.pathname.startsWith(p))) {
    e.respondWith(cdnCacheFirst(LIB_CACHE, req));
  }
});
