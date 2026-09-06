import { Router, type IRouter } from "express";
import { db, playersTable } from "@workspace/db";
import { eq, desc, asc, ilike, or, sql, and } from "drizzle-orm";
import { requireAdminMutation } from "../lib/auth";
import { PlayerCreate, PlayerUpdate } from "../lib/validation";
import { adminMutationRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

router.get("/players", async (req, res, next) => {
  try {
    const { search, position, club, limit: rawLimit, page: rawPage, pageSize: rawPageSize } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(rawPage) || 1);
    const pageSize = Math.max(1, Math.min(Number(rawPageSize) || Number(rawLimit) || 20, 100));
    const filters: Array<ReturnType<typeof eq> | ReturnType<typeof or> | ReturnType<typeof ilike>> = [eq(playersTable.isDemo, false)];
    if (search) filters.push(or(ilike(playersTable.name, `%${search}%`), ilike(playersTable.club, `%${search}%`)) as ReturnType<typeof eq>);
    if (position) filters.push(eq(playersTable.position, position));
    if (club) filters.push(ilike(playersTable.club, `%${club}%`));
    const where = and(...filters)!;
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(playersTable).where(where);
    const rows = await db.select().from(playersTable).where(where).orderBy(desc(playersTable.goals), desc(playersTable.appearances), asc(playersTable.id)).limit(pageSize).offset((page - 1) * pageSize);
    res.json({ items: rows, total: count, page, pageSize });
  } catch (error) { next(error); }
});

// Real top scorers derived from synced match data (demo players excluded).
router.get("/players/top-scorers", async (req, res, next) => {
  try {
    const { limit: rawLimit } = req.query as Record<string, string | undefined>;
    const limit = Math.max(1, Math.min(Number(rawLimit) || 20, 100));
    const rows = await db
      .select()
      .from(playersTable)
      .where(and(eq(playersTable.isDemo, false), sql`${playersTable.goals} > 0`))
      .orderBy(desc(playersTable.goals), desc(playersTable.assists), desc(playersTable.appearances), asc(playersTable.id))
      .limit(limit);
    res.json({ items: rows, total: rows.length });
  } catch (error) { next(error); }
});

router.get("/players/:slug", async (req, res, next) => {
  try {
    const [player] = await db.select().from(playersTable).where(and(eq(playersTable.slug, req.params.slug), eq(playersTable.isDemo, false)));
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }
    res.json(player);
  } catch (error) { next(error); }
});

router.post("/players", requireAdminMutation, adminMutationRateLimit, async (req, res, next) => {
  try {
    const parsed = PlayerCreate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }
    const { dateOfBirth, ...fields } = parsed.data;
    const [player] = await db.insert(playersTable).values({
      ...fields,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      goals: fields.goals ?? 0,
      assists: fields.assists ?? 0,
      appearances: fields.appearances ?? 0,
      trophies: fields.trophies ?? [],
    }).returning();
    res.status(201).json(player);
  } catch (error) { next(error); }
});

router.patch("/players/:id", requireAdminMutation, adminMutationRateLimit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid player id" }); return; }
    const parsed = PlayerUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }
    const { dateOfBirth, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
    updateData.updatedAt = new Date();
    const [player] = await db.update(playersTable).set(updateData).where(eq(playersTable.id, id)).returning();
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }
    res.json(player);
  } catch (error) { next(error); }
});

router.delete("/players/:id", requireAdminMutation, adminMutationRateLimit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid player id" }); return; }
    const [player] = await db.delete(playersTable).where(eq(playersTable.id, id)).returning();
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }
    res.sendStatus(204);
  } catch (error) { next(error); }
});

export default router;
