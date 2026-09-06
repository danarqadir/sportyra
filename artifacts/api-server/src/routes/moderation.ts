import { Router } from "express";
import { db, moderationReportsTable, auditLogTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { requireUser, hasAdminToken, requireAdminOrRole, requireAdminMutation } from "../lib/auth";
import { rateLimit, adminMutationRateLimit } from "../lib/rate-limit";
import { sanitizeHtml } from "../lib/sanitize";

const router = Router();
const reportRateLimit = rateLimit({ windowMs: 60_000, max: 5 });

router.post("/moderation/report", reportRateLimit, requireUser, async (req, res, next) => {
  try {
    const { targetType, targetId, reason, details } = req.body as {
      targetType?: string;
      targetId?: number;
      reason?: string;
      details?: string;
    };

    if (targetType !== "article" && targetType !== "comment") {
      res.status(400).json({ error: "targetType must be 'article' or 'comment'" });
      return;
    }
    if (!Number.isInteger(targetId) || (targetId as number) <= 0) {
      res.status(400).json({ error: "Invalid targetId" });
      return;
    }
    if (typeof reason !== "string" || reason.length < 1) {
      res.status(400).json({ error: "Reason is required" });
      return;
    }

    const trimmedReason = reason.trim().slice(0, 200);
    const trimmedDetails = details ? sanitizeHtml(details.trim().slice(0, 2000)) : null;

    const user = res.locals.user as { id: number };
    const safeTargetId = targetId as number;

    const [existing] = await db
      .select({ id: moderationReportsTable.id })
      .from(moderationReportsTable)
      .where(and(
        eq(moderationReportsTable.reporterId, user.id),
        eq(moderationReportsTable.targetType, targetType),
        eq(moderationReportsTable.targetId, safeTargetId),
        eq(moderationReportsTable.status, "pending"),
      ))
      .limit(1);

    if (existing) {
      res.status(200).json({ id: existing.id, status: "pending", createdAt: new Date(), alreadyReported: true });
      return;
    }

    const [report] = await db
      .insert(moderationReportsTable)
      .values({
        reporterId: user.id,
        targetType,
        targetId: safeTargetId,
        reason: trimmedReason,
        details: trimmedDetails,
      })
      .returning();

    res.status(201).json({ id: report.id, status: report.status, createdAt: report.createdAt });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/moderation", requireAdminOrRole("admin", "editor"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (typeof req.query.status === "string" && req.query.status) {
      conditions.push(eq(moderationReportsTable.status, req.query.status));
    }
    if (typeof req.query.targetType === "string" && req.query.targetType) {
      conditions.push(eq(moderationReportsTable.targetType, req.query.targetType));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(moderationReportsTable)
        .where(whereClause)
        .orderBy(desc(moderationReportsTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(moderationReportsTable).where(whereClause),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    res.json({ items: rows, total });
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/moderation/:reportId", requireAdminMutation, adminMutationRateLimit, async (req, res, next) => {
  try {
    const reportId = Number(req.params.reportId);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      res.status(400).json({ error: "Invalid reportId" });
      return;
    }

    const { status, resolution } = req.body as { status?: unknown; resolution?: unknown };

    if (typeof status !== "string" || (status !== "reviewed" && status !== "dismissed")) {
      res.status(400).json({ error: "status must be 'reviewed' or 'dismissed'" });
      return;
    }
    if (resolution !== undefined && resolution !== null) {
      if (typeof resolution !== "string") {
        res.status(400).json({ error: "resolution must be a string" });
        return;
      }
    }

    const trimmedResolution = typeof resolution === "string" ? resolution.trim().slice(0, 2000) : null;
    const user = res.locals.user as { id: number };

    const [existing] = await db
      .select()
      .from(moderationReportsTable)
      .where(eq(moderationReportsTable.id, reportId));

    if (!existing) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    if (existing.status !== "pending") {
      res.status(400).json({ error: "Report has already been reviewed" });
      return;
    }

    const [updated] = await db
      .update(moderationReportsTable)
      .set({
        status,
        resolution: trimmedResolution,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      })
      .where(eq(moderationReportsTable.id, reportId))
      .returning();

    await db.insert(auditLogTable).values({
      userId: user.id,
      action: `moderation_${status}`,
      targetType: existing.targetType,
      targetId: existing.targetId,
      details: trimmedResolution,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.get("/admin/audit-log", requireAdminOrRole("admin", "editor"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (req.query.userId != null) {
      const userId = Number(req.query.userId);
      if (Number.isInteger(userId) && userId > 0) {
        conditions.push(eq(auditLogTable.userId, userId));
      }
    }
    if (typeof req.query.action === "string" && req.query.action) {
      conditions.push(eq(auditLogTable.action, req.query.action));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(auditLogTable)
        .where(whereClause)
        .orderBy(desc(auditLogTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(auditLogTable).where(whereClause),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    res.json({ items: rows, total });
  } catch (error) {
    next(error);
  }
});

export default router;
