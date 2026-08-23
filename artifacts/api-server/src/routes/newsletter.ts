import { Router, type IRouter } from "express";
import { rateLimit } from "../lib/rate-limit";
import { eq } from "drizzle-orm";
import { db, subscribersTable } from "@workspace/db";
import { SubscribeNewsletterBody, SubscribeNewsletterResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/newsletter/subscribe", rateLimit({ windowMs: 60_000, max: 8 }), async (req, res): Promise<void> => {
  const parsed = SubscribeNewsletterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: subscribersTable.id })
    .from(subscribersTable)
    .where(eq(subscribersTable.email, normalizedEmail))
    .limit(1);
  const alreadySubscribed = Boolean(existing);

  if (!alreadySubscribed) {
    await db.insert(subscribersTable).values({ email: normalizedEmail }).onConflictDoNothing();
  }

  res.json(SubscribeNewsletterResponse.parse({ subscribed: true, alreadySubscribed }));
});

export default router;