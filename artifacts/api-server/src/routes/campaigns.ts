import { Router } from "express";
import { db, campaignsTable, adPlacementsTable, contentLabelsTable } from "@workspace/db";
import { and, eq, desc, count, sql, gte, lte, isNull, or } from "drizzle-orm";
import { requireAdmin, requireAdminMutation } from "../lib/auth";
import { rateLimit, adminMutationRateLimit } from "../lib/rate-limit";

const router = Router();

router.get("/admin/campaigns", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const where = [];
    if (status) where.push(eq(campaignsTable.status, status as any));
    if (type) where.push(eq(campaignsTable.type, type));
    const conditions = where.length > 0 ? and(...where) : undefined;

    const [totalResult] = await db.select({ total: count() }).from(campaignsTable).where(conditions);
    const total = totalResult?.total ?? 0;
    const items = await db.select().from(campaignsTable)
      .where(conditions)
      .orderBy(desc(campaignsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) { next(error); }
});

router.get("/admin/campaigns/stats", requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [statusCounts, typeCounts, totalBudget, totalSpend] = await Promise.all([
      db.select({ status: campaignsTable.status, total: count() }).from(campaignsTable).groupBy(campaignsTable.status),
      db.select({ type: campaignsTable.type, total: count() }).from(campaignsTable).groupBy(campaignsTable.type),
      db.select({ budget: sql<string>`COALESCE(SUM(${campaignsTable.budget}::numeric), 0)`, spend: sql<string>`COALESCE(SUM(${campaignsTable.spend}::numeric), 0)` }).from(campaignsTable),
      db.select({ impressions: sql<number>`COALESCE(SUM(${campaignsTable.actualImpressions}), 0)::int`, clicks: sql<number>`COALESCE(SUM(${campaignsTable.actualClicks}), 0)::int` }).from(campaignsTable),
    ]);

    res.json({ statusCounts, typeCounts, totalBudget: totalBudget[0]?.budget ?? "0", totalSpend: totalBudget[0]?.spend ?? "0", totalImpressions: totalSpend[0]?.impressions ?? 0, totalClicks: totalSpend[0]?.clicks ?? 0 });
  } catch (error) { next(error); }
});

router.get("/admin/campaigns/:id", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id)).limit(1);
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const [ads, labels] = await Promise.all([
      db.select().from(adPlacementsTable).where(eq(adPlacementsTable.campaignId, id)).orderBy(desc(adPlacementsTable.createdAt)),
      db.select().from(contentLabelsTable).where(eq(contentLabelsTable.campaignId, id)).orderBy(desc(contentLabelsTable.createdAt)),
    ]);

    res.json({ ...campaign, ads, labels });
  } catch (error) { next(error); }
});

router.post("/admin/campaigns", requireAdminMutation, rateLimit({ windowMs: 60_000, max: 20 }), async (req, res, next): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 300) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : null;
    const type = typeof body.type === "string" ? body.type.trim().slice(0, 50) : "partner";
    const status = typeof body.status === "string" ? body.status.trim() : "draft";
    const partnerId = Number.isInteger(body.partnerId) ? Number(body.partnerId) : null;
    const budget = typeof body.budget === "string" ? body.budget : null;
    const targetImpressions = Number.isInteger(body.targetImpressions) ? Number(body.targetImpressions) : null;
    const targetClicks = Number.isInteger(body.targetClicks) ? Number(body.targetClicks) : null;
    const startsAt = body.startsAt ? new Date(body.startsAt as string) : null;
    const endsAt = body.endsAt ? new Date(body.endsAt as string) : null;
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;

    if (!name) { res.status(400).json({ error: "name is required" }); return; }

    const validStatuses = ["draft", "active", "paused", "completed", "archived"];
    const statusClean = validStatuses.includes(status) ? status : "draft";

    const user = res.locals.user as { id: number };

    const [created] = await db.insert(campaignsTable).values({
      name, description, type, status: statusClean as any, partnerId,
      budget, targetImpressions, targetClicks,
      startsAt: startsAt && !isNaN(startsAt.getTime()) ? startsAt : null,
      endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : null,
      metadata: metadata as any,
      createdBy: user.id,
    }).returning();

    res.status(201).json(created);
  } catch (error) { next(error); }
});

router.patch("/admin/campaigns/:id", requireAdminMutation, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = String(body.name).trim().slice(0, 300);
    if (body.description !== undefined) updates.description = body.description ? String(body.description).trim().slice(0, 2000) : null;
    if (body.type !== undefined) updates.type = String(body.type).trim().slice(0, 50);
    if (body.status !== undefined) {
      const validStatuses = ["draft", "active", "paused", "completed", "archived"];
      const s = String(body.status).trim();
      if (validStatuses.includes(s)) updates.status = s;
    }
    if (body.partnerId !== undefined) updates.partnerId = Number.isInteger(body.partnerId) ? body.partnerId : null;
    if (body.budget !== undefined) updates.budget = body.budget !== null ? String(body.budget) : null;
    if (body.targetImpressions !== undefined) updates.targetImpressions = Number.isInteger(body.targetImpressions) ? body.targetImpressions : null;
    if (body.targetClicks !== undefined) updates.targetClicks = Number.isInteger(body.targetClicks) ? body.targetClicks : null;
    if (body.startsAt !== undefined) {
      const d = new Date(body.startsAt as string);
      updates.startsAt = !isNaN(d.getTime()) ? d : null;
    }
    if (body.endsAt !== undefined) {
      const d = new Date(body.endsAt as string);
      updates.endsAt = !isNaN(d.getTime()) ? d : null;
    }
    if (body.metadata !== undefined) updates.metadata = body.metadata as any;

    const [updated] = await db.update(campaignsTable).set(updates).where(eq(campaignsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Campaign not found" }); return; }
    res.json(updated);
  } catch (error) { next(error); }
});

router.delete("/admin/campaigns/:id", requireAdminMutation, adminMutationRateLimit, async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [deleted] = await db.delete(campaignsTable).where(eq(campaignsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Campaign not found" }); return; }
    res.status(204).send();
  } catch (error) { next(error); }
});

export default router;
