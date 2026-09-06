import { Router, type IRouter } from "express";
import { db, transfersTable } from "@workspace/db";
import { eq, desc, asc, ilike, or, and, sql } from "drizzle-orm";
import { requireAdminMutation } from "../lib/auth";
import { TransferCreate, TransferUpdate } from "../lib/validation";
import { adminMutationRateLimit } from "../lib/rate-limit";
import { enrichTransfers } from "../lib/transfer-images";

const router: IRouter = Router();

router.get("/transfers", async (req, res, next) => {
  try {
    const { status, club, search, limit: rawLimit } = req.query as Record<string, string | undefined>;
    const limit = Math.max(1, Math.min(Number(rawLimit) || 20, 50));
    const filters: Array<ReturnType<typeof eq> | ReturnType<typeof or> | ReturnType<typeof ilike>> = [eq(transfersTable.isDemo, false)];
    if (status) filters.push(eq(transfersTable.status, status));
    if (club) filters.push(or(ilike(transfersTable.fromClub, `%${club}%`), ilike(transfersTable.toClub, `%${club}%`)) as ReturnType<typeof eq>);
    if (search) filters.push(ilike(transfersTable.playerName, `%${search}%`));
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db.select().from(transfersTable).where(where).orderBy(desc(transfersTable.createdAt)).limit(limit);
    const enriched = await enrichTransfers(rows);
    res.json({ items: enriched, total: enriched.length });
  } catch (error) { next(error); }
});

router.get("/transfers/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid transfer id" }); return; }
    const [transfer] = await db.select().from(transfersTable).where(eq(transfersTable.id, id));
    if (!transfer) { res.status(404).json({ error: "Transfer not found" }); return; }
    const [enriched] = await enrichTransfers([transfer]);
    res.json(enriched);
  } catch (error) { next(error); }
});

router.post("/transfers", requireAdminMutation, adminMutationRateLimit, async (req, res, next) => {
  try {
    const parsed = TransferCreate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }
    const { transferDate, ...fields } = parsed.data;
    const [transfer] = await db.insert(transfersTable).values({
      ...fields,
      transferDate: transferDate ? new Date(transferDate) : null,
    }).returning();
    res.status(201).json(transfer);
  } catch (error) { next(error); }
});

router.patch("/transfers/:id", requireAdminMutation, adminMutationRateLimit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid transfer id" }); return; }
    const parsed = TransferUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }
    const { transferDate, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (transferDate !== undefined) updateData.transferDate = transferDate ? new Date(transferDate) : null;
    if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
    updateData.updatedAt = new Date();
    const [transfer] = await db.update(transfersTable).set(updateData).where(eq(transfersTable.id, id)).returning();
    if (!transfer) { res.status(404).json({ error: "Transfer not found" }); return; }
    res.json(transfer);
  } catch (error) { next(error); }
});

router.delete("/transfers/:id", requireAdminMutation, adminMutationRateLimit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid transfer id" }); return; }
    const [transfer] = await db.delete(transfersTable).where(eq(transfersTable.id, id)).returning();
    if (!transfer) { res.status(404).json({ error: "Transfer not found" }); return; }
    res.sendStatus(204);
  } catch (error) { next(error); }
});

export default router;
