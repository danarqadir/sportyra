import { Router } from "express";
import { db, monetizationEventsTable } from "@workspace/db";
import { and, eq, desc, count, sql, gte } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

const router = Router();

router.post("/monetization/events", rateLimit({ windowMs: 60_000, max: 60 }), async (req, res, next): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const eventType = typeof body.eventType === "string" ? body.eventType.trim().slice(0, 100) : "";
    const articleId = Number.isInteger(body.articleId) ? Number(body.articleId) : null;
    const adId = Number.isInteger(body.adId) ? Number(body.adId) : null;
    const partnerId = Number.isInteger(body.partnerId) ? Number(body.partnerId) : null;
    const campaignId = Number.isInteger(body.campaignId) ? Number(body.campaignId) : null;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 128) : null;
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;

    const validTypes = [
      "ad_impression", "ad_click", "sponsor_view", "sponsor_click",
      "affiliate_click", "premium_gate", "campaign_view", "campaign_click",
      "label_view", "label_click",
    ];
    if (!validTypes.includes(eventType)) {
      res.status(400).json({ error: `eventType must be one of: ${validTypes.join(", ")}` });
      return;
    }

    await db.insert(monetizationEventsTable).values({
      eventType, articleId, adId, partnerId, campaignId, sessionId,
      metadata: metadata as any,
    });

    res.status(204).send();
  } catch (error) { next(error); }
});

router.get("/admin/monetization/summary", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [eventTypeTotals, dailyTrends, topArticles, topPartners] = await Promise.all([
      db.select({ eventType: monetizationEventsTable.eventType, total: count() })
        .from(monetizationEventsTable).where(gte(monetizationEventsTable.createdAt, since))
        .groupBy(monetizationEventsTable.eventType).orderBy(desc(count())),
      db.select({
        date: sql<string>`to_char(${monetizationEventsTable.createdAt}::date, 'YYYY-MM-DD')`,
        eventType: monetizationEventsTable.eventType,
        total: count(),
      }).from(monetizationEventsTable).where(gte(monetizationEventsTable.createdAt, since))
        .groupBy(sql`${monetizationEventsTable.createdAt}::date`, monetizationEventsTable.eventType)
        .orderBy(desc(sql`${monetizationEventsTable.createdAt}::date`)).limit(300),
      db.select({
        articleId: monetizationEventsTable.articleId,
        total: count(),
      }).from(monetizationEventsTable).where(and(gte(monetizationEventsTable.createdAt, since), eq(monetizationEventsTable.eventType, "sponsor_view")))
        .groupBy(monetizationEventsTable.articleId).orderBy(desc(count())).limit(10),
      db.select({
        partnerId: monetizationEventsTable.partnerId,
        total: count(),
      }).from(monetizationEventsTable).where(and(gte(monetizationEventsTable.createdAt, since), eq(monetizationEventsTable.eventType, "affiliate_click")))
        .groupBy(monetizationEventsTable.partnerId).orderBy(desc(count())).limit(10),
    ]);

    res.json({ since, eventTypeTotals, dailyTrends, topArticles, topPartners });
  } catch (error) { next(error); }
});

export default router;
