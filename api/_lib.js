// Cronoff shared helpers for the accounts / stats API (made by yehon106).
// The leading underscore keeps Vercel from treating this file as an API route.
//
// Storage: a Redis database over HTTP (Upstash, or Vercel's "KV" integration, which is Upstash too).
// Environment variables (Vercel -> Project -> Settings -> Environment Variables):
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (or KV_REST_API_URL / KV_REST_API_TOKEN)
//   SESSION_SECRET   a long random text; needed for log in
"use strict";
const crypto = require("crypto");

// Vercel can add a custom prefix to the database variables (e.g. STORAGE_REST_API_URL), so look for any name that ends the right way.
const envFind = (re) => { for (const k of Object.keys(process.env)) if (re.test(k) && process.env[k]) return process.env[k]; return ""; };
const dbUrl = () => (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || envFind(/(REST_API_URL|REDIS_REST_URL)$/)).replace(/\/$/, "");
const dbToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || envFind(/(REST_API_TOKEN|REDIS_REST_TOKEN)$/);
const dbReady = () => !!(dbUrl() && dbToken());
const accountsReady = () => dbReady() && String(process.env.SESSION_SECRET || "").length >= 16;
// A short reason for the log in button staying hidden (no secrets in it).
const notReadyWhy = () => !dbReady() ? "The database variables are missing (the REST URL and token)." : String(process.env.SESSION_SECRET || "").length < 16 ? "SESSION_SECRET is missing or shorter than 16 characters." : "";

async function call(url, body) {
  const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + dbToken(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error("database answered " + r.status);
  return j;
}
// One command, e.g. cmd(["INCR", "key"])
async function cmd(args) {
  const j = await call(dbUrl(), args);
  if (j.error) throw new Error(j.error);
  return j.result;
}
// Many commands in one round trip. Returns the results in order.
async function pipe(list) {
  const j = await call(dbUrl() + "/pipeline", list);
  return j.map((x) => { if (x && x.error) throw new Error(x.error); return x ? x.result : null; });
}

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(body === undefined ? "" : JSON.stringify(body));
};

async function readBody(req, max = 600000) {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    try { return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body)); } catch { return null; }
  }
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) return null; chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { return null; }
}

const header = (req, k) => { const v = req.headers[k]; return Array.isArray(v) ? v[0] : v || ""; };
const clientIp = (req) => (header(req, "x-forwarded-for").split(",")[0] || (req.socket && req.socket.remoteAddress) || "unknown").trim();
const today = () => new Date().toISOString().slice(0, 10);

// Allow at most `max` hits per `seconds` for this key. Returns true when the limit is passed.
async function overLimit(key, max, seconds) {
  const out = await pipe([["INCR", key], ["EXPIRE", key, seconds, "NX"]]);
  return out[0] > max;
}

// ---- signed session tokens (no session table: the token itself proves who you are) ----
const b64 = (s) => Buffer.from(s).toString("base64url");
function signToken(payload, secret) {
  const body = b64(JSON.stringify(payload));
  return body + "." + crypto.createHmac("sha256", secret).update(body).digest("base64url");
}
function readToken(token, secret) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const good = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); return p && p.e > Date.now() ? p : null; } catch { return null; }
}
function cookies(req) {
  const out = {};
  for (const part of header(req, "cookie").split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
const COOKIE = "cronoff_session";
const isLocal = (req) => /^(localhost|127\.0\.0\.1)(:|$)/.test(header(req, "host"));
// Adds a Set-Cookie header without replacing one that is already there.
function addCookie(res, c) { const prev = res.getHeader("Set-Cookie"); res.setHeader("Set-Cookie", prev ? [].concat(prev, c) : c); }
// `name` is what the person sees (for Google accounts, their first name); `user` is the id the saved tabs belong to.
function setSession(req, res, user, name) {
  const days = 30, secret = process.env.SESSION_SECRET;
  const token = signToken({ u: user, n: name || undefined, e: Date.now() + days * 86400000 }, secret);
  addCookie(res, COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + days * 86400 + (isLocal(req) ? "" : "; Secure"));
}
function clearSession(res) { addCookie(res, COOKIE + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"); }
function sessionInfo(req) {
  if (!accountsReady()) return null;
  const p = readToken(cookies(req)[COOKIE], process.env.SESSION_SECRET);
  return p && typeof p.u === "string" ? { id: p.u, name: typeof p.n === "string" ? p.n : p.u } : null;
}
function sessionUser(req) { const s = sessionInfo(req); return s ? s.id : null; }
const googleReady = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// State-changing calls must carry this header: a plain cross-site form cannot add it.
const sameSiteCall = (req) => header(req, "x-cronoff") === "1";

module.exports = { dbReady, accountsReady, notReadyWhy, googleReady, isLocal, addCookie, signToken, readToken, cookies, sessionInfo, cmd, pipe, send, readBody, header, clientIp, today, overLimit, sessionUser, setSession, clearSession, sameSiteCall };
