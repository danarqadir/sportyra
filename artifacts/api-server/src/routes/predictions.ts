import { Router, type IRouter } from "express";
import { db, predictionsTable, leaderboardTable, matchesTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireUser } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

const router: IRouter = Router();
const validPredictions = new Set(["home", "away", "draw"]);

router.get("/predictions/match/:matchId", rateLimit({ windowMs: 60_000, max: 30 }), async (req, res, next) => {
  try {
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) { res.status(400).json({ error: "Invalid match ID" }); return; }
    const rows = await db.select().from(predictionsTable).where(eq(predictionsTable.matchId, matchId));
    res.json({ items: rows });
  } catch (error) { next(error); }
});

router.post("/predictions", requireUser, rateLimit({ windowMs: 15 * 60_000, max: 20 }), async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };
    const { matchId, prediction, homeScorePred, awayScorePred } = req.body;
    const matchIdNum = Number(matchId);
    if (!Number.isInteger(matchIdNum) || matchIdNum <= 0) { res.status(400).json({ error: "Valid matchId is required" }); return; }
    if (!prediction || !validPredictions.has(prediction)) { res.status(400).json({ error: "prediction must be one of: home, away, draw" }); return; }
    if (homeScorePred != null && (!Number.isInteger(Number(homeScorePred)) || Number(homeScorePred) < 0)) { res.status(400).json({ error: "homeScorePred must be a non-negative integer" }); return; }
    if (awayScorePred != null && (!Number.isInteger(Number(awayScorePred)) || Number(awayScorePred) < 0)) { res.status(400).json({ error: "awayScorePred must be a non-negative integer" }); return; }
    const [existing] = await db.select().from(predictionsTable).where(and(eq(predictionsTable.userId, user.id), eq(predictionsTable.matchId, matchIdNum)));
    if (existing) { res.status(409).json({ error: "You already predicted this match" }); return; }
    const [pred] = await db.insert(predictionsTable).values({
      userId: user.id, matchId: matchIdNum, prediction, homeScorePred: homeScorePred != null ? Number(homeScorePred) : null, awayScorePred: awayScorePred != null ? Number(awayScorePred) : null,
    }).returning();
    res.status(201).json(pred);
  } catch (error) { next(error); }
});

router.get("/predictions/user/:userId", rateLimit({ windowMs: 60_000, max: 30 }), async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const rows = await db.select().from(predictionsTable).where(eq(predictionsTable.userId, userId)).orderBy(desc(predictionsTable.createdAt));
    res.json({ items: rows });
  } catch (error) { next(error); }
});

router.get("/leaderboard", async (_req, res, next) => {
  try {
    const rows = await db.select().from(leaderboardTable).orderBy(desc(leaderboardTable.totalPoints)).limit(50);
    const ranked = rows.map((row, idx) => ({ ...row, position: idx + 1 }));
    res.json({ items: ranked });
  } catch (error) { next(error); }
});

router.get("/leaderboard/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const [entry] = await db.select().from(leaderboardTable).where(eq(leaderboardTable.userId, userId));
    if (!entry) { res.json({ position: null, totalPoints: 0, correctPredictions: 0, totalPredictions: 0 }); return; }
    const [rank] = await db.select({ rank: sql<number>`count(*)::int` }).from(leaderboardTable).where(sql`${leaderboardTable.totalPoints} > ${entry.totalPoints}`);
    res.json({ ...entry, position: (rank?.rank ?? 0) + 1 });
  } catch (error) { next(error); }
});

export default router;
