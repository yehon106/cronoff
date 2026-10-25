# Cronoff as a real app (Windows, Mac, Linux) - by yehon106

The "Get the app" button on the site offers real downloads. The app is not a shortcut to the website: it has its own window and icon,
**everything is inside it** (the site, Python, SQL, Lua, Ruby), it needs **no internet**, and it runs Java, C#, Go, Rust and Kotlin on your computer
when those are installed. GitHub builds the apps for you, so you do not need Windows, a Mac or any tools.

## Build the apps (15 minutes, mostly waiting)

1. Do `START-HERE.md` first (the workflow file and the upload).
2. Open `desktop/app-config.json` in GitHub (pencil icon) and put your real site address: `{ "siteUrl": "https://YOUR-SITE.vercel.app" }` (https only). Commit.
3. **Actions**, **Cronoff tasks**, **Run workflow**, choose `build-desktop-apps`, keep the name `app-v1`, press the green button.
4. Wait until the windows, macos, ubuntu and **release** jobs have green ticks.
5. Your repo's front page now has a **Release** (right side) with three files: `Cronoff-Setup.exe`, `Cronoff-Mac.dmg`, `Cronoff-Linux.AppImage`.

If a job fails, open the red step and send me the last 20 lines.

The **Get the app** button on your site links to those files by itself (it finds the newest release).

- **Windows:** run `Cronoff-Setup.exe`. Windows says "Windows protected your PC" because the app is not code-signed: **More info**, then **Run anyway**.
- **Mac:** open the `.dmg`, drag Cronoff to Applications. First time: right-click Cronoff, **Open**, **Open**.
- **Linux:** make the file executable (`chmod +x Cronoff-Linux.AppImage`), then double-click.

Code signing (so those warnings disappear) costs about 100 to 300 dollars a year and is not needed for the app to work.

## Updates: the app keeps itself up to date

Every deploy of your site publishes `/app-manifest.json` (a list of the website's files with hashes; `vercel.json` makes it). A few seconds after it starts, and every 6 hours, the app reads it:

- If the site changed, the app downloads **only the files that changed**, checks each hash, and keeps them in its own data folder. Then it asks **Restart now / Later**. Your tabs are saved automatically.
- Not online, site down, or a file does not match its hash? Nothing happens; the app keeps what it has. A new copy that fails to load is thrown away on the next start and the built-in copy is used.
- Help, **Check for updates...** does it right away. Help, **Diagnostics...** shows the app version, the website version inside it, whether the Python files are there, and which languages your PC has (with a Copy button).
- You only rebuild the installers when the app itself changed ("a newer app is needed" appears in the app if that is the case). Python, SQL, Lua and Ruby inside the app change only with a rebuild.
- Your tabs and settings are kept between starts because the app always uses the same address (`localhost:47321`). If something else uses that port it picks the next free one, and then the tabs of the other port are not shown.

## Privacy

The app sends nothing about you anywhere. The only thing it does online is ask your own site "is there something newer?" (step 2 address).

## Phones

- **Android:** open your site in Chrome, menu, **Install app**. Android turns it into a real app. The "Get the app" button explains it.
- **iPhone / iPad:** Share, **Add to Home Screen**. (A real iPhone app needs an Apple developer account and the App Store.)

## Honest limits

- I tested the app on Linux (built the real installer, ran it, ran Python, Java and HTML in it, and the self-update). The Windows and Mac builds use the same code on GitHub's machines, but I could not run them, so tell me if either misbehaves.
- The app only ever shows Cronoff. Links to other websites open in your normal browser. The page inside cannot touch your files or Node.js.
- Log in and saved tabs belong to the online site; they are off in the app.
