import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { db, commentsTable, newsTable, usersTable } from "@workspace/db";
import { eq, and, desc, count, sql, asc } from "drizzle-orm";
import { requireUser, hasAdminToken, requireAdminOrRole, requireAdminMutation, getSessionUser } from "../lib/auth";
import { sanitizeHtml } from "../lib/sanitize";
import { rateLimit, adminMutationRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();
const publicRateLimit = rateLimit({ windowMs: 60_000, max: 60 });

function requireUserOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (hasAdminToken(req)) return next();
  void requireUser(req, res, next);
}

router.get("/comments/:newsId", publicRateLimit, async (req, res, next) => {
  try {
    const newsId = Number(req.params.newsId);
    if (!Number.isInteger(newsId) || newsId <= 0) {
      res.status(400).json({ error: "Invalid newsId" });
      return;
    }

    const parentId = req.query.parent_id != null ? Number(req.query.parent_id) : null;
    if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
      res.status(400).json({ error: "Invalid parent_id" });
      return;
    }

    const conditions = [
      eq(commentsTable.newsId, newsId),
      eq(commentsTable.approved, true),
      eq(commentsTable.removed, false),
    ];
    if (parentId !== null) {
      conditions.push(eq(commentsTable.parentId, parentId));
    } else {
      conditions.push(sql`${commentsTable.parentId} IS NULL`);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 50), 200);
    const offset = (page - 1) * pageSize;

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: commentsTable.id,
          userId: commentsTable.userId,
          authorName: commentsTable.authorName,
          body: commentsTable.body,
          createdAt: commentsTable.createdAt,
        })
        .from(commentsTable)
        .where(and(...conditions))
        .orderBy(asc(commentsTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(commentsTable).where(and(...conditions)),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    res.json({
      items: rows,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/comments/:newsId", publicRateLimit, async (req, res, next) => {
  try {
    const newsId = Number(req.params.newsId);
    if (!Number.isInteger(newsId) || newsId <= 0) {
      res.status(400).json({ error: "Invalid newsId" });
      return;
    }

    const { body, authorName, authorEmail, parentId } = req.body as {
      body?: string;
      authorName?: string;
      authorEmail?: string;
      parentId?: number;
    };

    if (typeof body !== "string" || body.length < 1 || body.length > 2000) {
      res.status(400).json({ error: "Body must be 1-2000 characters" });
      return;
    }
    if (typeof authorName !== "string" || authorName.length < 1 || authorName.length > 100) {
      res.status(400).json({ error: "Author name must be 1-100 characters" });
      return;
    }
    if (typeof authorEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }
    if (parentId !== undefined && parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
      res.status(400).json({ error: "Invalid parentId" });
      return;
    }

    const [news] = await db
      .select({ id: newsTable.id })
      .from(newsTable)
      .where(eq(newsTable.id, newsId));
    if (!news) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    if (parentId != null) {
      const [parentComment] = await db
        .select({ id: commentsTable.id, newsId: commentsTable.newsId })
        .from(commentsTable)
        .where(eq(commentsTable.id, parentId));
      if (!parentComment || parentComment.newsId !== newsId) {
        res.status(400).json({ error: "Invalid parentId: parent comment does not belong to this article" });
        return;
      }
    }

    const session = await getSessionUser(req as Request);
    const userId = session?.user?.id ?? null;

    const [comment] = await db
      .insert(commentsTable)
      .values({
        newsId,
        userId,
        body: sanitizeHtml(body),
        authorName,
        authorEmail,
        parentId: parentId ?? null,
        approved: userId !== null, // guest comments require moderation
      })
      .returning();

    res.status(201).json({ id: comment.id });
  } catch (error) {
    next(error);
  }
});

router.delete("/comments/:commentId", requireUserOrAdmin, async (req, res, next) => {
  try {
    const commentId = Number(req.params.commentId);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      res.status(400).json({ error: "Invalid commentId" });
      return;
    }

    const user = res.locals.user as typeof usersTable.$inferSelect | undefined;
    const isAdmin = hasAdminToken(req as Request);

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(commentsTable)
        .where(eq(commentsTable.id, commentId))
        .for("update");

      if (!existing) return { notFound: true };

      if (!isAdmin && existing.userId !== user?.id) return { notAuthorized: true };

      await tx.delete(commentsTable).where(eq(commentsTable.id, commentId));
      return { success: true };
    });

    if (result.notFound) { res.status(404).json({ error: "Comment not found" }); return; }
    if (result.notAuthorized) { res.status(403).json({ error: "Not authorized to delete this comment" }); return; }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

router.post("/comments/:commentId/report", publicRateLimit, async (req, res, next) => {
  try {
    const commentId = Number(req.params.commentId);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      res.status(400).json({ error: "Invalid commentId" });
      return;
    }

    const { reason } = req.body as { reason?: string };
    if (typeof reason !== "string" || reason.length < 1) {
      res.status(400).json({ error: "Reason is required" });
      return;
    }

    const trimmedReason = reason.trim().slice(0, 500);

    const [existing] = await db
      .select()
      .from(commentsTable)
      .where(eq(commentsTable.id, commentId));

    if (!existing) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    if (existing.reported) {
      res.json({ success: true });
      return;
    }

    await db
      .update(commentsTable)
      .set({ reported: true, reportReason: sanitizeHtml(trimmedReason), updatedAt: new Date() })
      .where(eq(commentsTable.id, commentId));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/comments", requireAdminOrRole("admin", "editor"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (req.query.reported === "true") {
      conditions.push(eq(commentsTable.reported, true));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: commentsTable.id,
          userId: commentsTable.userId,
          newsId: commentsTable.newsId,
          body: commentsTable.body,
          authorName: commentsTable.authorName,
          authorEmail: commentsTable.authorEmail,
          reported: commentsTable.reported,
          reportReason: commentsTable.reportReason,
          approved: commentsTable.approved,
          removed: commentsTable.removed,
          createdAt: commentsTable.createdAt,
          updatedAt: commentsTable.updatedAt,
          articleTitle: newsTable.title,
        })
        .from(commentsTable)
        .leftJoin(newsTable, eq(commentsTable.newsId, newsTable.id))
        .where(whereClause)
        .orderBy(desc(commentsTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(commentsTable).where(whereClause),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    res.json({
      items: rows,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/comments/:commentId", requireAdminMutation, adminMutationRateLimit, async (req, res, next) => {
  try {
    const commentId = Number(req.params.commentId);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      res.status(400).json({ error: "Invalid commentId" });
      return;
    }

    const { approved, removed } = req.body as { approved?: unknown; removed?: unknown };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (approved !== undefined) {
      if (typeof approved !== "boolean") { res.status(400).json({ error: "approved must be a boolean" }); return; }
      updateData.approved = approved;
    }
    if (removed !== undefined) {
      if (typeof removed !== "boolean") { res.status(400).json({ error: "removed must be a boolean" }); return; }
      updateData.removed = removed;
    }

    if (Object.keys(updateData).length === 1) {
      res.status(400).json({ error: "At least one field (approved, removed) is required" });
      return;
    }

    const [updated] = await db
      .update(commentsTable)
      .set(updateData)
      .where(eq(commentsTable.id, commentId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
