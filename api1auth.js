// Cronoff optional accounts (made by yehon106). Nobody has to log in: an account only lets you save your tabs
// online and open them on another device.
//   GET  /api/auth                     -> { ready, user }     ready=false when the database / SESSION_SECRET are not set up
//   POST /api/auth {action:"register"|"login"|"logout", username, password}
"use strict";
const crypto = require("crypto");
const L = require("./_lib");

const NAME = /^[a-z0-9_]{3,20}$/;
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? no(e) : ok(k))));

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const s = L.sessionInfo(req);
    return L.send(res, 200, { ready: L.accountsReady(), user: s ? s.name : null, google: L.accountsReady() && L.googleReady(), ...(L.accountsReady() ? {} : { why: L.notReadyWhy() }) });
  }
  if (req.method !== "POST") return L.send(res, 405, { error: "method" });
  if (!L.accountsReady()) return L.send(res, 503, { error: "Accounts are not set up on this site." });
  if (!L.sameSiteCall(req)) return L.send(res, 403, { error: "Blocked." });
  const b = await L.readBody(req, 4000);
  if (!b) return L.send(res, 400, { error: "Bad request." });
  const ip = L.clientIp(req);
  try {
    if (b.action === "logout") { L.clearSession(res); return L.send(res, 200, { user: null }); }

    const name = String(b.username || "").trim().toLowerCase(), pw = String(b.password || "");
    if (!NAME.test(name)) return L.send(res, 400, { error: "The name must be 3 to 20 letters, numbers or _ (no spaces)." });
    if (pw.length < 8 || pw.length > 128) return L.send(res, 400, { error: "The password must be 8 to 128 characters." });

    if (b.action === "register") {
      if (await L.overLimit("rl:reg:" + ip, 5, 3600)) return L.send(res, 429, { error: "Too many new accounts from here. Try again later." });
      const salt = crypto.randomBytes(16);
      const hash = await scrypt(pw, salt);
      const rec = JSON.stringify({ salt: salt.toString("base64"), hash: hash.toString("base64"), created: Date.now() });
      const made = await L.cmd(["SET", "u:" + name, rec, "NX"]);
      if (made !== "OK") return L.send(res, 409, { error: "That name is taken. Pick another." });
      L.setSession(req, res, name);
      return L.send(res, 200, { user: name });
    }

    if (b.action === "login") {
      if (await L.overLimit("rl:login:" + ip + ":" + name, 8, 600)) return L.send(res, 429, { error: "Too many tries. Wait 10 minutes." });
      const raw = await L.cmd(["GET", "u:" + name]);
      let rec = null; try { rec = raw ? JSON.parse(raw) : null; } catch {}
      // always do the same amount of work, so a wrong name and a wrong password look alike
      const salt = rec ? Buffer.from(rec.salt, "base64") : Buffer.alloc(16), got = await scrypt(pw, salt);
      const ok = !!rec && crypto.timingSafeEqual(got, Buffer.from(rec.hash, "base64"));
      if (!ok) return L.send(res, 401, { error: "Wrong name or password." });
      L.setSession(req, res, name);
      return L.send(res, 200, { user: name });
    }
    return L.send(res, 400, { error: "Bad request." });
  } catch {
    return L.send(res, 503, { error: "The account service is not available right now." });
  }
};
