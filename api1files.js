// Cronoff: your tabs saved to your account (made by yehon106). Needs a log in.
//   GET /api/files            -> { files:[{name,code}], saved }
//   PUT /api/files {files}    -> { saved }
"use strict";
const L = require("./_lib");

const MAX_FILES = 12, MAX_TOTAL = 400000;

module.exports = async (req, res) => {
  const user = L.sessionUser(req);
  if (!user) return L.send(res, 401, { error: "Log in first." });
  try {
    if (req.method === "GET") {
      const raw = await L.cmd(["GET", "f:" + user]);
      return L.send(res, 200, raw ? JSON.parse(raw) : { files: [], saved: 0 });
    }
    if (req.method !== "PUT") return L.send(res, 405, { error: "method" });
    if (!L.sameSiteCall(req)) return L.send(res, 403, { error: "Blocked." });
    if (await L.overLimit("rl:save:" + user, 60, 3600)) return L.send(res, 429, { error: "Too many saves. Try again later." });
    const b = await L.readBody(req, MAX_TOTAL + 20000);
    if (!b || !Array.isArray(b.files) || b.files.length < 1 || b.files.length > MAX_FILES) return L.send(res, 400, { error: "Send 1 to " + MAX_FILES + " tabs." });
    let total = 0;
    const files = [];
    for (const f of b.files) {
      if (!f || typeof f.name !== "string" || typeof f.code !== "string" || f.name.length > 60) return L.send(res, 400, { error: "Bad tab." });
      total += f.code.length + f.name.length;
      files.push({ name: f.name, code: f.code });
    }
    if (total > MAX_TOTAL) return L.send(res, 413, { error: "Too big to save (limit about 400 KB)." });
    const saved = Date.now();
    await L.cmd(["SET", "f:" + user, JSON.stringify({ files, saved })]);
    return L.send(res, 200, { saved });
  } catch {
    return L.send(res, 503, { error: "The account service is not available right now." });
  }
};
