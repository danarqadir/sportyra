import { Router, type IRouter } from "express";
import { db, matchesTable, matchEventsTable, matchStatsTable, matchLineupsTable } from "@workspace/db";
import { eq, desc, asc, and, gte, lte, sql, or, ilike } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { MatchCreate, MatchUpdate, MatchEventCreate } from "../lib/validation";
import { adminMutationRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

router.get("/matches", async (req, res, next) => {
  try {
    const { status, filter, search, limit: rawLimit } = req.query as Record<string, string | undefined>;
    const limit = Math.max(1, Math.min(Number(rawLimit) || 20, 50));
    const filters = [eq(matchesTable.isDemo, false)];
    if (filter === "live") filters.push(eq(matchesTable.status, "live"));
    else if (filter === "upcoming") filters.push(eq(matchesTable.status, "scheduled"));
    else if (filter === "finished") filters.push(eq(matchesTable.status, "finished"));
    else if (status) filters.push(eq(matchesTable.status, status));
    if (search) {
      filters.push(or(
        ilike(matchesTable.homeTeamName, `%${search}%`),
        ilike(matchesTable.awayTeamName, `%${search}%`),
        ilike(matchesTable.venue, `%${search}%`),
        ilike(matchesTable.competitionName, `%${search}%`),
      )!);
    }
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db.select().from(matchesTable).where(where).orderBy(desc(matchesTable.matchDate)).limit(limit);
    res.json({ items: rows, total: rows.length });
  } catch (error) { next(error); }
});

router.get("/matches/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid match id" }); return; }
    const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, id));
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }
    const events = await db.select().from(matchEventsTable).where(eq(matchEventsTable.matchId, id)).orderBy(asc(matchEventsTable.minute));
    const [stats] = await db.select().from(matchStatsTable).where(eq(matchStatsTable.matchId, id));
    const lineups = await db.select().from(matchLineupsTable).where(eq(matchLineupsTable.matchId, id));
    res.json({ ...match, events, stats, lineups });
  } catch (error) { next(error); }
});

router.post("/matches", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const parsed = MatchCreate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }
    const { matchDate, ...fields } = parsed.data;
    const [match] = await db.insert(matchesTable).values({
      ...fields,
      matchDate: new Date(matchDate),
      homeScore: fields.homeScore ?? 0,
      awayScore: fields.awayScore ?? 0,
    }).returning();
    res.status(201).json(match);
  } catch (error) { next(error); }
});

router.patch("/matches/:id", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid match id" }); return; }
    const parsed = MatchUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
    updateData.updatedAt = new Date();
    const [match] = await db.update(matchesTable).set(updateData).where(eq(matchesTable.id, id)).returning();
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }
    res.json(match);
  } catch (error) { next(error); }
});

router.post("/matches/:id/events", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const matchId = Number(req.params.id);
    if (!Number.isInteger(matchId) || matchId <= 0) { res.status(400).json({ error: "Invalid match id" }); return; }
    const parsed = MatchEventCreate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }
    const [event] = await db.insert(matchEventsTable).values({ matchId, ...parsed.data }).returning();
    res.status(201).json(event);
  } catch (error) { next(error); }
});

router.delete("/matches/:id", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid match id" }); return; }
    const result = await db.transaction(async (tx) => {
      await tx.delete(matchEventsTable).where(eq(matchEventsTable.matchId, id));
      await tx.delete(matchStatsTable).where(eq(matchStatsTable.matchId, id));
      await tx.delete(matchLineupsTable).where(eq(matchLineupsTable.matchId, id));
      const [match] = await tx.delete(matchesTable).where(eq(matchesTable.id, id)).returning();
      return match;
    });
    if (!result) { res.status(404).json({ error: "Match not found" }); return; }
    res.sendStatus(204);
  } catch (error) { next(error); }
});

export default router;
