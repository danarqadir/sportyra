import express, { type Express } from "express";
import path from "node:path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { desc, eq } from "drizzle-orm";
import pinoHttp from "pino-http";
import { db, newsTable } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = process.env["CORS_ORIGIN"]
  ? process.env["CORS_ORIGIN"].split(",").map((value) => value.trim()).filter(Boolean)
  : process.env.NODE_ENV === "production" ? false : true;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' https://pagead2.googlesyndication.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src https://pagead2.googlesyndication.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; "));
  next();
});

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const CSRF_HEADER = "x-requested-with";
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  if (req.path.startsWith("/api/")) {
    const value = req.headers[CSRF_HEADER];
    if (typeof value !== "string" || value.toLowerCase() !== "xmlhttprequest") {
      res.status(403).json({ error: "Missing or invalid CSRF header" });
      return;
    }
  }
  next();
});

app.use("/api", router);

const publicDir = path.resolve(process.cwd(), "artifacts/sportyra/dist/public");

function siteUrl(req: express.Request) {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  return `${protocol}://${req.get("host")}`;
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character] ?? character);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "story";
}

app.get("/sitemap.xml", async (req, res, next) => {
  try {
    const articles = await db
      .select({ id: newsTable.id, title: newsTable.title, slug: newsTable.slug, updatedAt: newsTable.updatedAt })
      .from(newsTable)
      .where(eq(newsTable.published, true))
      .orderBy(desc(newsTable.updatedAt));
    const base = siteUrl(req);
    const urls = articles.map((article) => {
      const slug = article.slug || slugify(article.title);
      return `
  <url>
    <loc>${escapeXml(`${base}/article/${article.id}/${slug}`)}</loc>
    <lastmod>${article.updatedAt.toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }).join("");
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${escapeXml(base)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>${urls}
</urlset>`);
  } catch (error) {
    next(error);
  }
});

app.get("/robots.txt", (req, res) => {
  const base = siteUrl(req);
  res.type("text/plain").send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Sitemap: ${base}/sitemap.xml
`);
});

app.get("/rss.xml", async (req, res, next) => {
  try {
    const articles = await db
      .select()
      .from(newsTable)
      .where(eq(newsTable.published, true))
      .orderBy(desc(newsTable.publicationDate))
      .limit(50);
    const base = siteUrl(req);
    const items = articles.map((article) => {
      const slug = article.slug || slugify(article.title);
      const url = `${base}/article/${article.id}/${slug}`;
      return `
    <item>
      <title>${escapeXml(article.title)}</title>
      <description>${escapeXml(article.description)}</description>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${article.publicationDate.toUTCString()}</pubDate>
      <author>${escapeXml(article.author)}</author>
      <category>${escapeXml(article.category)}</category>
      ${article.tags.length > 0 ? article.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join("\n      ") : ""}
    </item>`;
    }).join("");
    res.type("application/rss+xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
  <title>Sportyra News</title>
  <description>Independent sports journalism, globally minded.</description>
  <link>${escapeXml(base)}</link>
  <atom:link href="${escapeXml(base)}/rss.xml" rel="self" type="application/rss+xml" />
  <language>en</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
</channel></rss>`);
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API endpoint not found" });
    return;
  }
  next();
});

app.use(express.static(publicDir, { index: "index.html", maxAge: "1h" }));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"), (error) => {
    if (error) next();
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error }, "Unhandled API error");
  if (res.headersSent) return;
  if (error instanceof SyntaxError && "status" in error && (error as { status?: number }).status === 400) {
    res.status(400).json({ error: "Malformed request body" });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

export default app;
