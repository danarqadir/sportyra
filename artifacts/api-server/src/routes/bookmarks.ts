import { Router } from "express";
import { db, bookmarksTable, newsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireUser } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

const router = Router();
const publicRateLimit = rateLimit({ windowMs: 60_000, max: 120 });

router.get("/bookmarks", requireUser, async (req, res, next) => {
  try {
    const userId = (res.locals.user as { id: number }).id;

    const [totalRow] = await db
      .select({ total: count() })
      .from(bookmarksTable)
      .where(eq(bookmarksTable.userId, userId));

    const items = await db
      .select({
        id: newsTable.id,
        title: newsTable.title,
        description: newsTable.description,
        body: newsTable.body,
        image: newsTable.image,
        category: newsTable.category,
        language: newsTable.language,
        source: newsTable.source,
        author: newsTable.author,
        tags: newsTable.tags,
        slug: newsTable.slug,
        readingTime: newsTable.readingTime,
        metaTitle: newsTable.metaTitle,
        metaDescription: newsTable.metaDescription,
        publicationDate: newsTable.publicationDate,
        featured: newsTable.featured,
        published: newsTable.published,
        createdAt: newsTable.createdAt,
        updatedAt: newsTable.updatedAt,
      })
      .from(bookmarksTable)
      .innerJoin(newsTable, eq(bookmarksTable.newsId, newsTable.id))
      .where(eq(bookmarksTable.userId, userId))
      .orderBy(desc(bookmarksTable.createdAt));

    res.json({
      items,
      total: Number(totalRow?.total ?? 0),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/bookmarks/:newsId", requireUser, async (req, res, next) => {
  try {
    const userId = (res.locals.user as { id: number }).id;
    const newsId = Number(req.params.newsId);
    if (!Number.isInteger(newsId) || newsId <= 0) {
      res.status(400).json({ error: "Invalid newsId" });
      return;
    }

    const [existing] = await db
      .select()
      .from(bookmarksTable)
      .where(and(eq(bookmarksTable.userId, userId), eq(bookmarksTable.newsId, newsId)))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Already bookmarked" });
      return;
    }

    const [bookmark] = await db
      .insert(bookmarksTable)
      .values({ userId, newsId })
      .returning({ id: bookmarksTable.id, newsId: bookmarksTable.newsId, createdAt: bookmarksTable.createdAt });

    res.status(201).json(bookmark);
  } catch (error) {
    next(error);
  }
});

router.delete("/bookmarks/:newsId", requireUser, async (req, res, next) => {
  try {
    const userId = (res.locals.user as { id: number }).id;
    const newsId = Number(req.params.newsId);
    if (!Number.isInteger(newsId) || newsId <= 0) {
      res.status(400).json({ error: "Invalid newsId" });
      return;
    }

    await db
      .delete(bookmarksTable)
      .where(and(eq(bookmarksTable.userId, userId), eq(bookmarksTable.newsId, newsId)));

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

router.get("/bookmarks/check/:newsId", requireUser, async (req, res, next) => {
  try {
    const userId = (res.locals.user as { id: number }).id;
    const newsId = Number(req.params.newsId);
    if (!Number.isInteger(newsId) || newsId <= 0) {
      res.status(400).json({ error: "Invalid newsId" });
      return;
    }

    const [existing] = await db
      .select({ id: bookmarksTable.id })
      .from(bookmarksTable)
      .where(and(eq(bookmarksTable.userId, userId), eq(bookmarksTable.newsId, newsId)))
      .limit(1);

    res.json({ bookmarked: !!existing });
  } catch (error) {
    next(error);
  }
});

export default router;
