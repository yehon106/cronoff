# Cronoff

A code runner and editor that runs in your browser, with no sign-up, and keeps working offline. Made by **yehon106**.

Write code, press **Run** (or Ctrl+Enter), see the result. Python, JavaScript, HTML and more run on your own device, so nothing you type is uploaded.

## Languages

| Runs inside your browser (no internet needed after the first visit) | Needs a code server |
| --- | --- |
| Python, JavaScript, TypeScript, HTML, CSS, SQL, Lua, Ruby, C / C++, Scheme, Prolog | Java, C#, Go, Rust, Kotlin |

The code-server languages run on the site's code server, or on **your own computer** with the local server or the desktop app (you need the compiler installed).

## What it does

- **Tabs** with several files. Tabs can **work together**: `import utils` in Python, `import` / `require` in JavaScript and TypeScript, `require` in Lua, and `<link>` / `<script src>` in HTML.
- **Several programs at once**, each with its own output.
- **Red markers** for mistakes before you run (a real syntax check for Python, JavaScript, TypeScript, Lua and Prolog) and the failing line marked after a run.
- **Autocomplete**: suggestions while you type, what is inside `math.` or `console.`, names from your other tabs, HTML tags and attributes, and small patterns for `for`, `if`, `def`. Ctrl+Space opens it.
- **HTML preview** in a sandboxed frame, with `console.log` shown in the output.
- Graphics and sound windows for Python (turtle, pygame-style) and JavaScript (canvas).
- A **complete example game** (Star Dodger) made of seven tabs that import each other, from the gear menu.
- Works **offline** and can be **installed**: as a real app for Windows, Mac and Linux, or added to a phone's home screen.
- **Optional log in** (name and password, or Google) to save your tabs online. Nobody has to log in.
- **No tracking.** Cronoff does not count visits or runs.

## Three ways to use it

| | How | Guide |
| --- | --- | --- |
| The website | Put these files on GitHub, Vercel deploys them | `START-HERE.md` |
| The desktop app | GitHub builds Windows, Mac and Linux installers; the app updates itself | `SETUP-DESKTOP-APP.md` |
| Your own PC | `START-CRONOFF.bat` (Windows) or `sh start-cronoff.sh`; also runs Java, C#, Go, Rust, Kotlin | `SETUP-LOCAL-PC.md` |

## The guides

- `START-HERE.md`: upload the files with no folders, and the one-time workflow.
- `SETUP-RUNTIMES.md`: why Python always loads, and what to do if it does not.
- `SETUP-ACCOUNTS.md`: optional log in and Google log in.
- `SETUP-DESKTOP-APP.md`: build the desktop apps, updates, privacy.
- `SETUP-LOCAL-PC.md`: run Cronoff on your own computer.
- `SETUP-SERVER.md`: the online code server for Java, C# and the others.

## How the repo is laid out

```
index.html, about.html, python-runner.html, sw.js, manifest.json, icons    the website
jscpp.js, ts.js, scheme.js, prolog.js                                      language engines
vercel.json                                                                hosting settings
api/            log in, saved tabs, Google, code server, sitemap           (Vercel runs these)
local-server/   Cronoff on your PC, the language file downloader
desktop/        the desktop app (Electron) and its updater
vendor/         Python, SQL and Lua files, saved here by the "fetch-language-files" task
.github/workflows/cronoff.yml                                              moves uploaded files, fetches language files, builds the apps
```

You do not have to create these folders by hand: see `START-HERE.md`.

## Safety

- The code you run in the browser languages stays on your device.
- The local server and the desktop app run code **as you, on your computer**. They only listen on your own computer and refuse other web pages. Do not run code you do not trust.
- The desktop apps are not code-signed, so Windows and Mac show a warning the first time.

## Credits

Cronoff by yehon106. Python runs with [Pyodide](https://pyodide.org), SQL with [sql.js](https://sql.js.org), Lua with [wasmoon](https://github.com/ceifa/wasmoon), Ruby with [ruby.wasm](https://github.com/ruby/ruby.wasm), C / C++ with [JSCPP](https://github.com/felixhao28/JSCPP), TypeScript types are removed with [sucrase](https://github.com/alangpierce/sucrase), Prolog with [Tau Prolog](http://tau-prolog.org). The desktop app uses [Electron](https://www.electronjs.org).
