/* Cronoff (made by yehon106) service worker: offline support + COOP/COEP headers (needed for SharedArrayBuffer) */
const APP_CACHE = "cronoff-app-v3";
const PYO_VERSION = "0.26.4";
// Cache name kept as-is so existing visitors do not re-download Pyodide.
const PYO_CACHE = "pyro-pyodide-" + PYO_VERSION;
const LIB_CACHE = "cronoff-libs-v1";
// The runtimes served from this site (filled in at deploy time by local-server/get-vendor.js). Bump the v-number when their versions change.
const VENDOR_CACHE = "cronoff-vendor-v1";
const VENDOR_CORE = ["/vendor/pyodide/pyodide.js", "/vendor/pyodide/pyodide.asm.js", "/vendor/pyodide/pyodide.asm.wasm", "/vendor/pyodide/python_stdlib.zip", "/vendor/pyodide/pyodide-lock.json",
  "/vendor/sqljs/sql-wasm.js", "/vendor/sqljs/sql-wasm.wasm", "/vendor/wasmoon/index.js", "/vendor/wasmoon/glue.wasm"];
const CDN_ORIGIN = "https://cdn.jsdelivr.net";
const PYO_PATH = "/pyodide/v" + PYO_VERSION + "/full/";
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

// Re-wrap a response with the headers that keep the page cross-origin isolated.
function isolate(res) {
  if (!res || res.status === 0) return res; // opaque / opaqueredirect: cannot be rewrapped
  const h = new Headers(res.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    (async () => {
      // Nothing below may stop the worker from installing: a missing or blocked file is simply fetched when it is first used.
      const vendor = await caches.open(VENDOR_CACHE);
      await Promise.allSettled(
        VENDOR_CORE.map(async (u) => {
          if (await vendor.match(u)) return;
          const r = await fetch(u, { cache: "reload" });
          if (r.ok) await vendor.put(u, r);
        })
      );
      // Only if the copies on this site are not there: keep the public CDN copy of Python for offline use.
      if (!(await vendor.match(VENDOR_CORE[2]))) {
        const pyo = await caches.open(PYO_CACHE);
        await Promise.allSettled(
          CORE.map(async (u) => {
            if (await pyo.match(u)) return;
            const r = await fetch(u, { mode: "cors", credentials: "omit" });
            if (r.ok) await pyo.put(u, r);
          })
        );
      }
      const lib = await caches.open(LIB_CACHE);
      await Promise.allSettled(
        LIBS.map(async (u) => {
          if (await lib.match(u)) return;
          if ((await vendor.match(VENDOR_CORE[6])) && /sql\.js|wasmoon/.test(u)) return;   // already have them from this site
          const r = await fetch(u, { mode: "cors", credentials: "omit" });
          if (r.ok) await lib.put(u, r);
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

// Own files: network first (so GitHub updates show up), cache when offline.
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

// CDN files (Pyodide + packages like numpy, sql.js, wasmoon): cache first, save anything new that gets fetched.
async function cdnCacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req.url);
  if (hit) return isolate(hit);
  const res = await fetch(req.url, { mode: "cors", credentials: "omit" });
  if (res.ok) cache.put(req.url, res.clone());
  return isolate(res);
}

// Runtime files from this site: cache first (they never change for a given version), save what was fetched.
async function vendorCacheFirst(req) {
  const cache = await caches.open(VENDOR_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return isolate(hit);
  const res = await fetch(req);
  if (res.ok) cache.put(req.url, res.clone());
  return isolate(res);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // /api/ is never cached: log in state, saved tabs and counters must always come from the server.
    if (url.pathname === "/sw.js" || url.pathname.startsWith("/_vercel") || url.pathname.startsWith("/api/")) return;
    e.respondWith(url.pathname.startsWith("/vendor/") ? vendorCacheFirst(req) : networkFirst(req));
  } else if (url.origin === CDN_ORIGIN && url.pathname.startsWith(PYO_PATH)) {
    e.respondWith(cdnCacheFirst(PYO_CACHE, req));
  } else if (url.origin === CDN_ORIGIN && LIB_PATHS.some((p) => url.pathname.startsWith(p))) {
    e.respondWith(cdnCacheFirst(LIB_CACHE, req));
  }
});
