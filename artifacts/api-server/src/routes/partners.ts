import { Router } from "express";
import { and, eq, sql, desc } from "drizzle-orm";
import { db, partnersTable, referralLinksTable, referralClicksTable, referralEventsTable, creatorEarningsLedgerTable, payoutsTable } from "@workspace/db";
import { hasAdminToken } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import crypto from "node:crypto";

const router = Router();

function generateReferralCode(): string {
  return `sr_${crypto.randomBytes(6).toString("base64url")}`;
}

function hashFingerprint(fp: string): string {
  return crypto.createHash("sha256").update(fp).digest("hex").slice(0, 16);
}

function getIp(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : null) || req.socket?.remoteAddress || "";
}

router.post("/ref/:code", rateLimit({ windowMs: 60_000, max: 60 }), async (req, res, next): Promise<void> => {
  try {
    const code = req.params.code;
    if (!code || code.length > 100) { res.status(400).json({ error: "Invalid referral code" }); return; }
    const [partner] = await db.select().from(partnersTable).where(and(eq(partnersTable.referralCode, code), eq(partnersTable.status, "active"))).limit(1);
    if (!partner) { res.status(404).json({ error: "Referral code not found" }); return; }
    const ip = getIp(req);
    const userAgent = (req.headers["user-agent"] as string) || "";
    const referer = (req.headers["referer"] as string) || "";
    const targetUrl = req.query.url as string || "/";
    const body = req.body as Record<string, unknown> | undefined;
    const rawFingerprint = (body?.fingerprint as string) || "";
    const fingerprint = rawFingerprint ? hashFingerprint(rawFingerprint) : null;

    if (fingerprint) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [recentClick] = await db.select({ id: referralClicksTable.id }).from(referralClicksTable)
        .where(and(eq(referralClicksTable.partnerId, partner.id), eq(referralClicksTable.fingerprint, fingerprint), sql`${referralClicksTable.createdAt} > ${cutoff}`))
        .limit(1);
      if (recentClick) { res.json({ ok: true, deduplicated: true }); return; }
    }

    await db.insert(referralClicksTable).values({ partnerId: partner.id, code, ipAddress: ip, userAgent, referer, fingerprint });
    await db.insert(referralEventsTable).values({ partnerId: partner.id, eventType: "click", ipAddress: ip, userAgent, referer, targetUrl });

    const rate = parseFloat(partner.commissionRate) / 100;
    const earningAmount = (rate * 0.01).toFixed(2);
    if (parseFloat(earningAmount) > 0) {
      await db.insert(creatorEarningsLedgerTable).values({ partnerId: partner.id, amount: earningAmount, type: "click", description: `Click from ${ip || "unknown"}` });
      await db.update(partnersTable).set({ totalClicks: sql`${partnersTable.totalClicks} + 1`, totalEarnings: sql`${partnersTable.totalEarnings} + ${earningAmount}`, updatedAt: new Date() }).where(eq(partnersTable.id, partner.id));
    } else {
      await db.update(partnersTable).set({ totalClicks: sql`${partnersTable.totalClicks} + 1`, updatedAt: new Date() }).where(eq(partnersTable.id, partner.id));
    }

    res.json({ ok: true, redirect: targetUrl });
  } catch (error) { next(error); }
});

router.get("/partners/me", async (req, res, next): Promise<void> => {
  try {
    const partnerId = req.headers["x-partner-id"] ? Number(req.headers["x-partner-id"]) : null;
    if (!partnerId) { res.status(401).json({ error: "Partner authentication required" }); return; }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId)).limit(1);
    if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
    res.json(partner);
  } catch (error) { next(error); }
});

