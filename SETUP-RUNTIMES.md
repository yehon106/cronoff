# Why "Failed to load Python" cannot happen the same way again - by yehon106

**What was wrong:** Python (and SQL, Lua, Ruby) were downloaded from a public CDN (cdn.jsdelivr.net) the first time you used them. If that CDN is blocked (school or work
networks often do this), down, or you are offline on the first visit, Python could not start, and the page only said "check your connection and reload".

**What changed (now):**
1. The language files are served from **your own site** (`/vendor/...`) and saved on the device. A blocked CDN cannot stop them any more.
   Only extra Python packages (numpy, pandas ...) and Ruby still come from the CDN, and only when you use them.
2. If your site's copy is ever missing, the page uses the CDN copy automatically.
3. If both fail, you now see **why** ("Could not load Python (the files could not be downloaded from any source)"), it **tries again by itself**
   (after 3, 6, 12, 24, 30 seconds), retries the moment the internet comes back, and has a **Try again** button. No page reload needed.
4. The service worker can no longer fail to install because one download failed.
5. The status line now shows the real Python version (3.12.1) and the tooltip data says where it came from.

## How the files get onto your site (nothing to upload by hand)

`vercel.json` now has a build step: every time Vercel deploys, it runs `node local-server/get-vendor.js`, which downloads Pyodide, sql.js and wasmoon from the npm registry,
checks them against npm's published SHA-512 hash, and puts them in `/vendor/`. They are about 14 MB in total.
That is why the files `local-server/get-vendor.js` and `vercel.json` must both be in your repo.

## The sure way: put the files in your repo (2 minutes, once)

Do not depend on the Vercel build step: let GitHub save the files into your repo.
1. Do `START-HERE.md` first (it creates the workflow file).
2. GitHub, **Actions**, **Cronoff tasks**, **Run workflow**, choose `fetch-language-files`, press the green button.
3. After a minute a new commit "Add language runtime files" appears and your repo has a `vendor` folder (14 MB). Vercel deploys it by itself.
Python, SQL and Lua now come from your own site, whatever the network does.

## Check that it worked (2 minutes)

1. After the deploy finishes, open `https://YOUR-SITE/vendor/pyodide/pyodide.asm.wasm` in your browser. It should start downloading a 10 MB file.
   (A "page not found" means the build step did not run: see below.)
2. Open Cronoff with a Python tab. The status says `Python 3.12.1`.

## If /vendor/ is not found

- Vercel, your project, **Settings**, **General**: make sure **Build Command** and **Output Directory** are not overridden to something else
  (leave them empty, `vercel.json` sets them), and **Framework Preset** is **Other**. Then **Deployments**, **Redeploy**.
- Look at the build log for the line `Cronoff: getting the language runtimes`. Lines starting with `ok` are good.
- Even without `/vendor/` Cronoff still works the old way (from the CDN), with the new retry behaviour.

## On your own PC

`START-CRONOFF` downloads the same files the first time you start it (once, 14 MB) and then needs no internet for Python. The desktop app has them built in.
