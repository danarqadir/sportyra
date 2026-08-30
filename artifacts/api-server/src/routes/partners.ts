import { Router, type Request } from "express";
import { and, eq, sql, desc, gte, lte, count, ilike, or } from "drizzle-orm";
import { db, partnersTable, referralLinksTable, referralClicksTable, referralEventsTable, creatorEarningsLedgerTable, payoutsTable, usersTable, newsTable, auditLogTable } from "@workspace/db";
import { hasAdminToken, requirePartner, requirePartnerOrAdmin, generatePartnerSecret, hashPartnerSecret, ensureAdminTokenUser } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { ClientError } from "../lib/errors";
import { enrichEvent } from "../lib/enrichment";
import { evaluateFraud, type RuleContext } from "../lib/fraud-engine";
import { logger } from "../lib/logger";
import crypto from "node:crypto";
import { z } from "zod";
import { AdminPartnerCreate } from "../lib/validation";

const router = Router();

const profileRateLimit = rateLimit({ windowMs: 60_000, max: 10 });
const linkRateLimit = rateLimit({ windowMs: 60_000, max: 10 });
const adminPartnerRateLimit = rateLimit({ windowMs: 60_000, max: 30 });
const payoutRateLimit = rateLimit({ windowMs: 60_000, max: 10 });

function generateReferralCode(): string {
  return `sr_${crypto.randomBytes(6).toString("base64url")}`;
}

function hashFingerprint(fp: string): string {
  return crypto.createHash("sha256").update(fp).digest("hex").slice(0, 16);
}

function getIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : null) || req.socket?.remoteAddress || "";
}

