import { Router } from "express";
import { db, contentLabelsTable } from "@workspace/db";
import { and, eq, desc, count, sql, gte, lte, isNull, or } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { rateLimit, adminMutationRateLimit } from "../lib/rate-limit";

const router = Router();

router.get("/admin/content-labels", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const labelType = typeof req.query.labelType === "string" ? req.query.labelType : undefined;
    const activeOnly = req.query.activeOnly === "true";

    const where = [];
    if (labelType) where.push(eq(contentLabelsTable.labelType, labelType as any));
    if (activeOnly) where.push(eq(contentLabelsTable.active, true));

    const conditions = where.length > 0 ? and(...where) : undefined;

    const [totalResult] = await db.select({ total: count() }).from(contentLabelsTable).where(conditions);
    const total = totalResult?.total ?? 0;

    const items = await db.select().from(contentLabelsTable)
      .where(conditions)
      .orderBy(desc(contentLabelsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) { next(error); }
});

router.get("/content-labels/:newsId", async (req, res, next): Promise<void> => {
  try {
    const newsId = Number(req.params.newsId);
    if (!Number.isInteger(newsId) || newsId <= 0) { res.status(400).json({ error: "Invalid news ID" }); return; }

    const now = new Date();
    const items = await db.select().from(contentLabelsTable)
      .where(and(
        eq(contentLabelsTable.newsId, newsId),
        eq(contentLabelsTable.active, true),
        or(
          isNull(contentLabelsTable.startsAt),
          lte(contentLabelsTable.startsAt, now),
        ),
        or(
          isNull(contentLabelsTable.expiresAt),
          gte(contentLabelsTable.expiresAt, now),
        ),
      ))
      .orderBy(desc(contentLabelsTable.labelType));

    res.json({ items });
  } catch (error) { next(error); }
});

router.post("/admin/content-labels", requireAdmin, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res, next): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const newsId = Number.isInteger(body.newsId) ? Number(body.newsId) : null;
    const labelType = typeof body.labelType === "string" ? body.labelType.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 200) : null;
    const url = typeof body.url === "string" ? body.url.trim().slice(0, 500) : null;
    const active = typeof body.active === "boolean" ? body.active : true;
    const partnerId = Number.isInteger(body.partnerId) ? Number(body.partnerId) : null;
    const campaignId = Number.isInteger(body.campaignId) ? Number(body.campaignId) : null;
    const startsAt = body.startsAt ? new Date(body.startsAt as string) : null;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt as string) : null;
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;

    const validTypes = ["sponsored", "promoted", "premium", "campaign", "partner_promo", "house_ad", "affiliate", "featured_sponsor"];
    if (!validTypes.includes(labelType)) {
      res.status(400).json({ error: `labelType must be one of: ${validTypes.join(", ")}` });
      return;
    }

    const user = res.locals.user as { id: number };

    const [created] = await db.insert(contentLabelsTable).values({
      newsId,
      labelType: labelType as any,
      label,
      url,
      active,
      partnerId,
      campaignId,
      startsAt: startsAt && !isNaN(startsAt.getTime()) ? startsAt : null,
      expiresAt: expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt : null,
      metadata: metadata as any,
      createdBy: user.id,
    }).returning();

    res.status(201).json(created);
  } catch (error) { next(error); }
});

router.patch("/admin/content-labels/:id", requireAdmin, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const validLabelTypes = ["sponsored", "promoted", "premium", "campaign", "partner_promo", "house_ad", "affiliate", "featured_sponsor"];
    if (body.labelType !== undefined) {
      const lt = String(body.labelType).trim();
      if (!validLabelTypes.includes(lt)) { res.status(400).json({ error: `Invalid labelType. Must be one of: ${validLabelTypes.join(", ")}` }); return; }
      updates.labelType = lt;
    }
    if (body.label !== undefined) updates.label = body.label ? String(body.label).trim().slice(0, 200) : null;
    if (body.url !== undefined) updates.url = body.url ? String(body.url).trim().slice(0, 500) : null;
    if (body.active !== undefined) updates.active = Boolean(body.active);
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
    if (body.metadata !== undefined) updates.metadata = body.metadata as any;

    const [updated] = await db.update(contentLabelsTable).set(updates).where(eq(contentLabelsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Content label not found" }); return; }
    res.json(updated);
  } catch (error) { next(error); }
});

router.delete("/admin/content-labels/:id", requireAdmin, adminMutationRateLimit, async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [deleted] = await db.delete(contentLabelsTable).where(eq(contentLabelsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Content label not found" }); return; }
    res.status(204).send();
  } catch (error) { next(error); }
});

export default router;
