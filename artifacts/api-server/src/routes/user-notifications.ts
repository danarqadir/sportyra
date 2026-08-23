import { Router } from "express";
import { db, notificationsTable, notificationPreferencesTable, newsTable, usersTable } from "@workspace/db";
import { eq, and, desc, count, sql, or, gt } from "drizzle-orm";
import { requireUser } from "../lib/auth";

const router = Router();

router.get("/user/notifications", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };
    const conditions = [eq(notificationsTable.userId, user.id)];

    if (req.query.unread === "true") {
      conditions.push(eq(notificationsTable.read, false));
    }

    const whereClause = and(...conditions);

    const [rows, totalRows, unreadRows] = await Promise.all([
      db
        .select({
          id: notificationsTable.id,
          type: notificationsTable.type,
          title: notificationsTable.title,
          message: notificationsTable.message,
          link: notificationsTable.link,
          read: notificationsTable.read,
          createdAt: notificationsTable.createdAt,
        })
        .from(notificationsTable)
        .where(whereClause)
        .orderBy(desc(notificationsTable.createdAt)),
      db.select({ total: count() }).from(notificationsTable).where(whereClause),
      db
        .select({ total: count() })
        .from(notificationsTable)
        .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false))),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    const unreadCount = Number(unreadRows[0]?.total ?? 0);

    res.json({ items: rows, total, unreadCount });
  } catch (error) {
    next(error);
  }
});

router.patch("/user/notifications/:notificationId/read", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };
    const notificationId = Number(req.params.notificationId);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      res.status(400).json({ error: "Invalid notificationId" });
      return;
    }

    const [existing] = await db
      .select()
      .from(notificationsTable)
      .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, user.id)));

    if (!existing) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.id, notificationId));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/user/notifications/read-all", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };

    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false)));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get("/user/notifications/count", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };

    const [totalRow, unreadRow] = await Promise.all([
      db
        .select({ total: count() })
        .from(notificationsTable)
        .where(eq(notificationsTable.userId, user.id)),
      db
        .select({ total: count() })
        .from(notificationsTable)
        .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false))),
    ]);

    res.json({
      total: Number(totalRow[0]?.total ?? 0),
      unread: Number(unreadRow[0]?.total ?? 0),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/user/notification-preferences", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };

    let [prefs] = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, user.id));

    if (!prefs) {
      [prefs] = await db
        .insert(notificationPreferencesTable)
        .values({ userId: user.id })
        .returning();
    }

    res.json(prefs);
  } catch (error) {
    next(error);
  }
});

router.put("/user/notification-preferences", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };
    const { newArticles, importantNews, weeklyDigest, emailNotifications, pushNotifications } = req.body as {
      newArticles?: boolean;
      importantNews?: boolean;
      weeklyDigest?: boolean;
      emailNotifications?: boolean;
      pushNotifications?: boolean;
    };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (newArticles !== undefined) updateData.newArticles = newArticles;
    if (importantNews !== undefined) updateData.importantNews = importantNews;
    if (weeklyDigest !== undefined) updateData.weeklyDigest = weeklyDigest;
    if (emailNotifications !== undefined) updateData.emailNotifications = emailNotifications;
    if (pushNotifications !== undefined) updateData.pushNotifications = pushNotifications;

    if (Object.keys(updateData).length === 1) {
      res.status(400).json({ error: "At least one preference field is required" });
      return;
    }

    let [existing] = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, user.id));

    if (!existing) {
      [existing] = await db
        .insert(notificationPreferencesTable)
        .values({ userId: user.id, ...updateData })
        .returning();
    } else {
      [existing] = await db
        .update(notificationPreferencesTable)
        .set(updateData)
        .where(eq(notificationPreferencesTable.userId, user.id))
        .returning();
    }

    res.json(existing);
  } catch (error) {
    next(error);
  }
});

export default router;
