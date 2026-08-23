import { Router, type IRouter } from "express";
import { db, playersTable } from "@workspace/db";
import { eq, desc, asc, ilike, or, sql, and } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/players", async (req, res, next) => {
  try {
    const { search, position, club, limit: rawLimit } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(rawLimit) || 20, 50);
    const filters = [];
    if (search) filters.push(or(ilike(playersTable.name, `%${search}%`), ilike(playersTable.club, `%${search}%`)));
    if (position) filters.push(eq(playersTable.position, position));
    if (club) filters.push(ilike(playersTable.club, `%${club}%`));
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db.select().from(playersTable).where(where).orderBy(desc(playersTable.goals)).limit(limit);
    res.json({ items: rows, total: rows.length });
  } catch (error) { next(error); }
});

router.get("/players/:slug", async (req, res, next) => {
  try {
    const [player] = await db.select().from(playersTable).where(eq(playersTable.slug, req.params.slug));
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }
    res.json(player);
  } catch (error) { next(error); }
});

router.post("/players", requireAdmin, async (req, res, next) => {
  try {
    const { name, slug, nationality, dateOfBirth, position, club, shirtNumber, photoUrl, biography, goals, assists, appearances, trophies } = req.body;
    if (!name || !slug) { res.status(400).json({ error: "name and slug are required" }); return; }
    const [player] = await db.insert(playersTable).values({
      name, slug, nationality: nationality ?? null, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      position: position ?? null, club: club ?? null, shirtNumber: shirtNumber ?? null,
      photoUrl: photoUrl ?? null, biography: biography ?? null, goals: goals ?? 0,
      assists: assists ?? 0, appearances: appearances ?? 0, trophies: trophies ?? [],
    }).returning();
    res.status(201).json(player);
  } catch (error) { next(error); }
});

router.patch("/players/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid player id" }); return; }
    const allowed = ["name", "nationality", "dateOfBirth", "position", "club", "shirtNumber", "photoUrl", "biography", "goals", "assists", "appearances", "trophies"];
    const updateData: Record<string, unknown> = {};
    for (const key of allowed) { if (req.body[key] !== undefined) updateData[key] = key === "dateOfBirth" ? new Date(req.body[key]) : req.body[key]; }
    if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
    updateData.updatedAt = new Date();
    const [player] = await db.update(playersTable).set(updateData).where(eq(playersTable.id, id)).returning();
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }
    res.json(player);
  } catch (error) { next(error); }
});

router.delete("/players/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid player id" }); return; }
    const [player] = await db.delete(playersTable).where(eq(playersTable.id, id)).returning();
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }
    res.sendStatus(204);
  } catch (error) { next(error); }
});

export default router;