router.get("/partners/stats", async (req, res, next): Promise<void> => {
  try {
    const partnerId = req.headers["x-partner-id"] ? Number(req.headers["x-partner-id"]) : null;
    if (!partnerId) { res.status(401).json({ error: "Partner authentication required" }); return; }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId)).limit(1);
    if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

    const [earningsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${creatorEarningsLedgerTable.amount}::numeric), 0)` }).from(creatorEarningsLedgerTable).where(eq(creatorEarningsLedgerTable.partnerId, partnerId));
    const [clickCountResult] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(eq(referralClicksTable.partnerId, partnerId));

    const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [recentClicks] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(and(eq(referralClicksTable.partnerId, partnerId), sql`${referralClicksTable.createdAt} > ${last7days}`));

    res.json({
      partnerId: partner.id,
      name: partner.name,
      referralCode: partner.referralCode,
      status: partner.status,
      totalClicks: clickCountResult?.total || 0,
      totalEarnings: earningsResult?.total || "0",
      paidEarnings: partner.paidEarnings,
      recentClicks: recentClicks?.total || 0,
      commissionRate: partner.commissionRate,
      createdAt: partner.createdAt,
    });
  } catch (error) { next(error); }
});

router.get("/partners/clicks", async (req, res, next): Promise<void> => {
  try {
    const partnerId = req.headers["x-partner-id"] ? Number(req.headers["x-partner-id"]) : null;
    if (!partnerId) { res.status(401).json({ error: "Partner authentication required" }); return; }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const clicks = await db.select().from(referralClicksTable).where(eq(referralClicksTable.partnerId, partnerId)).orderBy(desc(referralClicksTable.createdAt)).limit(limit).offset(offset);
    const [countResult] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(eq(referralClicksTable.partnerId, partnerId));
    res.json({ items: clicks, total: countResult?.total || 0 });
  } catch (error) { next(error); }
});

router.get("/partners/earnings", async (req, res, next): Promise<void> => {
  try {
    const partnerId = req.headers["x-partner-id"] ? Number(req.headers["x-partner-id"]) : null;
    if (!partnerId) { res.status(401).json({ error: "Partner authentication required" }); return; }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const earnings = await db.select().from(creatorEarningsLedgerTable).where(eq(creatorEarningsLedgerTable.partnerId, partnerId)).orderBy(desc(creatorEarningsLedgerTable.createdAt)).limit(limit);
    const [sumResult] = await db.select({ total: sql<string>`COALESCE(SUM(${creatorEarningsLedgerTable.amount}::numeric), 0)` }).from(creatorEarningsLedgerTable).where(eq(creatorEarningsLedgerTable.partnerId, partnerId));
    res.json({ items: earnings, total: sumResult?.total || "0" });
  } catch (error) { next(error); }
});

router.post("/partners/referral-link", async (req, res, next): Promise<void> => {
  try {
    const partnerId = req.headers["x-partner-id"] ? Number(req.headers["x-partner-id"]) : null;
    if (!partnerId) { res.status(401).json({ error: "Partner authentication required" }); return; }
    const body = req.body as Record<string, unknown> | undefined;
    const targetUrl = (body?.targetUrl as string) || "/";
    const label = (body?.label as string) || null;
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId)).limit(1);
    if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
    const [link] = await db.insert(referralLinksTable).values({ partnerId, code: partner.referralCode, targetUrl, label }).returning();
    res.status(201).json(link);
  } catch (error) { next(error); }
});

router.get("/admin/partners", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const partners = await db.select().from(partnersTable).orderBy(desc(partnersTable.createdAt)).limit(limit);
    res.json({ items: partners, total: partners.length });
  } catch (error) { next(error); }
});

router.post("/admin/partners", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const body = req.body as Record<string, unknown>;
    const name = (body.name as string || "").trim();
    const email = (body.email as string || "").trim();
    const website = (body.website as string) || null;
    const socialHandle = (body.social_handle as string) || null;
    const commissionRate = (body.commission_rate as string) || "10.00";
    if (!name || !email) { res.status(400).json({ error: "Name and email are required" }); return; }
    const referralCode = generateReferralCode();
    const [partner] = await db.insert(partnersTable).values({ name, email, referralCode, website, socialHandle, commissionRate }).returning();
    res.status(201).json(partner);
  } catch (error) { next(error); }
});

router.patch("/admin/partners/:id", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.website !== undefined) updates.website = body.website;
    if (body.social_handle !== undefined) updates.socialHandle = body.social_handle;
    if (body.commission_rate !== undefined) updates.commissionRate = body.commission_rate;
    if (body.status !== undefined) updates.status = body.status;
    const [updated] = await db.update(partnersTable).set(updates).where(eq(partnersTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Partner not found" }); return; }
    res.json(updated);
  } catch (error) { next(error); }
});

router.patch("/admin/partners/:id/deactivate", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const [updated] = await db.update(partnersTable).set({ status: "inactive", updatedAt: new Date() }).where(eq(partnersTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Partner not found" }); return; }
    res.json(updated);
  } catch (error) { next(error); }
});

router.get("/admin/partners/stats", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const [totalPartners] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(partnersTable);
    const [activePartners] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(partnersTable).where(eq(partnersTable.status, "active"));
    const [totalClicks] = await db.select({ total: sql<string>`COALESCE(SUM(${partnersTable.totalClicks}), 0)` }).from(partnersTable);
    const [totalEarnings] = await db.select({ total: sql<string>`COALESCE(SUM(${partnersTable.totalEarnings}::numeric), 0)` }).from(partnersTable);
    const [totalPaid] = await db.select({ total: sql<string>`COALESCE(SUM(${partnersTable.paidEarnings}::numeric), 0)` }).from(partnersTable);
    res.json({
      totalPartners: totalPartners?.total || 0,
      activePartners: activePartners?.total || 0,
      totalClicks: totalClicks?.total || 0,
      totalEarnings: totalEarnings?.total || "0",
      totalPaid: totalPaid?.total || "0",
    });
  } catch (error) { next(error); }
});

router.get("/admin/partners/:id/clicks", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const clicks = await db.select().from(referralClicksTable).where(eq(referralClicksTable.partnerId, id)).orderBy(desc(referralClicksTable.createdAt)).limit(limit);
    res.json({ items: clicks, total: clicks.length });
  } catch (error) { next(error); }
});

router.get("/admin/partners/:id/earnings", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const earnings = await db.select().from(creatorEarningsLedgerTable).where(eq(creatorEarningsLedgerTable.partnerId, id)).orderBy(desc(creatorEarningsLedgerTable.createdAt)).limit(limit);
    res.json({ items: earnings, total: earnings.length });
  } catch (error) { next(error); }
});

router.post("/admin/partners/payouts", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const body = req.body as Record<string, unknown>;
    const partnerId = Number(body.partnerId);
    const amount = String(body.amount || "0");
    const method = (body.method as string) || "manual";
    const notes = (body.notes as string) || null;
    if (!partnerId || parseFloat(amount) <= 0) { res.status(400).json({ error: "Valid partnerId and amount required" }); return; }
    const [payout] = await db.insert(payoutsTable).values({ partnerId, amount, method, notes }).returning();
    await db.update(partnersTable).set({ paidEarnings: sql`${partnersTable.paidEarnings} + ${amount}`, updatedAt: new Date() }).where(eq(partnersTable.id, partnerId));
    res.status(201).json(payout);
  } catch (error) { next(error); }
});

export default router;
