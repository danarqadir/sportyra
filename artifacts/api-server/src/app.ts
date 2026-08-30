import express, { type Express } from "express";
import path from "node:path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { desc, eq } from "drizzle-orm";
import pinoHttp from "pino-http";
import { db, newsTable, competitionsTable, teamsTable, playersTable, analyticsEventsTable } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import { ClientError } from "./lib/errors";

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
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  // Cross-Origin-Opener-Policy: isolate the browsing context from cross-origin
  // popups/opener windows to mitigate cross-origin information leaks (and the
  // window.opener reverse-tabnabbing vector).
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // Cross-Origin-Resource-Policy: prevent this origin's resources from being
  // embedded by cross-origin sites. The API/SPA is served same-origin.
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  const isDev = process.env.NODE_ENV !== "production";
  const connectSrc = isDev
    ? "'self' http://localhost:3000 http://127.0.0.1:3000"
    : "'self'";
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://pagead2.googlesyndication.com",
    // SECURITY NOTE: 'unsafe-inline' in style-src is a known risk (XSS via injected style tags).
    // Required because React/Vite injects inline styles at runtime (CSS-in-JS, Vite HMR).
    // Mitigation: Remove once CSS-in-JS is replaced with pure CSS modules or Tailwind.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-src https://pagead2.googlesyndication.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ];
  // Only upgrade insecure requests in production; in dev Vite serves over http.
  if (!isDev) csp.push("upgrade-insecure-requests");
  res.setHeader("Content-Security-Policy", csp.join("; "));
  next();
});

// Cross-Origin-Embedder-Policy (COEP) is intentionally NOT set to
// "require-corp". Doing so would break this application's legitimate
// cross-origin embedded resources: remote editorial images, fonts, and the
// Google AdSense iframe (all allowed by the CSP above) must load without
// CORP/crossorigin attributes. Enabling COEP would require every third-party
// resource provider to opt in, which cannot be relied upon. "unsafe-none"
// (the browser default) is therefore kept to preserve functionality.
// SECURITY NOTE: if the app later drops third-party embeds, revisit COEP.

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

const publicDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
  "../../sportyra/dist/public",
);

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
    const [articles, competitions, teams, playersList, categoriesList, tagsList] = await Promise.all([
      db
        .select({ id: newsTable.id, title: newsTable.title, slug: newsTable.slug, updatedAt: newsTable.updatedAt })
        .from(newsTable)
        .where(eq(newsTable.published, true))
        .orderBy(desc(newsTable.updatedAt)),
      db.select({ id: competitionsTable.id, slug: competitionsTable.slug, createdAt: competitionsTable.createdAt }).from(competitionsTable),
      db.select({ id: teamsTable.id, slug: teamsTable.slug, createdAt: teamsTable.createdAt }).from(teamsTable),
      db.select({ id: playersTable.id, slug: playersTable.slug, updatedAt: playersTable.updatedAt }).from(playersTable),
      db.selectDistinct({ category: newsTable.category }).from(newsTable).where(eq(newsTable.published, true)),
      db.selectDistinct({ tags: newsTable.tags }).from(newsTable).where(eq(newsTable.published, true)),
    ]);

    const allTags = new Set<string>();
    for (const row of tagsList) {
      for (const tag of row.tags) allTags.add(tag);
    }

    const base = siteUrl(req);
    const now = new Date().toISOString();
    const urls: string[] = [
      // Homepage
      `<url><loc>${escapeXml(base)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      // Main section pages
      `<url><loc>${escapeXml(`${base}/live-scores`)}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
      `<url><loc>${escapeXml(`${base}/transfers`)}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
      `<url><loc>${escapeXml(`${base}/players`)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeXml(`${base}/predictions`)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeXml(`${base}/trending`)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeXml(`${base}/teams`)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeXml(`${base}/standings`)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeXml(`${base}/fixtures`)}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
      `<url><loc>${escapeXml(`${base}/partners`)}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
      `<url><loc>${escapeXml(`${base}/partners/apply`)}</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`,
    ];

    // Articles
    for (const article of articles) {
      const slug = article.slug || slugify(article.title);
      urls.push(`
  <url>
    <loc>${escapeXml(`${base}/article/${article.id}/${slug}`)}</loc>
    <lastmod>${article.updatedAt.toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
    }

    // Category pages
    for (const cat of categoriesList) {
      if (cat.category) {
        urls.push(`<url><loc>${escapeXml(`${base}/category/${cat.category}`)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`);
      }
    }

    // Tag pages
    for (const tag of allTags) {
      urls.push(`<url><loc>${escapeXml(`${base}/tag/${encodeURIComponent(tag)}`)}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
    }

    // Competition pages
    for (const comp of competitions) {
      if (comp.slug) {
        urls.push(`<url><loc>${escapeXml(`${base}/competition/${comp.slug}`)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
      }
    }

    // Team pages
    for (const team of teams) {
      if (team.slug) {
        urls.push(`<url><loc>${escapeXml(`${base}/teams/${team.slug}`)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
      }
    }

    // Player pages
    for (const player of playersList) {
      if (player.slug) {
        urls.push(`<url><loc>${escapeXml(`${base}/players/${player.slug}`)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
      }
    }

    // Static pages
    urls.push(
      `<url><loc>${escapeXml(`${base}/account`)}</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`,
      `<url><loc>${escapeXml(`${base}/login`)}</loc><changefreq>yearly</changefreq><priority>0.1</priority></url>`,
      `<url><loc>${escapeXml(`${base}/register`)}</loc><changefreq>yearly</changefreq><priority>0.1</priority></url>`,
      `<url><loc>${escapeXml(`${base}/rss.xml`)}</loc><changefreq>daily</changefreq><priority>0.5</priority></url>`,
    );

    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${urls.join("\n")}
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
Disallow: /account
Disallow: /login
Disallow: /register
Disallow: /search
Disallow: /partner/
Disallow: /ref/
Disallow: /account*
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
  if (error instanceof ClientError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  if (error instanceof SyntaxError && "status" in error && (error as { status?: number }).status === 400) {
    res.status(400).json({ error: "Malformed request body" });
    return;
  }
  if (error instanceof Error && error.name === "ZodError") {
    res.status(400).json({ error: "Invalid request data" });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

export default app;
