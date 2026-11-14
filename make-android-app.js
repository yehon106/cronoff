#!/usr/bin/env node
// Cronoff: makes the Android app project in the folder android-build, with the whole website (Python, SQL, Lua, Ruby too) inside,
// so the finished app needs NO internet. The workflow (cronoff.yml, task build-desktop-apps) runs this and then builds the .apk.
// You never run or edit this file yourself. (made by yehon106)
"use strict";
const fs = require("fs"), path = require("path");
const root = __dirname, out = path.join(root, "android-build");
const app = path.join(out, "app", "src", "main");
const write = (rel, text) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/^\n/, "")); };
const versionCode = Math.max(1, parseInt(process.env.GITHUB_RUN_NUMBER || "1", 10) || 1);   // grows with every build, so a new apk installs over the old one

fs.rmSync(out, { recursive: true, force: true });

write("settings.gradle", String.raw`
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "Cronoff"
include ":app"
`);

write("build.gradle", String.raw`
plugins {
    id 'com.android.application' version '8.5.2' apply false
}
`);

write("gradle.properties", String.raw`
org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8
android.nonTransitiveRClass=true
`);

write("app/build.gradle", String.raw`
plugins {
    id 'com.android.application'
}

android {
    namespace 'com.yehon106.cronoff'
    compileSdk 34

    defaultConfig {
        applicationId 'com.yehon106.cronoff'
        minSdk 24
        targetSdk 34
        versionCode ` + versionCode + String.raw`
        versionName '1.0'
    }

    signingConfigs {
        release {
            storeFile file(System.getProperty('user.home') + '/.android/cronoff.keystore')
            storePassword 'android'
            keyAlias 'cronoff'
            keyPassword 'android'
        }
    }

    buildTypes {
        release {
            minifyEnabled false
            signingConfig signingConfigs.release
        }
    }

    lint {
        abortOnError false
        checkReleaseBuilds false
    }
}
`);

write("app/src/main/AndroidManifest.xml", String.raw`
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:label="Cronoff"
        android:icon="@mipmap/ic_launcher"
        android:allowBackup="false"
        android:usesCleartextTraffic="false"
        android:theme="@style/AppTheme">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboard|keyboardHidden|uiMode|density">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`);

write("app/src/main/res/values/styles.xml", String.raw`
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="android:Theme.Material.NoActionBar">
        <item name="android:windowBackground">#14171C</item>
        <item name="android:statusBarColor">#14171C</item>
        <item name="android:navigationBarColor">#14171C</item>
    </style>
</resources>
`);

