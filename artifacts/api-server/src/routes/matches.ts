import { Router, type IRouter } from "express";
import { db, matchesTable, matchEventsTable, matchStatsTable, matchLineupsTable } from "@workspace/db";
import { eq, desc, asc, and, gte, lte, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/matches", async (req, res, next) => {
  try {
    const { status, filter, limit: rawLimit } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(rawLimit) || 20, 50);
    const filters = [];
    if (filter === "live") filters.push(eq(matchesTable.status, "live"));
    else if (filter === "upcoming") filters.push(eq(matchesTable.status, "scheduled"));
    else if (filter === "finished") filters.push(eq(matchesTable.status, "finished"));
    else if (status) filters.push(eq(matchesTable.status, status));
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

router.post("/matches", requireAdmin, async (req, res, next) => {
  try {
    const { homeTeamName, awayTeamName, homeTeamLogo, awayTeamLogo, matchDate, status, venue, competitionName, competitionLogo, homeScore, awayScore, minute } = req.body;
    if (!homeTeamName || !awayTeamName || !matchDate) { res.status(400).json({ error: "homeTeamName, awayTeamName, and matchDate are required" }); return; }
    const [match] = await db.insert(matchesTable).values({
      homeTeamName, awayTeamName, homeTeamLogo: homeTeamLogo ?? null, awayTeamLogo: awayTeamLogo ?? null,
      matchDate: new Date(matchDate), status: status ?? "scheduled", venue: venue ?? null,
      competitionName: competitionName ?? null, competitionLogo: competitionLogo ?? null,
      homeScore: homeScore ?? 0, awayScore: awayScore ?? 0, minute: minute ?? null,
    }).returning();
    res.status(201).json(match);
  } catch (error) { next(error); }
});

router.patch("/matches/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid match id" }); return; }
    const allowed = ["homeScore", "awayScore", "status", "minute", "venue"];
    const updateData: Record<string, unknown> = {};
    for (const key of allowed) { if (req.body[key] !== undefined) updateData[key] = req.body[key]; }
    if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
    updateData.updatedAt = new Date();
    const [match] = await db.update(matchesTable).set(updateData).where(eq(matchesTable.id, id)).returning();
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }
    res.json(match);
  } catch (error) { next(error); }
});

router.post("/matches/:id/events", requireAdmin, async (req, res, next) => {
  try {
    const matchId = Number(req.params.id);
    const { eventType, minute, playerName, teamSide, detail } = req.body;
    if (!eventType) { res.status(400).json({ error: "eventType is required" }); return; }
    const [event] = await db.insert(matchEventsTable).values({ matchId, eventType, minute: minute ?? null, playerName: playerName ?? null, teamSide: teamSide ?? null, detail: detail ?? null }).returning();
    res.status(201).json(event);
  } catch (error) { next(error); }
});

router.delete("/matches/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid match id" }); return; }
    await db.delete(matchEventsTable).where(eq(matchEventsTable.matchId, id));
    await db.delete(matchStatsTable).where(eq(matchStatsTable.matchId, id));
    await db.delete(matchLineupsTable).where(eq(matchLineupsTable.matchId, id));
    const [match] = await db.delete(matchesTable).where(eq(matchesTable.id, id)).returning();
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }
    res.sendStatus(204);
  } catch (error) { next(error); }
});

export default router;