function hashIp(ip: string): string {
  const secret = process.env["FRAUD_IP_HMAC_SECRET"];
  if (!secret) throw new Error("FRAUD_IP_HMAC_SECRET must be set in the environment");
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHmac("sha256", `${secret}:${day}`).update(ip).digest("hex").slice(0, 16);
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function computeServerFingerprint(req: Request): string {
  const parts = [
    (req.headers["user-agent"] as string) || "",
    (req.headers["accept-language"] as string) || "",
    (req.headers["accept-encoding"] as string) || "",
    (req.headers["accept"] as string) || "",
    (req.headers["sec-fetch-dest"] as string) || "",
    (req.headers["sec-fetch-mode"] as string) || "",
    (req.headers["sec-fetch-site"] as string) || "",
    (req.headers["sec-ch-ua"] as string) || "",
    (req.headers["sec-ch-ua-platform"] as string) || "",
    (req.headers["connection"] as string) || "",
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

function parseDateRange(query: Record<string, unknown>): { from: Date; to: Date } {
  const now = new Date();
  let to = typeof query.to === "string" ? new Date(query.to) : now;
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let from = typeof query.from === "string" ? new Date(query.from) : defaultFrom;
  if (isNaN(from.getTime())) from = defaultFrom;
  if (isNaN(to.getTime())) to = now;
  return { from, to };
}

router.post("/ref/:code", rateLimit({ windowMs: 60_000, max: 60 }), async (req, res, next): Promise<void> => {
  try {
    const rawCode = req.params.code;
    const code = typeof rawCode === "string" ? rawCode : Array.isArray(rawCode) ? rawCode[0] : "";
    if (!code || code.length > 100) { res.status(400).json({ error: "Invalid referral code" }); return; }
    const [partner] = await db.select().from(partnersTable).where(and(eq(partnersTable.referralCode, code), eq(partnersTable.status, "approved"))).limit(1);
    if (!partner) { res.status(404).json({ error: "Referral code not found" }); return; }
    const ip = getIp(req);
    const ipHash = hashIp(ip);
    const userAgent = (req.headers["user-agent"] as string) || "";
    const userAgentHash = userAgent ? hashValue(userAgent) : null;
    const referer = (req.headers["referer"] as string) || "";
    const targetUrl = req.query.url as string || "/";
    const utmSource = (req.query.utm_source as string) || null;
    const utmMedium = (req.query.utm_medium as string) || null;
    const utmCampaign = (req.query.utm_campaign as string) || null;
    const serverFingerprint = computeServerFingerprint(req);
    const fingerprint = serverFingerprint;

    if (fingerprint) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [recentClick] = await db.select({ id: referralClicksTable.id }).from(referralClicksTable)
        .where(and(eq(referralClicksTable.partnerId, partner.id), eq(referralClicksTable.fingerprint, fingerprint), sql`${referralClicksTable.createdAt} > ${cutoff}`))
        .limit(1);
      if (recentClick) { res.json({ ok: true, deduplicated: true }); return; }
    }

    const ipCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentIpClick] = await db.select({ id: referralClicksTable.id }).from(referralClicksTable)
      .where(and(eq(referralClicksTable.partnerId, partner.id), eq(referralClicksTable.ipAddress, ipHash), sql`${referralClicksTable.createdAt} > ${ipCutoff}`))
      .limit(1);
    if (recentIpClick) { res.json({ ok: true, deduplicated: true }); return; }

    const dailyClickCount = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable)
      .where(and(eq(referralClicksTable.partnerId, partner.id), sql`${referralClicksTable.createdAt} > CURRENT_DATE`));
    const dailyClicks = Number(dailyClickCount[0]?.total ?? 0);

    const enriched = enrichEvent(req);
    const ruleCtx: RuleContext = {
      event: enriched,
      clicksFromIp24h: dailyClicks,
      clicksFromFingerprint24h: 0,
      clicksFromPartner24h: partner.totalClicks || 0,
      uniqueIpsForFingerprint24h: 0,
      conversionRate7d: 0,
      partnerRiskScore: 0,
      method: req.method,
      path: req.path,
      hasReferer: !!referer,
      hasSecFetch: !!(req.headers["sec-fetch-dest"]),
      hasAcceptLanguage: !!(req.headers["accept-language"]),
    };
    const fraudVerdict = evaluateFraud(ruleCtx);

    if (fraudVerdict.verdict === "hard_block") {
      logger.info({ partnerId: partner.id, ipHash, score: fraudVerdict.score, reasons: fraudVerdict.reasons }, "Referral click hard-blocked by fraud engine");
      res.status(429).json({ error: "Request blocked" });
      return;
    }

    const isCredited = fraudVerdict.credited && dailyClicks < 100 && !!fingerprint;

    await db.insert(referralClicksTable).values({ partnerId: partner.id, code, ipAddress: ipHash, userAgent: userAgentHash, referer, fingerprint, targetUrl, utmSource, utmMedium, utmCampaign });
    await db.insert(referralEventsTable).values({ partnerId: partner.id, eventType: "click", ipAddress: ipHash, userAgent: userAgentHash, referer, targetUrl });

    const rate = parseFloat(partner.commissionRate) / 100;
    const earningAmount = (rate * 0.01).toFixed(2);

    if (!isCredited || isNaN(parseFloat(earningAmount)) || parseFloat(earningAmount) <= 0) {
      await db.transaction(async (tx) => {
        await tx.select().from(partnersTable).where(eq(partnersTable.id, partner.id)).for("update");
        await tx.update(partnersTable).set({ totalClicks: sql`${partnersTable.totalClicks} + 1`, updatedAt: new Date() }).where(eq(partnersTable.id, partner.id));
      });
    } else {
      await db.transaction(async (tx) => {
        await tx.select().from(partnersTable).where(eq(partnersTable.id, partner.id)).for("update");
        await tx.insert(creatorEarningsLedgerTable).values({ partnerId: partner.id, amount: earningAmount, type: "click", description: `Click from ${ipHash || "unknown"}` });
        await tx.update(partnersTable).set({ totalClicks: sql`${partnersTable.totalClicks} + 1`, totalEarnings: sql`${partnersTable.totalEarnings} + ${earningAmount}`, updatedAt: new Date() }).where(eq(partnersTable.id, partner.id));
      });
    }

    res.cookie("sportyra_ref", JSON.stringify({ partnerId: partner.id, code }), { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    res.json({ ok: true, redirect: targetUrl, fraud: fraudVerdict.verdict !== "clean" ? { score: fraudVerdict.score, verdict: fraudVerdict.verdict } : undefined });
  } catch (error) { next(error); }
});

router.get("/partners/me", requirePartner, async (req, res, next): Promise<void> => {
  try {
    const p = res.locals.partner;
    const { secretHash: _secretHash, secretPrefix: _secretPrefix, ...safe } = p;
    res.json(safe);
  } catch (error) { next(error); }
});

router.patch("/partners/me", profileRateLimit, requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner;
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.bio !== undefined) updates.bio = body.bio ? String(body.bio).trim().slice(0, 2000) : null;
    if (body.avatar !== undefined) updates.avatar = body.avatar ? String(body.avatar).trim().slice(0, 500) : null;
    if (body.facebook !== undefined) updates.facebook = body.facebook ? String(body.facebook).trim().slice(0, 500) : null;
    if (body.instagram !== undefined) updates.instagram = body.instagram ? String(body.instagram).trim().slice(0, 500) : null;
    if (body.tiktok !== undefined) updates.tiktok = body.tiktok ? String(body.tiktok).trim().slice(0, 500) : null;
    if (body.youtube !== undefined) updates.youtube = body.youtube ? String(body.youtube).trim().slice(0, 500) : null;
    if (body.phone !== undefined) updates.phone = body.phone ? String(body.phone).trim().slice(0, 50) : null;
    if (body.address !== undefined) updates.address = body.address ? String(body.address).trim().slice(0, 500) : null;
    if (body.website !== undefined) updates.website = body.website ? String(body.website).trim().slice(0, 500) : null;
    const [updated] = await db.update(partnersTable).set(updates).where(eq(partnersTable.id, partner.id)).returning();
    if (!updated) { res.status(404).json({ error: "Partner not found" }); return; }
    const { secretHash: _sh, secretPrefix: _sp, ...safe } = updated;
    res.json(safe);
  } catch (error) { next(error); }
});

