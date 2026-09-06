import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { requireUser } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

const router = Router();

router.post("/push/subscribe", requireUser, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const user = res.locals.user as { id: number };
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

    // Ownership is derived from the authenticated session, never from the request
    // body. An endpoint already owned by a different user cannot be taken over.
    const [existing] = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint))
      .limit(1);
    if (existing && existing.userId !== null && existing.userId !== user.id) {
      res.status(409).json({ error: "Push endpoint is already registered to another account." });
      return;
    }

    await db
      .insert(pushSubscriptionsTable)
      .values({
        endpoint,
        p256dh,
        auth: authKey,
        userId: user.id,
        userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: {
          p256dh,
          auth: authKey,
          userId: user.id,
          lastUsedAt: new Date(),
          userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
        },
      });
    res.status(201).json({ subscribed: true });
  } catch (error) {
    next(error);
  }
});

router.post("/push/unsubscribe", requireUser, rateLimit({ windowMs: 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const user = res.locals.user as { id: number };
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
    if (!endpoint) {
      res.status(400).json({ error: "Endpoint is required." });
      return;
    }
    // Only the authenticated user's own subscription is removed.
    await db
      .delete(pushSubscriptionsTable)
      .where(and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.userId, user.id)));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/push/status", requireUser, async (req, res, next): Promise<void> => {
  try {
    const user = res.locals.user as { id: number };
    const endpoint = typeof req.query?.endpoint === "string" ? (req.query.endpoint as string).trim() : "";
    if (!endpoint) {
      res.json({ subscribed: false });
      return;
    }
    // Reports only whether the authenticated user owns this endpoint; it never
    // reveals another user's subscription state.
    const [existing] = await db
      .select({ id: pushSubscriptionsTable.id })
      .from(pushSubscriptionsTable)
      .where(and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.userId, user.id)))
      .limit(1);
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