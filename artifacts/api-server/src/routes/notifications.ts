import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { addNotificationClient } from "../lib/notifications";
import { requireUser } from "../lib/auth";

const router = Router();

router.get("/notifications/stream", requireUser, async (req, res) => {
  const user = res.locals.user as { id: number };
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);
  const accepted = addNotificationClient(res, user.id);
  if (!accepted) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Too many connections" })}\n\n`);
    res.end();
    return;
  }
  const heartbeat = setInterval(() => res.write(`event: ping\ndata: {}\n\n`), 25_000);
  res.on("close", () => clearInterval(heartbeat));
});

router.get("/user/notifications/count", requireUser, async (req, res) => {
  try {
    const user = res.locals.user as { id: number };
    const [totalResult] = await db.select({ total: count() }).from(notificationsTable).where(eq(notificationsTable.userId, user.id));
    const [unreadResult] = await db.select({ unread: count() }).from(notificationsTable).where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false)));
    res.json({ total: totalResult.total ?? 0, unread: unreadResult.unread ?? 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notification count" });
  }
});

export default router;
