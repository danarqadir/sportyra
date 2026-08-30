import { Router } from "express";
import { and, eq, desc, count, sql, ilike } from "drizzle-orm";
import { db, newsTable } from "@workspace/db";
import { requirePartner } from "../lib/auth";
import { rateLimit, adminMutationRateLimit } from "../lib/rate-limit";
import { sanitizeHtml } from "../lib/sanitize";

const router = Router();
const createRateLimit = rateLimit({ windowMs: 3600_000, max: 20 });
const editRateLimit = rateLimit({ windowMs: 60_000, max: 30 });
const submitRateLimit = rateLimit({ windowMs: 3600_000, max: 10 });

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "story";
}

function calculateReadingTime(body: string | null | undefined, description: string): number {
  const text = `${description} ${body || ""}`.trim();
  if (!text) return 1;
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

const EDITABLE_STATUSES = ["draft", "rejected"];

router.get("/partner/news", requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);
    const offset = (page - 1) * pageSize;
    const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
    const filters = [eq(newsTable.partnerId, partner.id)];
    if (statusFilter) filters.push(eq(newsTable.status, statusFilter));
    const where = and(...filters);
    const [rows, totalRows] = await Promise.all([
      db.select().from(newsTable).where(where).orderBy(desc(newsTable.updatedAt)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(newsTable).where(where),
    ]);
    const total = Number(totalRows[0]?.total ?? 0);
    res.json({ items: rows, page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) });
  } catch (error) { next(error); }
});

router.get("/partner/news/:id", requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const [article] = await db.select().from(newsTable).where(and(eq(newsTable.id, id), eq(newsTable.partnerId, partner.id))).limit(1);
    if (!article) { res.status(404).json({ error: "Article not found" }); return; }
    res.json(article);
  } catch (error) { next(error); }
});

router.post("/partner/news", createRateLimit, requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner!;
    const body = req.body as Record<string, unknown>;
    const title = (body.title as string || "").trim().slice(0, 500);
    const description = (body.description as string || "").trim().slice(0, 2000);
    const articleBody = (body.body as string) || null;
    const image = (body.image as string || "").trim().slice(0, 500);
    const category = (body.category as string || "football").trim().slice(0, 50);
    const language = (body.language as string || "en").trim().slice(0, 10);
    const source = (body.source as string || "").trim().slice(0, 200);
    const author = partner.name;
    const tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : typeof body.tags === "string" ? (body.tags as string).split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20) : [];
    const slug = body.slug ? String(body.slug).trim().slice(0, 200) : slugify(title);
    const metaTitle = body.metaTitle ? String(body.metaTitle).trim().slice(0, 200) : null;
    const metaDescription = body.metaDescription ? String(body.metaDescription).trim().slice(0, 500) : null;
    const rawDate = body.publicationDate ? new Date(body.publicationDate as string) : new Date();
    const publicationDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

    if (!title || !description || !image || !source) {
      res.status(400).json({ error: "Title, description, image, and source are required" });
      return;
    }

    const [existingTitle] = await db.select({ id: newsTable.id }).from(newsTable)
      .where(and(eq(newsTable.partnerId, partner.id), ilike(newsTable.title, title)))
      .limit(1);
    if (existingTitle) {
      res.status(409).json({ error: "An article with this title already exists" });
      return;
    }

    const sanitizedBody = articleBody ? sanitizeHtml(articleBody) : null;
    const readingTime = calculateReadingTime(sanitizedBody, description);

    const [article] = await db.insert(newsTable).values({
      title, description, body: sanitizedBody, image, category, language, source, author,
      tags, slug, readingTime, metaTitle, metaDescription, publicationDate,
      status: "draft", published: false, partnerId: partner.id,
    }).returning();

    res.status(201).json(article);
  } catch (error) { next(error); }
});

router.patch("/partner/news/:id", editRateLimit, requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select().from(newsTable).where(and(eq(newsTable.id, id), eq(newsTable.partnerId, partner.id))).limit(1);
    if (!existing) { res.status(404).json({ error: "Article not found" }); return; }
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      res.status(400).json({ error: "Cannot edit an article that is in review, approved, or published" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = String(body.title).trim().slice(0, 500);
    if (body.description !== undefined) updates.description = String(body.description).trim().slice(0, 2000);
    if (body.body !== undefined) updates.body = sanitizeHtml(String(body.body));
    if (body.image !== undefined) updates.image = String(body.image).trim().slice(0, 500);
    if (body.category !== undefined) updates.category = String(body.category).trim().slice(0, 50);
    if (body.language !== undefined) updates.language = String(body.language).trim().slice(0, 10);
    if (body.source !== undefined) updates.source = String(body.source).trim().slice(0, 200);
    if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : typeof body.tags === "string" ? (body.tags as string).split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20) : [];
    if (body.slug !== undefined) updates.slug = String(body.slug).trim().slice(0, 200);
    if (body.metaTitle !== undefined) updates.metaTitle = body.metaTitle ? String(body.metaTitle).trim().slice(0, 200) : null;
    if (body.metaDescription !== undefined) updates.metaDescription = body.metaDescription ? String(body.metaDescription).trim().slice(0, 500) : null;
    if (body.publicationDate !== undefined) {
      const parsed = new Date(body.publicationDate as string);
      updates.publicationDate = isNaN(parsed.getTime()) ? existing.publicationDate : parsed;
    }

    if (updates.title && !body.slug) updates.slug = slugify(String(updates.title));
    if (updates.body !== undefined || updates.description !== undefined) {
      const desc = String(updates.description ?? existing.description);
      const bodyText = updates.body !== undefined ? String(updates.body) : existing.body;
      updates.readingTime = calculateReadingTime(bodyText ?? null, desc);
    }

    updates.status = "draft";
    updates.reviewNote = null;

    const [article] = await db.update(newsTable).set(updates).where(eq(newsTable.id, id)).returning();
    res.json(article);
  } catch (error) { next(error); }
});

router.post("/partner/news/:id/submit", submitRateLimit, requirePartner, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select().from(newsTable).where(and(eq(newsTable.id, id), eq(newsTable.partnerId, partner.id))).limit(1);
    if (!existing) { res.status(404).json({ error: "Article not found" }); return; }
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      res.status(400).json({ error: "Article is not in an editable state" });
      return;
    }
    const [article] = await db.update(newsTable).set({ status: "in_review", reviewNote: null, updatedAt: new Date() }).where(eq(newsTable.id, id)).returning();
    res.json(article);
  } catch (error) { next(error); }
});

router.delete("/partner/news/:id", requirePartner, adminMutationRateLimit, async (req, res, next): Promise<void> => {
  try {
    const partner = res.locals.partner!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select().from(newsTable).where(and(eq(newsTable.id, id), eq(newsTable.partnerId, partner.id))).limit(1);
    if (!existing) { res.status(404).json({ error: "Article not found" }); return; }
    if (existing.status === "published") {
      res.status(400).json({ error: "Cannot delete a published article" });
      return;
    }
    await db.delete(newsTable).where(eq(newsTable.id, id));
    res.sendStatus(204);
  } catch (error) { next(error); }
});

export default router;
