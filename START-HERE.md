# Cronoff: how to put it on GitHub with NO folders (by yehon106)

Everything in the zip is a **plain file, no folders**. A file whose name starts with `api1`, `desktop1` or `local-server1` belongs in a folder, and the digit **1** stands for the `/`:
`api1auth.js` becomes `api/auth.js`, `desktop1main.js` becomes `desktop/main.js`, `desktop1scripts1prepare-site.js` becomes `desktop/scripts/prepare-site.js`. You never make a folder: a small workflow (below) moves them for you.

## Once: create the workflow file (3 minutes)

1. Your GitHub repo, **Add file**, **Create new file**.
2. In the name box type exactly: `.github/workflows/cronoff.yml` (typing `/` makes the folders).
3. Open `cronoff-workflow.yml` from the zip in Notepad, copy everything, paste it into the big box.
4. **Commit changes**.

## Every time: upload the files (5 minutes)

1. Unzip the zip. Open the folder, press Ctrl+A to select all files.
2. GitHub repo, **Add file**, **Upload files**. Drag the selected files onto the page. Wait until the list is complete, then **Commit changes**.
   (If it says a file already exists, that is fine: it is replaced.)
3. Wait about a minute. **Actions** tab: a run called **Cronoff tasks** moves the files into their folders and makes a second commit ("Move uploaded files into their folders").
   Your repo then has the folders `api`, `desktop` and `local-server`, and Vercel deploys by itself.
   The same run also deletes the old monitor site and anything else that is no longer used.

Do this first, before the zip: if you still have `.github/workflows/desktop.yml` and `.github/workflows/vendor.yml` from before, open each one and press the trash icon, then Commit. The new file replaces them.

## One time more: make Python always load (2 minutes)

**Actions** tab, **Cronoff tasks** on the left, **Run workflow**, choose `fetch-language-files`, press the green button. After a minute a commit "Add language runtime files" appears.
Open `https://YOUR-SITE/vendor/pyodide/pyodide.asm.wasm`: it should start downloading. See `SETUP-RUNTIMES.md`.

## Optional: the desktop apps

First open `desktop/app-config.json` in GitHub (pencil icon) and put your real site address in it, for example `{ "siteUrl": "https://pyro.vercel.app" }`.
Then **Actions**, **Cronoff tasks**, **Run workflow**, choose `build-desktop-apps`. See `SETUP-DESKTOP-APP.md`.

## Using something other than 1 for the "/"

The digit 1 stands for the `/` in file names (`api1auth.js` becomes `api/auth.js`). `arrange-files.js` (in the zip, loose in the root) does the moving. To use another character:
1. On your computer, in the folder with the unzipped files, run: `node arrange-files.js --rename-from 1 --rename-to --`  (that makes `api--auth.js`; use `__` or `~` instead of `--` if you like).
   Add `--dry` to only look. It needs Node.js (https://nodejs.org). No Node? Tell me the separator you want and I will give you a zip with the names already changed.
2. In GitHub open `.github/workflows/cronoff.yml`, pencil icon, and change the line `SEPARATOR: "1"` to `SEPARATOR: "--"`. Commit.
3. Upload the renamed files as usual.

Already uploaded loose files with another separator? Actions, **Cronoff tasks**, **Run workflow**, task `arrange-files`, type the separator in the box, run. It moves them now.

Allowed separators: 1 to 4 characters from letters, digits and `_ . ~ + = -`, and it must not appear inside any of the file names that go into folders. `1`, `__`, `--`, `~`, `+`, `=` all work. A single `-` or `_` does not (the script tells you why and moves nothing).

## Why there are still two folders you never touch

Vercel only runs server code (log in, saved tabs, Google) from a folder named `api`, and GitHub only runs workflows from `.github/workflows`.
Those two cannot be removed; that is why the workflow file is created by typing its path once, and everything else is moved for you.

## What each file is

- `arrange-files.js`: the script that turns the 1 into a `/` and moves the files (the workflow runs it; you can run it too).
- `index.html`, `about.html`, `python-runner.html`, `sw.js`, `manifest.json`, `vercel.json`, icons, `jscpp.js`, `ts.js`, `scheme.js`, `prolog.js`: the website.
- `api1*.js`: log in, Google log in, saved tabs, the code server for Java and others, the search sitemap.
- `local-server1*.js`: Cronoff on your own PC (`SETUP-LOCAL-PC.md`) and the language file downloader.
- `desktop1*`: the desktop app (`SETUP-DESKTOP-APP.md`).
- `START-CRONOFF.bat`, `start-cronoff.sh`: start Cronoff on your own PC.
