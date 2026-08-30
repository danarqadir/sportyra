import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/auth";
import { adminMutationRateLimit } from "../lib/rate-limit";
import { isSportmonksConfigured } from "../lib/sportmonks";
import { runSportmonksSync, syncStandings, syncLivescores, syncMatchDetailsByApiId } from "../lib/sportmonks-sync";

const router: IRouter = Router();

router.get("/sports/sync/status", async (_req, res) => {
  res.json({
    configured: isSportmonksConfigured(),
    provider: "sportmonks",
  });
});

router.post("/sports/sync", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const summary = await runSportmonksSync({
      leagues: body.leagues !== false,
      teams: body.teams !== false,
      players: body.players !== false,
      fixtures: body.fixtures !== false,
      livescores: body.livescores !== false,
      standings: body.standings !== false,
      transfers: body.transfers !== false,
      matchDetails: body.matchDetails === true,
      playerStats: body.playerStats === true,
      forcePlayers: body.forcePlayers === true,
      forceTransfers: body.forceTransfers === true,
    });
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.post("/sports/sync/standings", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const leagueId = Number((req.body as Record<string, unknown>)?.leagueApiId);
    const updated = Number.isInteger(leagueId) && leagueId > 0 ? await syncStandings(leagueId) : await syncStandings();
    res.json({ updated });
  } catch (error) {
    next(error);
  }
});

router.post("/sports/sync/livescores", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const count = await syncLivescores();
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

router.post("/sports/sync/match-details/:fixtureId", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const fixtureId = Number(req.params.fixtureId);
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
      res.status(400).json({ error: "Invalid fixture id" });
      return;
    }
    const ok = await syncMatchDetailsByApiId(fixtureId);
    if (!ok) {
      res.status(404).json({ error: "Fixture not found in synced data" });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
