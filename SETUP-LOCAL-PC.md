# Cronoff on your own PC (by yehon106)

This runs Cronoff on your computer, **and** runs Java, C#, Go, Rust and Kotlin with the compilers you have installed.
Nothing is uploaded, no internet is needed, and there are no limits.
Python, JavaScript, TypeScript, HTML, SQL, Lua, Ruby and C/C++ already run inside the browser, so they need nothing extra.

## 1. Get the files (2 minutes)

On GitHub, open your `py` repository, press the green **Code** button, then **Download ZIP**. Unzip it somewhere (for example your Desktop).

## 2. Install Node.js (3 minutes, once)

Go to https://nodejs.org and install the **LTS** version. That is the only thing the server needs.

## 3. Start it

- **Windows:** double-click `START-CRONOFF.bat`.
- **Mac / Linux:** open a terminal in the folder and run `sh start-cronoff.sh`.

A black window opens and your browser opens Cronoff at `http://localhost:3000`. The window lists which languages are ready:

```
[ok]             Java
[not installed]  Rust  -> Install Rust from https://rustup.rs ...
```

Keep that window open while you use Cronoff. Press Ctrl+C (or close it) to stop. In Cronoff the languages show as "Java (this PC)".
Other port: `START-CRONOFF.bat --port 4000`.

The very first start downloads Python, SQL and Lua once (about 14 MB) and saves them in the `vendor` folder. After that Cronoff needs no internet.

## 4. Install the languages you want (only the ones you need)

| Language | Install | Check in a terminal |
| --- | --- | --- |
| Java | a JDK, for example https://adoptium.net (Java 11 or newer) | `javac -version` |
| C# | .NET SDK, https://dotnet.microsoft.com/download | `dotnet --version` |
| Go | https://go.dev/dl | `go version` |
| Rust | https://rustup.rs | `rustc --version` |
| Kotlin | https://kotlinlang.org/docs/command-line.html (and a JDK) | `kotlinc -version` |

After installing something, close the black window and start again (or just press Run again: it checks again).
Name your Java class `Main`. Press Run; the first C#, Kotlin and Rust runs are slower because they build first.

Limits: a program may run 10 seconds, building may take 90 seconds, output is cut at 64 KB, 2 programs at a time.

## Safety (please read)

The server runs the code you type **as you, on your computer**, like any program you start yourself.
So it only listens on your own computer (127.0.0.1), refuses requests that name another address, and refuses web pages other than itself.
Do not open it to other computers, and do not run code you do not trust.

## Optional: use the online site with your PC's compilers

Normally just open `http://localhost:3000`. If you would rather open your Vercel site and still run Java on your PC:

1. Start with the site's address and a secret word, in one line (use your real address):
   `node local-server/cronoff-server.js --allow https://YOUR-SITE.vercel.app --code my-secret-word`
2. On the online site open the gear menu, type `http://localhost:3000` in **Code server address**.
3. Press Run on a Java tab. It asks for the access code once: type `my-secret-word`.

Chrome, Edge and Firefox allow this. Safari does not, so use `http://localhost:3000` there.
Only the addresses you list with `--allow` can use your server, and only with the secret word.

## Not the same as the Vercel code server

The Vercel code server (`api/run.js`, see SETUP-SERVER.md) is for visitors of your online site. This local server is only for you.
