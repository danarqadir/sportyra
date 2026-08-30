import { Router } from "express";
import { db, adPlacementsTable, adEventsTable } from "@workspace/db";
import { and, eq, desc, count, sql, gte, lte, isNull, or } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { rateLimit, adminMutationRateLimit } from "../lib/rate-limit";
import crypto from "node:crypto";

const router = Router();
const trackRateLimit = rateLimit({ windowMs: 60_000, max: 120 });

// Hashing helpers keep ad tracking privacy-consistent with the rest of the app
// (matches partners.ts: IPs are day-salted HMAC hashes, user agents are SHA-256).
function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function getIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } | null }): string {
  const forwarded = req.headers["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : null) || req.socket?.remoteAddress || "";
}

function hashIp(ip: string): string {
  if (!ip) return "";
  const secret = process.env["FRAUD_IP_HMAC_SECRET"] || "";
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHmac("sha256", `${secret}:${day}`).update(ip).digest("hex").slice(0, 16);
}

router.get("/admin/ads", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const location = typeof req.query.location === "string" ? req.query.location : undefined;
    const activeOnly = req.query.activeOnly === "true";

    const where = [];
    if (location) where.push(eq(adPlacementsTable.location, location));
    if (activeOnly) where.push(eq(adPlacementsTable.active, true));
    const conditions = where.length > 0 ? and(...where) : undefined;

    const [totalResult] = await db.select({ total: count() }).from(adPlacementsTable).where(conditions);
    const total = totalResult?.total ?? 0;
    const items = await db.select().from(adPlacementsTable)
      .where(conditions)
      .orderBy(desc(adPlacementsTable.priority), desc(adPlacementsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) { next(error); }
});

router.get("/ads/placements", async (req, res, next): Promise<void> => {
  try {
    const location = typeof req.query.location === "string" ? req.query.location : undefined;
    if (!location) { res.status(400).json({ error: "location parameter required" }); return; }

    const now = new Date();
    const items = await db.select().from(adPlacementsTable)
      .where(and(
        eq(adPlacementsTable.location, location),
        eq(adPlacementsTable.active, true),
        or(isNull(adPlacementsTable.startsAt), lte(adPlacementsTable.startsAt, now)),
        or(isNull(adPlacementsTable.expiresAt), gte(adPlacementsTable.expiresAt, now)),
      ))
      .orderBy(desc(adPlacementsTable.priority));

    res.json({ items });
  } catch (error) { next(error); }
});

router.post("/admin/ads", requireAdmin, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res, next): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    const slot = typeof body.slot === "string" ? body.slot.trim().slice(0, 200) : null;
    const location = typeof body.location === "string" ? body.location.trim().slice(0, 100) : "";
    const adType = typeof body.adType === "string" ? body.adType.trim().slice(0, 50) : "display";
    const priority = Number.isInteger(body.priority) ? Number(body.priority) : 0;
    const active = typeof body.active === "boolean" ? body.active : true;
    const width = Number.isInteger(body.width) ? Number(body.width) : null;
    const height = Number.isInteger(body.height) ? Number(body.height) : null;
    const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl.trim().slice(0, 500) : null;
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim().slice(0, 500) : null;
    const altText = typeof body.altText === "string" ? body.altText.trim().slice(0, 300) : null;
    const partnerId = Number.isInteger(body.partnerId) ? Number(body.partnerId) : null;
    const campaignId = Number.isInteger(body.campaignId) ? Number(body.campaignId) : null;
    const startsAt = body.startsAt ? new Date(body.startsAt as string) : null;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt as string) : null;

    if (!name || !location) { res.status(400).json({ error: "name and location are required" }); return; }

    const validTypes = ["display", "native", "video", "affiliate", "house"];
    const adTypeClean = validTypes.includes(adType) ? adType : "display";

    const user = res.locals.user as { id: number };

    const [created] = await db.insert(adPlacementsTable).values({
      name, slot, location, adType: adTypeClean, priority, active,
      width, height, targetUrl, imageUrl, altText,
      partnerId, campaignId,
      startsAt: startsAt && !isNaN(startsAt.getTime()) ? startsAt : null,
      expiresAt: expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt : null,
      createdBy: user.id,
    }).returning();

    res.status(201).json(created);
  } catch (error) { next(error); }
});