router.get("/partners/stats", requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner;
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);

    const [earningsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${creatorEarningsLedgerTable.amount}::numeric), 0)` }).from(creatorEarningsLedgerTable).where(eq(creatorEarningsLedgerTable.partnerId, partner.id));
    const [clickCountResult] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(eq(referralClicksTable.partnerId, partner.id));

    const [periodClicks] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to)));
    const [periodUniqueVisitors] = await db.select({ total: sql<number>`COUNT(DISTINCT ${referralClicksTable.fingerprint})::int` }).from(referralClicksTable).where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to), sql`${referralClicksTable.fingerprint} IS NOT NULL`));
    const [periodEarnings] = await db.select({ total: sql<string>`COALESCE(SUM(${creatorEarningsLedgerTable.amount}::numeric), 0)` }).from(creatorEarningsLedgerTable).where(and(eq(creatorEarningsLedgerTable.partnerId, partner.id), gte(creatorEarningsLedgerTable.createdAt, from), lte(creatorEarningsLedgerTable.createdAt, to)));

    const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [recentClicks] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(and(eq(referralClicksTable.partnerId, partner.id), sql`${referralClicksTable.createdAt} > ${last7days}`));

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
      periodClicks: periodClicks?.total || 0,
      periodUniqueVisitors: periodUniqueVisitors?.total || 0,
      periodEarnings: periodEarnings?.total || "0",
    });
  } catch (error) { next(error); }
});

router.get("/partners/clicks", requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const offset = Number(req.query.offset) || 0;
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const conditions = [eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to)];
    const clicks = await db.select().from(referralClicksTable).where(and(...conditions)).orderBy(desc(referralClicksTable.createdAt)).limit(limit).offset(offset);
    const [countResult] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(and(...conditions));
    res.json({ items: clicks.map(({ ipAddress: _ip, userAgent: _ua, ...safe }) => safe), total: countResult?.total || 0 });
  } catch (error) { next(error); }
});

router.get("/partners/earnings", requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const conditions = [eq(creatorEarningsLedgerTable.partnerId, partner.id), gte(creatorEarningsLedgerTable.createdAt, from), lte(creatorEarningsLedgerTable.createdAt, to)];
    const earnings = await db.select().from(creatorEarningsLedgerTable).where(and(...conditions)).orderBy(desc(creatorEarningsLedgerTable.createdAt)).limit(limit);
    const [sumResult] = await db.select({ total: sql<string>`COALESCE(SUM(${creatorEarningsLedgerTable.amount}::numeric), 0)` }).from(creatorEarningsLedgerTable).where(and(...conditions));
    res.json({ items: earnings, total: sumResult?.total || "0" });
  } catch (error) { next(error); }
});

router.get("/partners/analytics", requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner;
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);

    const [totalPeriodClicks] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to)));
    const [uniqueVisitors] = await db.select({ total: sql<number>`COUNT(DISTINCT ${referralClicksTable.fingerprint})::int` }).from(referralClicksTable).where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to), sql`${referralClicksTable.fingerprint} IS NOT NULL`));
    const [totalPageViews] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to), sql`${referralClicksTable.targetUrl} IS NOT NULL`));

    const dailyClicks = await db.select({
      date: sql<string>`to_char(${referralClicksTable.createdAt}::date, 'YYYY-MM-DD')`,
      clicks: count(),
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${referralClicksTable.fingerprint})::int`,
    }).from(referralClicksTable)
      .where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to)))
      .groupBy(sql`${referralClicksTable.createdAt}::date`)
      .orderBy(desc(sql`${referralClicksTable.createdAt}::date`));

    const topLinks = await db.select({
      targetUrl: referralClicksTable.targetUrl,
      clicks: count(),
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${referralClicksTable.fingerprint})::int`,
    }).from(referralClicksTable)
      .where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to), sql`${referralClicksTable.targetUrl} IS NOT NULL`))
      .groupBy(referralClicksTable.targetUrl)
      .orderBy(desc(count()))
      .limit(10);

    const topSources = await db.select({
      utmSource: referralClicksTable.utmSource,
      clicks: count(),
    }).from(referralClicksTable)
      .where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to), sql`${referralClicksTable.utmSource} IS NOT NULL`))
      .groupBy(referralClicksTable.utmSource)
      .orderBy(desc(count()))
      .limit(10);

    const topMediums = await db.select({
      utmMedium: referralClicksTable.utmMedium,
      clicks: count(),
    }).from(referralClicksTable)
      .where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to), sql`${referralClicksTable.utmMedium} IS NOT NULL`))
      .groupBy(referralClicksTable.utmMedium)
      .orderBy(desc(count()))
      .limit(10);

    const topCampaigns = await db.select({
      utmCampaign: referralClicksTable.utmCampaign,
      clicks: count(),
    }).from(referralClicksTable)
      .where(and(eq(referralClicksTable.partnerId, partner.id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to), sql`${referralClicksTable.utmCampaign} IS NOT NULL`))
      .groupBy(referralClicksTable.utmCampaign)
      .orderBy(desc(count()))
      .limit(10);

    const referralLinks = await db.select().from(referralLinksTable)
      .where(eq(referralLinksTable.partnerId, partner.id))
      .orderBy(desc(referralLinksTable.clickCount))
      .limit(20);

    res.json({
      totalClicks: totalPeriodClicks?.total || 0,
      uniqueVisitors: uniqueVisitors?.total || 0,
      totalPageViews: totalPageViews?.total || 0,
      dailyClicks: dailyClicks.reverse(),
      topLinks,
      topSources,
      topMediums,
      topCampaigns,
      referralLinks,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (error) { next(error); }
});

router.post("/partners/referral-link", linkRateLimit, requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner;
    const body = req.body as Record<string, unknown> | undefined;
    const targetUrl = (body?.targetUrl as string) || "/";
    const label = (body?.label as string) || null;
    const utmSource = (body?.utmSource as string) || null;
    const utmMedium = (body?.utmMedium as string) || null;
    const utmCampaign = (body?.utmCampaign as string) || null;
    const [link] = await db.insert(referralLinksTable).values({ partnerId: partner.id, code: partner.referralCode, targetUrl, label, utmSource, utmMedium, utmCampaign }).returning();
    res.status(201).json(link);
  } catch (error) { next(error); }
});

router.get("/partners/links", requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner;
    const links = await db.select().from(referralLinksTable).where(eq(referralLinksTable.partnerId, partner.id)).orderBy(desc(referralLinksTable.createdAt));
    res.json({ items: links, total: links.length });
  } catch (error) { next(error); }
});

router.patch("/partners/links/:id", requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner;
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;
    const [existing] = await db.select().from(referralLinksTable).where(and(eq(referralLinksTable.id, id), eq(referralLinksTable.partnerId, partner.id))).limit(1);
    if (!existing) { res.status(404).json({ error: "Link not found" }); return; }
    const updates: Record<string, unknown> = {};
    if (body.active !== undefined) updates.active = body.active;
    if (body.label !== undefined) updates.label = body.label;
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No updates provided" }); return; }
    const [updated] = await db.update(referralLinksTable).set(updates).where(eq(referralLinksTable.id, id)).returning();
    res.json(updated);
  } catch (error) { next(error); }
});

const applySchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  website: z.string().url().optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  avatar: z.string().url().optional().nullable(),
  facebook: z.string().url().optional().nullable(),
  instagram: z.string().url().optional().nullable(),
  tiktok: z.string().url().optional().nullable(),
  youtube: z.string().url().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
});

router.get("/partners/search", async (req, res, next): Promise<void> => {
  try {
    const { search } = req.query as Record<string, string | undefined>;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 50));
    const filters = [eq(partnersTable.status, "approved")];
    if (search) {
      filters.push(or(
        ilike(partnersTable.name, `%${search}%`),
        ilike(partnersTable.bio, `%${search}%`),
      )!);
    }
    const rows = await db.select({
      id: partnersTable.id,
      name: partnersTable.name,
      bio: partnersTable.bio,
      avatar: partnersTable.avatar,
      website: partnersTable.website,
      totalClicks: partnersTable.totalClicks,
      createdAt: partnersTable.createdAt,
    }).from(partnersTable)
      .where(and(...filters))
      .orderBy(desc(partnersTable.totalClicks))
      .limit(limit);
    res.json({ items: rows, total: rows.length });
  } catch (error) { next(error); }
});

router.post("/partners/apply", rateLimit({ windowMs: 60_000, max: 5 }), async (req, res, next): Promise<void> => {
  try {
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid application data", details: parsed.error.flatten() });
      return;
    }
    const { name, email, website, bio, avatar, facebook, instagram, tiktok, youtube, phone, address } = parsed.data;
    const existing = await db.select({ id: partnersTable.id }).from(partnersTable).where(eq(partnersTable.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "An application with this email already exists" });
      return;
    }
    const referralCode = generateReferralCode();
    const [partner] = await db.insert(partnersTable).values({
      name, email, referralCode, website, bio, avatar, facebook, instagram, tiktok, youtube, phone, address, status: "pending",
    }).returning();
    res.status(201).json({ message: "Application submitted successfully", partnerId: partner.id, referralCode });
  } catch (error) { next(error); }
});

router.get("/partners/:identifier", async (req, res, next): Promise<void> => {
  try {
    const { identifier } = req.params;
    const isNumeric = /^\d+$/.test(identifier);
    const [partner] = await db.select().from(partnersTable)
      .where(isNumeric ? eq(partnersTable.id, Number(identifier)) : eq(partnersTable.referralCode, identifier))
      .limit(1);
    if (!partner || partner.status !== "approved") {
      res.status(404).json({ error: "Partner not found" });
      return;
    }

    const [articleCount] = await db.select({ total: count() }).from(newsTable)
      .where(and(eq(newsTable.partnerId, partner.id), eq(newsTable.published, true)));
    const recentArticles = await db.select({
      id: newsTable.id, title: newsTable.title, slug: newsTable.slug, image: newsTable.image,
      category: newsTable.category, description: newsTable.description, author: newsTable.author,
      readingTime: newsTable.readingTime, publicationDate: newsTable.publicationDate, tags: newsTable.tags,
    }).from(newsTable)
      .where(and(eq(newsTable.partnerId, partner.id), eq(newsTable.published, true)))
      .orderBy(desc(newsTable.publicationDate)).limit(5);

    const publicProfile = {
      id: partner.id,
      name: partner.name,
      website: partner.website,
      bio: partner.bio,
      avatar: partner.avatar,
      facebook: partner.facebook,
      instagram: partner.instagram,
      tiktok: partner.tiktok,
      youtube: partner.youtube,
      totalClicks: partner.totalClicks,
      approvedAt: partner.approvedAt,
      verified: true,
      memberSince: partner.createdAt,
      articleCount: Number(articleCount?.total ?? 0),
      recentArticles: recentArticles.map((a) => ({
        ...a,
        slug: a.slug || a.title.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "story",
      })),
    };
    res.json(publicProfile);
  } catch (error) { next(error); }
});

router.get("/partners/:identifier/articles", async (req, res, next): Promise<void> => {
  try {
    const { identifier } = req.params;
    const isNumeric = /^\d+$/.test(identifier);
    const [partner] = await db.select().from(partnersTable)
      .where(isNumeric ? eq(partnersTable.id, Number(identifier)) : eq(partnersTable.referralCode, identifier))
      .limit(1);
    if (!partner || partner.status !== "approved") {
      res.status(404).json({ error: "Partner not found" });
      return;
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(24, Math.max(1, Number(req.query.pageSize) || 12));
    const [totalRow] = await db.select({ total: count() }).from(newsTable)
      .where(and(eq(newsTable.partnerId, partner.id), eq(newsTable.published, true)));
    const total = Number(totalRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const articles = await db.select({
      id: newsTable.id, title: newsTable.title, slug: newsTable.slug, image: newsTable.image,
      category: newsTable.category, description: newsTable.description, author: newsTable.author,
      readingTime: newsTable.readingTime, publicationDate: newsTable.publicationDate, tags: newsTable.tags,
      featured: newsTable.featured,
    }).from(newsTable)
      .where(and(eq(newsTable.partnerId, partner.id), eq(newsTable.published, true)))
      .orderBy(desc(newsTable.publicationDate))
      .limit(pageSize).offset((page - 1) * pageSize);
    res.json({
      partnerId: partner.id, partnerName: partner.name, partnerAvatar: partner.avatar,
      page, pageSize, total, totalPages,
      items: articles.map((a) => ({
        ...a,
        slug: a.slug || a.title.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "story",
      })),
    });
  } catch (error) { next(error); }
});

router.post("/admin/partners/:id/approve", adminPartnerRateLimit, async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const ok1 = await ensureAdminTokenUser(res);
    if (!ok1) { res.status(401).json({ error: "Admin authentication required" }); return; }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, id)).limit(1);
    if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
    if (partner.status === "approved") { res.status(400).json({ error: "Partner already approved" }); return; }
    const { plaintext, hash, prefix } = generatePartnerSecret();
    const [updated] = await db.update(partnersTable)
      .set({ status: "approved", approvedAt: new Date(), approvedBy: res.locals.user!.id, secretHash: hash, secretPrefix: prefix, updatedAt: new Date() })
      .where(eq(partnersTable.id, id)).returning();
    await db.insert(auditLogTable).values({ userId: res.locals.user!.id, action: "partner_approved", targetType: "partner", targetId: id, details: partner.name });
    const { secretHash: _sh, secretPrefix: _sp, ...safe } = updated;
    res.json({ ...safe, secret: plaintext, _warning: "Store this secret now. It will not be shown again." });
  } catch (error) { next(error); }
});

router.post("/admin/partners/:id/reject", adminPartnerRateLimit, async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;
    const reason = (body.reason as string) || "";
    const ok2 = await ensureAdminTokenUser(res);
    if (!ok2) { res.status(401).json({ error: "Admin authentication required" }); return; }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, id)).limit(1);
    if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
    if (partner.status === "rejected") { res.status(400).json({ error: "Partner already rejected" }); return; }
    const [updated] = await db.update(partnersTable)
      .set({ status: "rejected", rejectedAt: new Date(), rejectedBy: res.locals.user!.id, rejectedReason: reason, secretHash: null, secretPrefix: null, updatedAt: new Date() })
      .where(eq(partnersTable.id, id)).returning();
    await db.insert(auditLogTable).values({ userId: res.locals.user!.id, action: "partner_rejected", targetType: "partner", targetId: id, details: reason || partner.name });
    res.json(updated);
  } catch (error) { next(error); }
});

router.post("/admin/partners/:id/suspend", adminPartnerRateLimit, async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;
    const reason = (body.reason as string) || "";
    const ok3 = await ensureAdminTokenUser(res);
    if (!ok3) { res.status(401).json({ error: "Admin authentication required" }); return; }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, id)).limit(1);
    if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
    if (partner.status === "suspended") { res.status(400).json({ error: "Partner already suspended" }); return; }
    const [updated] = await db.update(partnersTable)
      .set({ status: "suspended", suspendedAt: new Date(), suspendedBy: res.locals.user!.id, suspendedReason: reason, secretHash: null, secretPrefix: null, updatedAt: new Date() })
      .where(eq(partnersTable.id, id)).returning();
    await db.insert(auditLogTable).values({ userId: res.locals.user!.id, action: "partner_suspended", targetType: "partner", targetId: id, details: reason || partner.name });
    res.json(updated);
  } catch (error) { next(error); }
});

router.post("/admin/partners/:id/reactivate", adminPartnerRateLimit, async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const ok4 = await ensureAdminTokenUser(res);
    if (!ok4) { res.status(401).json({ error: "Admin authentication required" }); return; }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, id)).limit(1);
    if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
    if (partner.status === "approved") { res.status(400).json({ error: "Partner already active" }); return; }
    const { plaintext, hash, prefix } = generatePartnerSecret();
    const [updated] = await db.update(partnersTable)
      .set({ status: "approved", suspendedAt: null, suspendedBy: null, suspendedReason: null, secretHash: hash, secretPrefix: prefix, updatedAt: new Date() })
      .where(eq(partnersTable.id, id)).returning();
    await db.insert(auditLogTable).values({ userId: res.locals.user!.id, action: "partner_reactivated", targetType: "partner", targetId: id, details: partner.name });
    const { secretHash: _sh, secretPrefix: _sp, ...safe } = updated;
    res.json({ ...safe, secret: plaintext, _warning: "Store this secret now. It will not be shown again." });
  } catch (error) { next(error); }
});

router.post("/admin/partners/:id/rotate-secret", adminPartnerRateLimit, async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const ok5 = await ensureAdminTokenUser(res);
    if (!ok5) { res.status(401).json({ error: "Admin authentication required" }); return; }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, id)).limit(1);
    if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
    if (partner.status !== "approved") { res.status(400).json({ error: "Partner must be approved" }); return; }
    const { plaintext, hash, prefix } = generatePartnerSecret();
    await db.update(partnersTable).set({ secretHash: hash, secretPrefix: prefix, updatedAt: new Date() }).where(eq(partnersTable.id, id));
    await db.insert(auditLogTable).values({ userId: res.locals.user!.id, action: "partner_secret_rotated", targetType: "partner", targetId: id, details: partner.name });
    res.json({ secret: plaintext, _warning: "Store this secret now. It will not be shown again." });
  } catch (error) { next(error); }
});

router.get("/admin/partners", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const partners = await db.select().from(partnersTable).orderBy(desc(partnersTable.createdAt)).limit(limit);
    res.json({ items: partners.map(({ secretHash: _sh, secretPrefix: _sp, ...safe }) => safe), total: partners.length });
  } catch (error) { next(error); }
});

router.post("/admin/partners", adminPartnerRateLimit, async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const parsed = AdminPartnerCreate.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
    const { name, email, website, description: bio, avatar, commissionRate, status } = parsed.data;
    const referralCode = generateReferralCode();
    const [partner] = await db.insert(partnersTable).values({ name, email, referralCode, website, bio, avatar, commissionRate, status }).returning();
    const { secretHash: _sh, secretPrefix: _sp, ...safe } = partner;
    res.status(201).json(safe);
  } catch (error) { next(error); }
});

router.patch("/admin/partners/:id", adminPartnerRateLimit, async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = String(body.name).trim().slice(0, 100);
    if (body.email !== undefined) updates.email = String(body.email).trim().toLowerCase().slice(0, 254);
    if (body.website !== undefined) updates.website = body.website ? String(body.website).slice(0, 500) : null;
    if (body.bio !== undefined) updates.bio = body.bio ? String(body.bio).slice(0, 2000) : null;
    if (body.avatar !== undefined) updates.avatar = body.avatar ? String(body.avatar).slice(0, 500) : null;
    if (body.facebook !== undefined) updates.facebook = body.facebook ? String(body.facebook).slice(0, 500) : null;
    if (body.instagram !== undefined) updates.instagram = body.instagram ? String(body.instagram).slice(0, 500) : null;
    if (body.tiktok !== undefined) updates.tiktok = body.tiktok ? String(body.tiktok).slice(0, 500) : null;
    if (body.youtube !== undefined) updates.youtube = body.youtube ? String(body.youtube).slice(0, 500) : null;
    if (body.phone !== undefined) updates.phone = body.phone ? String(body.phone).slice(0, 50) : null;
    if (body.address !== undefined) updates.address = body.address ? String(body.address).slice(0, 500) : null;
    if (body.commission_rate !== undefined) {
      const rate = parseFloat(String(body.commission_rate));
      if (isNaN(rate) || rate < 0 || rate > 100) { res.status(400).json({ error: "commission_rate must be 0-100" }); return; }
      updates.commissionRate = rate.toFixed(2);
    }
    if (body.status !== undefined) {
      const validStatuses = ["pending", "approved", "rejected", "suspended"];
      if (!validStatuses.includes(String(body.status))) { res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` }); return; }
      updates.status = body.status;
    }
    const [updated] = await db.update(partnersTable).set(updates).where(eq(partnersTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Partner not found" }); return; }
    const { secretHash: _sh, secretPrefix: _sp, ...safe } = updated;
    res.json(safe);
  } catch (error) { next(error); }
});

