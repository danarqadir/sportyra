import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
  arrayContains,
} from "drizzle-orm";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { db, newsTable } from "@workspace/db";
import { hasAdminToken, requireAdmin } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { broadcastNotification } from "../lib/notifications";
import { sanitizeHtml } from "../lib/sanitize";
import {
  CreateNewsBody,
  CreateNewsResponse,
  DeleteNewsParams,
  FeatureNewsBody,
  FeatureNewsParams,
  FeatureNewsResponse,
  GetNewsParams,
  GetNewsResponse,
  GetNewsSummaryResponse,
  ListNewsQueryParams,
  ListNewsResponse,
  PublishNewsBody,
  PublishNewsParams,
  PublishNewsResponse,
  UpdateNewsBody,
  UpdateNewsParams,
  UpdateNewsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const publicRateLimit = rateLimit({ windowMs: 60_000, max: 120 });

function parseId(raw: string | string[]): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");
  return id;
}

function parseQuery(query: Record<string, unknown>) {
  const normalized = { ...query };
  for (const key of ["published", "featured"]) {
    const value = normalized[key];
    if (typeof value === "string") {
      normalized[key] = value === "true";
    }
  }
  return ListNewsQueryParams.safeParse(normalized);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "story";
}

function calculateReadingTime(body: string | null | undefined, description: string): number {
  const text = `${description} ${body || ""}`.trim();
  if (!text) return 1;
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

function enrichArticle(article: Record<string, unknown>) {
  if (!article.slug && typeof article.title === "string") {
    (article as Record<string, unknown>).slug = slugify(article.title);
  }
  if (!article.readingTime) {
    (article as Record<string, unknown>).readingTime = calculateReadingTime(
      article.body as string | null,
      article.description as string,
    );
  }
  return article;
}

router.get("/news", publicRateLimit, async (req, res): Promise<void> => {
  const parsed = parseQuery(req.query as Record<string, unknown>);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    language,
    category,
    tag,
    published: requestedPublished,
    featured,
    search,
    page = 1,
    pageSize = 12,
    limit,
  } = parsed.data;
  const isAdmin = hasAdminToken(req);
  const published = isAdmin ? requestedPublished : (requestedPublished ?? true);
  if (!isAdmin && requestedPublished === false) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const filters = [];
  if (language) filters.push(eq(newsTable.language, language));
  if (category) filters.push(eq(newsTable.category, category));
  if (published !== undefined) filters.push(eq(newsTable.published, published));
  if (featured !== undefined) filters.push(eq(newsTable.featured, featured));
  if (tag) filters.push(arrayContains(newsTable.tags, [tag]));
  const authorFilter = typeof req.query.author === "string" ? req.query.author.trim() : "";
  if (authorFilter) filters.push(ilike(newsTable.author, `%${authorFilter}%`));
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;
  if (dateFrom && !isNaN(dateFrom.getTime())) filters.push(sql`${newsTable.publicationDate} >= ${dateFrom}`);
  if (dateTo && !isNaN(dateTo.getTime())) filters.push(sql`${newsTable.publicationDate} <= ${dateTo}`);
  if (search) {
    filters.push(
      or(
        ilike(newsTable.title, `%${search}%`),
        ilike(newsTable.description, `%${search}%`),
        ilike(newsTable.source, `%${search}%`),
        ilike(newsTable.author, `%${search}%`),
        ilike(sql`array_to_string(${newsTable.tags}, ' ')`, `%${search}%`),
      ),
    );
  }

  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "newest";
  let orderClause;
  if (sortBy === "oldest") orderClause = asc(newsTable.publicationDate);
  else if (sortBy === "title") orderClause = asc(newsTable.title);
  else if (sortBy === "views") orderClause = desc(newsTable.featured);
  else orderClause = desc(newsTable.publicationDate);

  const effectivePageSize = Math.min(limit ?? pageSize, 100);
  const offset = (page - 1) * effectivePageSize;
  const whereClause = filters.length ? and(...filters) : undefined;
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(newsTable)
      .where(whereClause)
      .orderBy(orderClause, asc(newsTable.id))
      .limit(effectivePageSize)
      .offset(offset),
    db.select({ total: count() }).from(newsTable).where(whereClause),
  ]);

  const total = Number(totalRows[0]?.total ?? 0);
  res.json(
    ListNewsResponse.parse({
      items: rows.map(enrichArticle),
      page,
      pageSize: effectivePageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / effectivePageSize),
    }),
  );
});