router.patch("/admin/ads/:id", requireAdmin, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["name", "slot", "location", "adType", "targetUrl", "imageUrl", "altText"]) {
      if (body[key] !== undefined) updates[key] = body[key] ? String(body[key]).trim().slice(0, 500) : null;
    }
    if (body.priority !== undefined) updates.priority = Number.isInteger(body.priority) ? body.priority : 0;
    if (body.active !== undefined) updates.active = Boolean(body.active);
    if (body.width !== undefined) updates.width = Number.isInteger(body.width) ? body.width : null;
    if (body.height !== undefined) updates.height = Number.isInteger(body.height) ? body.height : null;
    if (body.partnerId !== undefined) updates.partnerId = Number.isInteger(body.partnerId) ? body.partnerId : null;
    if (body.campaignId !== undefined) updates.campaignId = Number.isInteger(body.campaignId) ? body.campaignId : null;
    if (body.startsAt !== undefined) {
      const d = new Date(body.startsAt as string);
      updates.startsAt = !isNaN(d.getTime()) ? d : null;
    }
    if (body.expiresAt !== undefined) {
      const d = new Date(body.expiresAt as string);
      updates.expiresAt = !isNaN(d.getTime()) ? d : null;
    }

    const [updated] = await db.update(adPlacementsTable).set(updates).where(eq(adPlacementsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Ad placement not found" }); return; }
    res.json(updated);
  } catch (error) { next(error); }
});

router.delete("/admin/ads/:id", requireAdmin, adminMutationRateLimit, async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [deleted] = await db.delete(adPlacementsTable).where(eq(adPlacementsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Ad placement not found" }); return; }
    res.status(204).send();
  } catch (error) { next(error); }
});

router.post("/ads/track", trackRateLimit, async (req, res, next): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const adId = Number.isInteger(body.adId) ? Number(body.adId) : null;
    const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 128) : null;
    const partnerId = Number.isInteger(body.partnerId) ? Number(body.partnerId) : null;
    const campaignId = Number.isInteger(body.campaignId) ? Number(body.campaignId) : null;
    const articleId = Number.isInteger(body.articleId) ? Number(body.articleId) : null;

    if (!adId || !["impression", "click"].includes(eventType)) {
      res.status(400).json({ error: "adId and eventType (impression|click) required" });
      return;
    }

    // Verify the ad placement exists before recording an event. This keeps the
    // endpoint robust (a clean 404 instead of a generic 500 from a FK violation)
    // for stale/misconfigured client references.
    const [existingAd] = await db.select({ id: adPlacementsTable.id }).from(adPlacementsTable).where(eq(adPlacementsTable.id, adId)).limit(1);
    if (!existingAd) {
      res.status(404).json({ error: "Ad placement not found" });
      return;
    }

    const ip = hashIp(getIp(req));

    await db.insert(adEventsTable).values({
      adId,
      eventType,
      sessionId,
      partnerId,
      campaignId,
      articleId,
      userAgent: req.get("user-agent") ? hashValue(req.get("user-agent") as string) : null,
      ipAddress: ip || null,
    });

    if (eventType === "impression") {
      await db.update(adPlacementsTable).set({ impressions: sql`${adPlacementsTable.impressions} + 1` }).where(eq(adPlacementsTable.id, adId));
    } else if (eventType === "click") {
      await db.update(adPlacementsTable).set({ clicks: sql`${adPlacementsTable.clicks} + 1` }).where(eq(adPlacementsTable.id, adId));
    }

    res.status(204).send();
  } catch (error) { next(error); }
});

router.get("/admin/ads/:id/stats", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [ad] = await db.select().from(adPlacementsTable).where(eq(adPlacementsTable.id, id)).limit(1);
    if (!ad) { res.status(404).json({ error: "Ad placement not found" }); return; }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [impressions, clicks, dailyEvents] = await Promise.all([
      db.select({ total: count() }).from(adEventsTable).where(and(eq(adEventsTable.adId, id), eq(adEventsTable.eventType, "impression"), gte(adEventsTable.createdAt, since))),
      db.select({ total: count() }).from(adEventsTable).where(and(eq(adEventsTable.adId, id), eq(adEventsTable.eventType, "click"), gte(adEventsTable.createdAt, since))),
      db.select({
        date: sql<string>`to_char(${adEventsTable.createdAt}::date, 'YYYY-MM-DD')`,
        impressions: sql<number>`SUM(CASE WHEN ${adEventsTable.eventType} = 'impression' THEN 1 ELSE 0 END)::int`,
        clicks: sql<number>`SUM(CASE WHEN ${adEventsTable.eventType} = 'click' THEN 1 ELSE 0 END)::int`,
      }).from(adEventsTable).where(and(eq(adEventsTable.adId, id), gte(adEventsTable.createdAt, since)))
        .groupBy(sql`${adEventsTable.createdAt}::date`).orderBy(desc(sql`${adEventsTable.createdAt}::date`)).limit(30),
    ]);

    res.json({
      ad,
      impressions: ad.impressions,
      clicks: ad.clicks,
      periodImpressions: impressions[0]?.total ?? 0,
      periodClicks: clicks[0]?.total ?? 0,
      ctr: impressions[0]?.total ? ((clicks[0]?.total ?? 0) / impressions[0].total * 100).toFixed(2) + "%" : "0%",
      dailyEvents: dailyEvents.reverse(),
    });
  } catch (error) { next(error); }
});

export default router;
