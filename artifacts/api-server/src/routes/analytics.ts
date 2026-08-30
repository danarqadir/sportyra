import { Router } from "express";
import { and, count, desc, eq, gte, sql, ne } from "drizzle-orm";
import crypto from "node:crypto";
import { db, analyticsEventsTable, newsTable } from "@workspace/db";
import { requireAdmin } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

const router = Router();
const allowedEvents = new Set(["page_view", "article_view", "search", "newsletter_signup", "share", "ad_impression", "ad_click", "sponsor_view", "sponsor_click", "affiliate_click", "premium_gate", "campaign_view", "campaign_click", "label_view", "label_click"]);

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

router.post("/analytics/events", rateLimit({ windowMs: 60_000, max: 60 }), async (req, res, next): Promise<void> => {
  try {
    const eventType = typeof req.body?.eventType === "string" ? req.body.eventType.trim() : "";
    const path = typeof req.body?.path === "string" ? req.body.path.slice(0, 500) : "/";
    const articleId = Number.isInteger(req.body?.articleId) ? req.body.articleId : null;
    const referrer = typeof req.body?.referrer === "string" ? req.body.referrer.slice(0, 1000) : null;
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.slice(0, 128) : null;
    const partnerId = Number.isInteger(req.body?.partnerId) ? req.body.partnerId : null;
    const referralCode = typeof req.body?.referralCode === "string" ? req.body.referralCode.slice(0, 50) : null;
    if (!allowedEvents.has(eventType) || path.length < 1) {
      res.status(400).json({ error: "Invalid analytics event." });
      return;
    }

    await db.insert(analyticsEventsTable).values({
      eventType,
      path,
      articleId,
      referrer,
      userAgent: req.get("user-agent") ? hashValue(req.get("user-agent") as string) : null,
      sessionId,
      partnerId,
      referralCode,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/analytics/summary", requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totals, topPages, topArticles, uniqueVisitors, dailyViews, articleSummaries] = await Promise.all([
      db.select({ eventType: analyticsEventsTable.eventType, total: count() })
        .from(analyticsEventsTable)
        .where(gte(analyticsEventsTable.createdAt, since))
        .groupBy(analyticsEventsTable.eventType)
        .orderBy(desc(count())),
      db.select({ path: analyticsEventsTable.path, total: count() })
        .from(analyticsEventsTable)
        .where(and(gte(analyticsEventsTable.createdAt, since), eq(analyticsEventsTable.eventType, "page_view")))
        .groupBy(analyticsEventsTable.path)
        .orderBy(desc(count()))
        .limit(10),
      db.select({ articleId: analyticsEventsTable.articleId, total: count() })
        .from(analyticsEventsTable)
        .where(and(gte(analyticsEventsTable.createdAt, since), eq(analyticsEventsTable.eventType, "article_view")))
        .groupBy(analyticsEventsTable.articleId)
        .orderBy(desc(count()))
        .limit(10),
      db.select({ sessionId: analyticsEventsTable.sessionId })
        .from(analyticsEventsTable)
        .where(and(gte(analyticsEventsTable.createdAt, since), eq(analyticsEventsTable.eventType, "page_view"), ne(analyticsEventsTable.sessionId, null as unknown as string)))
        .groupBy(analyticsEventsTable.sessionId),
      db.select({
        date: sql<string>`to_char(${analyticsEventsTable.createdAt}::date, 'YYYY-MM-DD')`,
        views: count(),
      })
        .from(analyticsEventsTable)
        .where(and(gte(analyticsEventsTable.createdAt, since), eq(analyticsEventsTable.eventType, "page_view")))
        .groupBy(sql`${analyticsEventsTable.createdAt}::date`)
        .orderBy(desc(sql`${analyticsEventsTable.createdAt}::date`))
        .limit(30),
      db.select({
        articleId: analyticsEventsTable.articleId,
        title: newsTable.title,
        views: count(),
      })
        .from(analyticsEventsTable)
        .leftJoin(newsTable, eq(analyticsEventsTable.articleId, newsTable.id))
        .where(and(gte(analyticsEventsTable.createdAt, since), eq(analyticsEventsTable.eventType, "article_view")))
        .groupBy(analyticsEventsTable.articleId, newsTable.title)
        .orderBy(desc(count()))
        .limit(10),
    ]);
    res.json({
      since,
      totals,
      topPages,
      topArticles,
      uniqueVisitors: uniqueVisitors.length,
      dailyViews: dailyViews.reverse(),
      articleSummaries,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