router.post("/news", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateNewsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = { ...parsed.data };
  if (data.body) data.body = sanitizeHtml(data.body);
  if (!data.slug) data.slug = slugify(data.title);
  if (!data.readingTime) data.readingTime = calculateReadingTime(data.body ?? null, data.description);

  const [article] = await db.insert(newsTable).values(data).returning();
  if (article.published) {
    const base = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
    broadcastNotification({ id: article.id, title: article.title, url: `${base}/article/${article.id}/${article.slug || slugify(article.title)}` });
  }
  res.status(201).json(CreateNewsResponse.parse(enrichArticle(article)));
});

router.get("/news/summary", requireAdmin, async (_req, res): Promise<void> => {
  const [summary] = await db
    .select({
      total: count(),
      published: count(eq(newsTable.published, true)),
      drafts: count(eq(newsTable.published, false)),
      featured: count(eq(newsTable.featured, true)),
    })
    .from(newsTable);

  res.json(
    GetNewsSummaryResponse.parse({
      total: Number(summary?.total ?? 0),
      published: Number(summary?.published ?? 0),
      drafts: Number(summary?.drafts ?? 0),
      featured: Number(summary?.featured ?? 0),
    }),
  );
});

router.get("/news/trending", publicRateLimit, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const { analyticsEventsTable, commentsTable } = await import("@workspace/db");

  const recentArticles = await db
    .select()
    .from(newsTable)
    .where(eq(newsTable.published, true))
    .orderBy(desc(newsTable.publicationDate))
    .limit(200);

  if (recentArticles.length === 0) { res.json([]); return; }

  const articleIds = recentArticles.map((a) => a.id);
  const viewCounts = await db
    .select({ articleId: analyticsEventsTable.articleId, cnt: count() })
    .from(analyticsEventsTable)
    .where(and(inArray(analyticsEventsTable.articleId, articleIds), eq(analyticsEventsTable.eventType, "article_view")))
    .groupBy(analyticsEventsTable.articleId);
  const viewMap = new Map<number, number>();
  for (const v of viewCounts) { if (v.articleId != null) viewMap.set(v.articleId, v.cnt); }

  const commentCounts = await db
    .select({ newsId: commentsTable.newsId, cnt: count() })
    .from(commentsTable)
    .where(inArray(commentsTable.newsId, articleIds))
    .groupBy(commentsTable.newsId);
  const commentMap = new Map<number, number>();
  for (const c of commentCounts) { if (c.newsId != null) commentMap.set(c.newsId, c.cnt); }

  const now = Date.now();
  const scored = recentArticles.map((article) => {
    const views = viewMap.get(article.id) ?? 0;
    const comments = commentMap.get(article.id) ?? 0;
    const ageHours = Math.max(1, (now - new Date(article.publicationDate).getTime()) / 3600000);
    const recencyScore = 100 / Math.pow(ageHours, 0.6);
    const popularityScore = Math.log2(views + 1) * 8;
    const engagementScore = comments * 3;
    const featuredBoost = article.featured ? 25 : 0;
    const score = recencyScore + popularityScore + engagementScore + featuredBoost;
    return { ...article, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  res.json(scored.slice(0, limit).map(enrichArticle));
});

router.get("/news/trending/categories", publicRateLimit, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 5, 20);
  const { analyticsEventsTable } = await import("@workspace/db");
  const trending = await db
    .select({
      category: newsTable.category,
      views: count(),
    })
    .from(analyticsEventsTable)
    .innerJoin(newsTable, eq(analyticsEventsTable.articleId, newsTable.id))
    .where(eq(analyticsEventsTable.eventType, "article_view"))
    .groupBy(newsTable.category)
    .orderBy(desc(count()))
    .limit(limit);
  res.json(trending.map((t) => ({ category: t.category, views: Number(t.views) })));
});