write("app/src/main/java/com/yehon106/cronoff/MainActivity.java", String.raw`
package com.yehon106.cronoff;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

// Cronoff for Android (made by yehon106): a window around the Cronoff website that is stored inside this app.
// The site is served from the app's own files at https://appassets.androidplatform.net/ with the two headers that
// let Python run (cross-origin isolation), so no internet is needed.
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " CronoffAndroid/1.0");

        web.addJavascriptInterface(new Bridge(), "cronoffAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse r = serve(request.getUrl());
                return r != null ? r : super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));    // other websites open in the normal browser
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        // The service worker (sw.js) fetches the site's files too: give it the same answers.
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                return serve(request.getUrl());
            }
        });

        web.loadUrl("https://" + HOST + "/");
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);        // keep running programs alive instead of closing
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    // ---------- the website, from the files inside the app ----------
    private Map<String, String> headers() {
        Map<String, String> h = new HashMap<>();
        h.put("Cross-Origin-Opener-Policy", "same-origin");
        h.put("Cross-Origin-Embedder-Policy", "require-corp");
        h.put("Cross-Origin-Resource-Policy", "cross-origin");
        h.put("Cache-Control", "no-cache");
        return h;
    }

    private static String mimeFor(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        int dot = n.lastIndexOf('.');
        String ext = dot >= 0 ? n.substring(dot + 1) : "";
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "json": case "webmanifest": return "application/json";
            case "wasm": return "application/wasm";
            case "css": return "text/css";
            case "png": return "image/png";
            case "svg": return "image/svg+xml";
            case "ico": return "image/x-icon";
            case "zip": return "application/zip";
            case "txt": case "md": return "text/plain";
            default:
                String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                return m != null ? m : "application/octet-stream";
        }
    }

    private WebResourceResponse reply(String mime, InputStream body, int code, String reason) {
        boolean text = mime.startsWith("text/") || mime.contains("json") || mime.contains("javascript");
        return new WebResourceResponse(mime, text ? "UTF-8" : null, code, reason, headers(), body);
    }

    private WebResourceResponse serve(Uri uri) {
        if (uri == null || !HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.length() <= 1) path = "/index.html";
        String rel = path.substring(1);
        if (rel.contains("..")) return reply("text/plain", new ByteArrayInputStream(new byte[0]), 404, "Not Found");
        try {
            return reply(mimeFor(rel), getAssets().open("site/" + rel), 200, "OK");
        } catch (IOException e) {
            return reply("text/plain", new ByteArrayInputStream(new byte[0]), 404, "Not Found");   // for example /api/... (the online account service is not part of the app)
        }
    }

    // ---------- the Download button: saves the file into the Downloads folder ----------
    private class Bridge {
        @JavascriptInterface
        public void save(String name, String mime, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                if (data.length > 20 * 1024 * 1024) throw new IOException("too big");
                StringBuilder sb = new StringBuilder();
                String raw = name == null ? "" : name;
                for (int i = 0; i < raw.length(); i++) {
                    char c = raw.charAt(i);
                    sb.append(c < 32 || "\\/:*?\"<>|".indexOf(c) >= 0 ? '_' : c);
                }
                String safe = sb.toString().trim();
                if (safe.isEmpty() || safe.startsWith(".")) safe = "cronoff-" + safe;
                String type = (mime == null || mime.isEmpty()) ? "text/plain" : mime;
                String where;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, type);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) throw new IOException("no file");
                    OutputStream os = getContentResolver().openOutputStream(u);
                    if (os == null) throw new IOException("no stream");
                    try { os.write(data); } finally { os.close(); }
                    where = "Downloads";
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new IOException("no folder");
                    dir.mkdirs();
                    FileOutputStream os = new FileOutputStream(new File(dir, safe));
                    try { os.write(data); } finally { os.close(); }
                    where = dir.getAbsolutePath();
                }
                toast("Saved " + safe + " in " + where);
            } catch (Exception e) {
                toast("Could not save the file");
            }
        }
    }

    private void toast(final String text) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() { Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show(); }
        });
    }
}
`);

// ---------- the website itself goes inside the app ----------
const site = path.join(app, "assets", "site");
fs.mkdirSync(site, { recursive: true });
const { listSiteFiles } = require(path.join(root, "local-server", "site-files.js"));
for (const name of listSiteFiles(root)) fs.copyFileSync(path.join(root, name), path.join(site, name));
const iconDir = path.join(app, "res", "mipmap-xxxhdpi");
fs.mkdirSync(iconDir, { recursive: true });
fs.copyFileSync(path.join(root, "icon-192.png"), path.join(iconDir, "ic_launcher.png"));

require(path.join(root, "local-server", "get-vendor.js")).ensureVendor({ out: path.join(site, "vendor"), ruby: true }).then((r) => {
  if (r.failed.length) { console.error("Could not download: " + r.failed.map((f) => f.name).join(", ")); process.exit(1); }
  for (const f of ["index.html", "sw.js", "manifest.json", "vendor/pyodide/pyodide.asm.wasm", "vendor/pyodide/pyodide.js", "vendor/pyodide/python_stdlib.zip", "vendor/pyodide/pyodide-lock.json", "vendor/sqljs/sql-wasm.wasm", "vendor/wasmoon/glue.wasm"]) {
    if (!fs.existsSync(path.join(site, f))) { console.error("Missing from the app: " + f); process.exit(1); }   // never build an app without Python
  }
  console.log("Android project ready in android-build (versionCode " + versionCode + ", " + fs.readdirSync(site).length + " items in the site)");
});
