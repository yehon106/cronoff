// /robots.txt: everything public may be indexed, the API may not.
"use strict";
module.exports = (req, res) => {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.end("User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: " + proto + "://" + host + "/sitemap.xml\n");
};