router.get("/news/:id", publicRateLimit, async (req, res): Promise<void> => {
  const parsed = GetNewsParams.safeParse({ id: parseId(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [article] = await db
    .select()
    .from(newsTable)
    .where(eq(newsTable.id, parsed.data.id));
  if (
    !article ||
    (!article.published &&
      !hasAdminToken(req))
  ) {
    res.status(404).json({ error: "News article not found" });
    return;
  }

  res.json(GetNewsResponse.parse(enrichArticle(article)));
});

router.get("/news/slug/:slug", publicRateLimit, async (req, res): Promise<void> => {
  const slug = typeof req.params.slug === "string" ? req.params.slug.trim() : "";
  if (!slug) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const [article] = await db
    .select()
    .from(newsTable)
    .where(eq(newsTable.slug, slug));
  if (!article || (!article.published && !hasAdminToken(req))) {
    res.status(404).json({ error: "News article not found" });
    return;
  }
  res.json(GetNewsResponse.parse(enrichArticle(article)));
});

router.get(
  "/news/:id/related",
  publicRateLimit,
  async (req, res): Promise<void> => {
    const parsed = GetNewsParams.safeParse({ id: parseId(req.params.id) });
    const requestedLimit = 3;
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid related news parameters" });
      return;
    }
    const [article] = await db
      .select()
      .from(newsTable)
      .where(eq(newsTable.id, parsed.data.id));
    if (!article || !article.published) {
      res.status(404).json({ error: "News article not found" });
      return;
    }
    const related = await db
      .select()
      .from(newsTable)
      .where(
        and(
          eq(newsTable.category, article.category),
          eq(newsTable.published, true),
          ne(newsTable.id, article.id),
        ),
      )
      .orderBy(desc(newsTable.publicationDate), asc(newsTable.id))
      .limit(requestedLimit);
    res.json(related.map(enrichArticle));
  },
);

router.patch("/news/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateNewsParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateNewsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData = { ...body.data };
  if (updateData.body) updateData.body = sanitizeHtml(updateData.body);
  if (updateData.title && !updateData.slug) {
    updateData.slug = slugify(updateData.title);
  }
  if (updateData.body !== undefined || updateData.description !== undefined) {
    const existingArticle = await db.select().from(newsTable).where(eq(newsTable.id, params.data.id)).limit(1);
    const desc = updateData.description ?? existingArticle[0]?.description ?? "";
    const bodyText = updateData.body !== undefined ? updateData.body : existingArticle[0]?.body;
    updateData.readingTime = calculateReadingTime(bodyText ?? null, desc);
  }

  const [article] = await db
    .update(newsTable)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(newsTable.id, params.data.id))
    .returning();

  if (!article) {
    res.status(404).json({ error: "News article not found" });
    return;
  }
  res.json(UpdateNewsResponse.parse(enrichArticle(article)));
});

router.delete("/news/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteNewsParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [article] = await db
    .delete(newsTable)
    .where(eq(newsTable.id, params.data.id))
    .returning();
  if (!article) {
    res.status(404).json({ error: "News article not found" });
    return;
  }
  res.sendStatus(204);
});

router.post(
  "/news/:id/publish",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = PublishNewsParams.safeParse({ id: parseId(req.params.id) });
    const body = PublishNewsBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : "Invalid publish payload",
      });
      return;
    }

    const [article] = await db
      .update(newsTable)
      .set({ published: body.data.published, updatedAt: new Date() })
      .where(eq(newsTable.id, params.data.id))
      .returning();

    if (!article) {
      res.status(404).json({ error: "News article not found" });
      return;
    }
    if (body.data.published) {
      const base = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
      const slug = article.slug || slugify(article.title);
      broadcastNotification({ id: article.id, title: article.title, url: `${base}/article/${article.id}/${slug}` });
    }
    res.json(PublishNewsResponse.parse(enrichArticle(article)));
  },
);

router.post(
  "/news/:id/feature",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = FeatureNewsParams.safeParse({ id: parseId(req.params.id) });
    const body = FeatureNewsBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : "Invalid feature payload",
      });
      return;
    }

    const [article] = await db
      .update(newsTable)
      .set({ featured: body.data.featured, updatedAt: new Date() })
      .where(eq(newsTable.id, params.data.id))
      .returning();

    if (!article) {
      res.status(404).json({ error: "News article not found" });
      return;
    }
    res.json(FeatureNewsResponse.parse(enrichArticle(article)));
  },
);

router.get("/news/:id/navigation", publicRateLimit, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [current] = await db.select().from(newsTable).where(eq(newsTable.id, id)).limit(1);
  if (!current) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  const [previous] = await db
    .select({ id: newsTable.id, title: newsTable.title, slug: newsTable.slug, image: newsTable.image, publicationDate: newsTable.publicationDate })
    .from(newsTable)
    .where(and(eq(newsTable.published, true), sql`${newsTable.publicationDate} < ${current.publicationDate}`))
    .orderBy(desc(newsTable.publicationDate))
    .limit(1);
  const [next] = await db
    .select({ id: newsTable.id, title: newsTable.title, slug: newsTable.slug, image: newsTable.image, publicationDate: newsTable.publicationDate })
    .from(newsTable)
    .where(and(eq(newsTable.published, true), sql`${newsTable.publicationDate} > ${current.publicationDate}`))
    .orderBy(asc(newsTable.publicationDate))
    .limit(1);
  res.json({
    previous: previous ? { ...previous, slug: previous.slug || slugify(previous.title) } : null,
    next: next ? { ...next, slug: next.slug || slugify(next.title) } : null,
  });
});

export default router;
