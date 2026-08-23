import { Router, type IRouter } from "express";
import { db, transfersTable } from "@workspace/db";
import { eq, desc, asc, ilike, or, and, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/transfers", async (req, res, next) => {
  try {
    const { status, club, search, limit: rawLimit } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(rawLimit) || 20, 50);
    const filters = [];
    if (status) filters.push(eq(transfersTable.status, status));
    if (club) filters.push(or(ilike(transfersTable.fromClub, `%${club}%`), ilike(transfersTable.toClub, `%${club}%`)));
    if (search) filters.push(ilike(transfersTable.playerName, `%${search}%`));
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db.select().from(transfersTable).where(where).orderBy(desc(transfersTable.createdAt)).limit(limit);
    res.json({ items: rows, total: rows.length });
  } catch (error) { next(error); }
});

router.get("/transfers/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid transfer id" }); return; }
    const [transfer] = await db.select().from(transfersTable).where(eq(transfersTable.id, id));
    if (!transfer) { res.status(404).json({ error: "Transfer not found" }); return; }
    res.json(transfer);
  } catch (error) { next(error); }
});

router.post("/transfers", requireAdmin, async (req, res, next) => {
  try {
    const { playerName, playerId, fromClub, toClub, fee, status, transferType, transferDate, source, confidence } = req.body;
    if (!playerName || !fromClub || !toClub) { res.status(400).json({ error: "playerName, fromClub, and toClub are required" }); return; }
    const [transfer] = await db.insert(transfersTable).values({
      playerName, playerId: playerId ?? null, fromClub, toClub, fee: fee ?? null,
      status: status ?? "rumour", transferType: transferType ?? "permanent",
      transferDate: transferDate ? new Date(transferDate) : null, source: source ?? null,
      confidence: confidence ?? 50,
    }).returning();
    res.status(201).json(transfer);
  } catch (error) { next(error); }
});

router.patch("/transfers/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid transfer id" }); return; }
    const allowed = ["playerName", "fromClub", "toClub", "fee", "status", "transferType", "transferDate", "source", "confidence"];
    const updateData: Record<string, unknown> = {};
    for (const key of allowed) { if (req.body[key] !== undefined) updateData[key] = key === "transferDate" ? new Date(req.body[key]) : req.body[key]; }
    if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
    updateData.updatedAt = new Date();
    const [transfer] = await db.update(transfersTable).set(updateData).where(eq(transfersTable.id, id)).returning();
    if (!transfer) { res.status(404).json({ error: "Transfer not found" }); return; }
    res.json(transfer);
  } catch (error) { next(error); }
});

router.delete("/transfers/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid transfer id" }); return; }
    const [transfer] = await db.delete(transfersTable).where(eq(transfersTable.id, id)).returning();
    if (!transfer) { res.status(404).json({ error: "Transfer not found" }); return; }
    res.sendStatus(204);
  } catch (error) { next(error); }
});

export default router;
