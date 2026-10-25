// Cronoff: optional "Continue with Google" (made by yehon106).
// Standard OAuth 2.0 "authorization code" flow, all on the server. Cronoff asks Google only for your NAME (scopes: openid, profile),
// never your email. The account is keyed by Google's own id for you.
//   GET /api/google              -> sends you to Google
//   GET /api/google?code=&state= -> Google sends you back here; you are logged in and sent to the site
// Environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (and optionally GOOGLE_REDIRECT_URI). See SETUP-ACCOUNTS-AND-STATS.md.
"use strict";
const crypto = require("crypto");
const L = require("./_lib");

const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const OAUTH_COOKIE = "cronoff_oauth";

function redirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || (L.isLocal(req) ? "http" : "https")).split(",")[0].trim();
  return proto + "://" + host + "/api/google";
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return L.send(res, 405, { error: "method" });
  const back = (why) => { res.statusCode = 302; res.setHeader("Location", "/?login=" + why); res.setHeader("Cache-Control", "no-store"); res.end(); };
  if (!L.accountsReady() || !L.googleReady()) return back("off");
  const q = new URL(req.url, "http://x").searchParams;
  const code = q.get("code"), state = q.get("state");
  const secret = process.env.SESSION_SECRET, clientId = process.env.GOOGLE_CLIENT_ID;
  try {
    // ---- step 1: send the person to Google ----
    if (!code && !q.get("error")) {
      if (await L.overLimit("rl:gstart:" + L.clientIp(req), 30, 3600)) return back("failed");
      const s = crypto.randomBytes(16).toString("hex");
      L.addCookie(res, OAUTH_COOKIE + "=" + L.signToken({ s, e: Date.now() + 600000 }, secret) + "; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=600" + (L.isLocal(req) ? "" : "; Secure"));
      const url = new URL(AUTH_URL());
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri(req), response_type: "code", scope: "openid profile", state: s, prompt: "select_account" }).toString();
      res.statusCode = 302; res.setHeader("Location", url.toString()); res.setHeader("Cache-Control", "no-store"); return res.end();
    }

    // ---- step 2: Google sent them back ----
    L.addCookie(res, OAUTH_COOKIE + "=; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=0");
    if (q.get("error") || !code || !state) return back("failed");
    const saved = L.readToken(L.cookies(req)[OAUTH_COOKIE], secret);      // proves this browser started the sign-in (blocks forged callbacks)
    if (!saved || typeof saved.s !== "string") return back("failed");
    const a = Buffer.from(String(state)), b = Buffer.from(saved.s);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return back("failed");

    const r = await fetch(TOKEN_URL(), {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(req), grant_type: "authorization_code" }).toString(),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || typeof j.id_token !== "string") return back("failed");
    // The id_token came straight from Google over HTTPS, so its contents can be trusted after these checks.
    let c; try { c = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString("utf8")); } catch { return back("failed"); }
    if (!c || c.aud !== clientId || !ISSUERS.includes(c.iss) || !(c.exp * 1000 > Date.now()) || !/^\d{5,40}$/.test(String(c.sub))) return back("failed");

    const id = "g_" + c.sub;
    const name = String(c.given_name || c.name || "Google user").replace(/[^\p{L}\p{N} .'_-]/gu, "").trim().slice(0, 30) || "Google user";
    const made = await L.cmd(["SET", "gu:" + id, JSON.stringify({ name, created: Date.now() }), "NX"]);
    L.setSession(req, res, id, name);
    return back("google");
  } catch {
    return back("failed");
  }
};