router.get("/admin/partners/stats", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);

    const [totalPartners] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(partnersTable);
    const [activePartners] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(partnersTable).where(eq(partnersTable.status, "approved"));
    const [pendingPartners] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(partnersTable).where(eq(partnersTable.status, "pending"));
    const [rejectedPartners] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(partnersTable).where(eq(partnersTable.status, "rejected"));
    const [suspendedPartners] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(partnersTable).where(eq(partnersTable.status, "suspended"));
    const [totalClicks] = await db.select({ total: sql<string>`COALESCE(SUM(${partnersTable.totalClicks}), 0)` }).from(partnersTable);
    const [totalEarnings] = await db.select({ total: sql<string>`COALESCE(SUM(${partnersTable.totalEarnings}::numeric), 0)` }).from(partnersTable);
    const [totalPaid] = await db.select({ total: sql<string>`COALESCE(SUM(${partnersTable.paidEarnings}::numeric), 0)` }).from(partnersTable);

    const [periodTotalClicks] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(and(gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to)));
    const [periodUniqueVisitors] = await db.select({ total: sql<number>`COUNT(DISTINCT ${referralClicksTable.fingerprint})::int` }).from(referralClicksTable).where(and(gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to), sql`${referralClicksTable.fingerprint} IS NOT NULL`));
    const [periodRegistrations] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(usersTable).where(and(sql`${usersTable.referredByPartnerId} IS NOT NULL`, gte(usersTable.createdAt, from), lte(usersTable.createdAt, to)));

    const dailyOverview = await db.select({
      date: sql<string>`to_char(${referralClicksTable.createdAt}::date, 'YYYY-MM-DD')`,
      clicks: count(),
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${referralClicksTable.fingerprint})::int`,
    }).from(referralClicksTable)
      .where(and(gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to)))
      .groupBy(sql`${referralClicksTable.createdAt}::date`)
      .orderBy(desc(sql`${referralClicksTable.createdAt}::date`));

    const topPartners = await db.select({
      id: partnersTable.id,
      name: partnersTable.name,
      referralCode: partnersTable.referralCode,
      totalClicks: partnersTable.totalClicks,
      totalEarnings: partnersTable.totalEarnings,
    }).from(partnersTable)
      .where(eq(partnersTable.status, "approved"))
      .orderBy(desc(partnersTable.totalClicks))
      .limit(10);

    res.json({
      totalPartners: totalPartners?.total || 0,
      activePartners: activePartners?.total || 0,
      pendingPartners: pendingPartners?.total || 0,
      rejectedPartners: rejectedPartners?.total || 0,
      suspendedPartners: suspendedPartners?.total || 0,
      totalClicks: totalClicks?.total || 0,
      totalEarnings: totalEarnings?.total || "0",
      totalPaid: totalPaid?.total || "0",
      periodClicks: periodTotalClicks?.total || 0,
      periodUniqueVisitors: periodUniqueVisitors?.total || 0,
      periodRegistrations: periodRegistrations?.total || 0,
      dailyOverview: dailyOverview.reverse(),
      topPartners,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (error) { next(error); }
});

router.get("/admin/partners/:id/clicks", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const clicks = await db.select().from(referralClicksTable).where(and(eq(referralClicksTable.partnerId, id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to))).orderBy(desc(referralClicksTable.createdAt)).limit(limit);
    const [countResult] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(referralClicksTable).where(and(eq(referralClicksTable.partnerId, id), gte(referralClicksTable.createdAt, from), lte(referralClicksTable.createdAt, to)));
    res.json({ items: clicks.map(({ ipAddress: _ip, userAgent: _ua, ...safe }) => safe), total: countResult?.total || 0 });
  } catch (error) { next(error); }
});

router.get("/admin/partners/:id/earnings", async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const id = Number(req.params.id);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const earnings = await db.select().from(creatorEarningsLedgerTable).where(and(eq(creatorEarningsLedgerTable.partnerId, id), gte(creatorEarningsLedgerTable.createdAt, from), lte(creatorEarningsLedgerTable.createdAt, to))).orderBy(desc(creatorEarningsLedgerTable.createdAt)).limit(limit);
    const [sumResult] = await db.select({ total: sql<string>`COALESCE(SUM(${creatorEarningsLedgerTable.amount}::numeric), 0)` }).from(creatorEarningsLedgerTable).where(and(eq(creatorEarningsLedgerTable.partnerId, id), gte(creatorEarningsLedgerTable.createdAt, from), lte(creatorEarningsLedgerTable.createdAt, to)));
    res.json({ items: earnings, total: sumResult?.total || "0" });
  } catch (error) { next(error); }
});

router.post("/admin/partners/payouts", payoutRateLimit, async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) { res.status(403).json({ error: "Admin access required" }); return; }
    const body = req.body as Record<string, unknown>;
    const partnerId = Number(body.partnerId);
    const amount = String(body.amount || "0");
    const method = (body.method as string) || "manual";
    const notes = (body.notes as string) || null;
    const idempotencyKey = (req.headers["idempotency-key"] as string) || null;
    const parsedAmount = parseFloat(amount);
    if (!partnerId || !Number.isInteger(partnerId) || partnerId <= 0 || isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 1000000) {
      res.status(400).json({ error: "Valid partnerId (positive integer) and amount (0 < amount <= 1000000) required" }); return;
    }
    if (idempotencyKey) {
      const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) { res.status(200).json(existing); return; }
    }
    const result = await db.transaction(async (tx) => {
      const [partner] = await tx.select().from(partnersTable).where(eq(partnersTable.id, partnerId)).for("update").limit(1);
      if (!partner) throw new ClientError(404, "Partner not found");
      const availableEarnings = parseFloat(partner.totalEarnings) - parseFloat(partner.paidEarnings);
      if (parsedAmount > availableEarnings) throw new ClientError(400, `Insufficient earnings. Available: ${availableEarnings.toFixed(2)}`);
      const [payout] = await tx.insert(payoutsTable).values({ partnerId, amount, method, notes, idempotencyKey }).returning();
      await tx.update(partnersTable).set({ paidEarnings: sql`${partnersTable.paidEarnings} + ${amount}`, updatedAt: new Date() }).where(eq(partnersTable.id, partnerId));
      return payout;
    });
    const ok6 = await ensureAdminTokenUser(res);
    if (ok6 && res.locals.user) {
      await db.insert(auditLogTable).values({ userId: res.locals.user.id, action: "payout_created", targetType: "partner", targetId: partnerId, details: `$${amount} to partner via ${method}` }).catch(() => {});
    }
    res.status(201).json(result);
  } catch (error) { next(error); }
});

export default router;
