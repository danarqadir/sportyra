import { Router } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { requireUser, getSessionUser } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

const router = Router();

router.post("/push/subscribe", rateLimit({ windowMs: 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
    const p256dh = typeof req.body?.p256dh === "string" ? req.body.p256dh.trim() : "";
    const authKey = typeof req.body?.auth === "string" ? req.body.auth.trim() : "";
    if (!endpoint || !p256dh || !authKey) {
      res.status(400).json({ error: "Missing required push subscription fields." });
      return;
    }
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== "https:" && parsed.protocol !== "wss:") {
        res.status(400).json({ error: "Push endpoint must use HTTPS or WSS protocol." });
        return;
      }
    } catch {
      res.status(400).json({ error: "Invalid push endpoint URL." });
      return;
    }
    let userId: number | null = null;
    try {
      const session = await getSessionUser(req);
      if (session) userId = session.user.id;
    } catch { /* optional */ }

    await db.insert(pushSubscriptionsTable).values({
      endpoint,
      p256dh,
      auth: authKey,
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
      userId,
    }).onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { lastUsedAt: new Date(), userId, userAgent: req.get("user-agent")?.slice(0, 500) ?? null },
    });
    res.status(201).json({ subscribed: true });
  } catch (error) {
    next(error);
  }
});

router.post("/push/unsubscribe", rateLimit({ windowMs: 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
    if (!endpoint) {
      res.status(400).json({ error: "Endpoint is required." });
      return;
    }
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/push/status", async (req, res, next): Promise<void> => {
  try {
    const endpoint = typeof req.query?.endpoint === "string" ? (req.query.endpoint as string).trim() : "";
    if (!endpoint) {
      res.json({ subscribed: false });
      return;
    }
    const [existing] = await db.select({ id: pushSubscriptionsTable.id }).from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint)).limit(1);
    res.json({ subscribed: Boolean(existing) });
  } catch (error) {
    next(error);
  }
});

router.delete("/push/subscriptions", requireUser, async (req, res, next): Promise<void> => {
  try {
    const user = res.locals.user as { id: number };
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, user.id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
