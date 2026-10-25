// /sitemap.xml for search engines. Built from the address people used, so it stays right if the site is renamed.
"use strict";
const PAGES = ["/", "/about.html", "/python-runner.html"];
module.exports = (req, res) => {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const base = proto + "://" + host;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    PAGES.map((p) => "  <url><loc>" + base + p + "</loc></url>").join("\n") + "\n</urlset>\n");
};
