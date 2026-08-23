import { Router, type IRouter } from "express";
import {
  db,
  fixturesTable,
  teamsTable,
  competitionsTable,
} from "@workspace/db";
import {
  eq,
  and,
  desc,
  asc,
  gte,
  lte,
  sql,
  or,
  ilike,
} from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/fixtures", async (req, res, next) => {
  try {
    const {
      status,
      competitionId,
      teamId,
      from,
      to,
      limit: rawLimit,
    } = req.query as Record<string, string | undefined>;

    const limit = Math.min(Number(rawLimit) || 20, 50);

    const filters = [];
    if (status) filters.push(eq(fixturesTable.status, status));
    if (competitionId)
      filters.push(eq(fixturesTable.competitionId, Number(competitionId)));
    if (teamId) {
      const tid = Number(teamId);
      filters.push(
        or(
          eq(fixturesTable.homeTeamId, tid),
          eq(fixturesTable.awayTeamId, tid),
        ),
      );
    }
    if (from) filters.push(gte(fixturesTable.matchDate, new Date(from)));
    if (to) filters.push(lte(fixturesTable.matchDate, new Date(to)));

    const whereClause = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({
        id: fixturesTable.id,
        competitionId: fixturesTable.competitionId,
        homeTeamId: fixturesTable.homeTeamId,
        awayTeamId: fixturesTable.awayTeamId,
        homeScore: fixturesTable.homeScore,
        awayScore: fixturesTable.awayScore,
        status: fixturesTable.status,
        matchDate: fixturesTable.matchDate,
        venue: fixturesTable.venue,
        stage: fixturesTable.stage,
        round: fixturesTable.round,
        createdAt: fixturesTable.createdAt,
        updatedAt: fixturesTable.updatedAt,
        homeTeamName: teamsTable.name,
        homeTeamLogo: teamsTable.logoUrl,
        awayTeamName: sql<string>`away_team.name`,
        awayTeamLogo: sql<string>`away_team.logo_url`,
        competitionName: competitionsTable.name,
        competitionLogo: competitionsTable.logoUrl,
      })
      .from(fixturesTable)
      .leftJoin(teamsTable, eq(fixturesTable.homeTeamId, teamsTable.id))
      .leftJoin(
        competitionsTable,
        eq(fixturesTable.competitionId, competitionsTable.id),
      )
      .leftJoin(
        sql`teams as away_team`,
        eq(fixturesTable.awayTeamId, sql`away_team.id`),
      )
      .where(whereClause)
      .orderBy(asc(fixturesTable.matchDate))
      .limit(limit);

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/fixtures/upcoming", async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(fixturesTable)
      .where(
        and(
          eq(fixturesTable.status, "scheduled"),
          gte(fixturesTable.matchDate, new Date()),
        ),
      )
      .orderBy(asc(fixturesTable.matchDate))
      .limit(10);

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/fixtures/recent", async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(fixturesTable)
      .where(eq(fixturesTable.status, "finished"))
      .orderBy(desc(fixturesTable.matchDate))
      .limit(10);

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/fixtures/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid fixture id" });
      return;
    }

    const [row] = await db
      .select({
        id: fixturesTable.id,
        competitionId: fixturesTable.competitionId,
        homeTeamId: fixturesTable.homeTeamId,
        awayTeamId: fixturesTable.awayTeamId,
        homeScore: fixturesTable.homeScore,
        awayScore: fixturesTable.awayScore,
        status: fixturesTable.status,
        matchDate: fixturesTable.matchDate,
        venue: fixturesTable.venue,
        stage: fixturesTable.stage,
        round: fixturesTable.round,
        createdAt: fixturesTable.createdAt,
        updatedAt: fixturesTable.updatedAt,
        homeTeamName: teamsTable.name,
        homeTeamLogo: teamsTable.logoUrl,
        awayTeamName: sql<string>`away_team.name`,
        awayTeamLogo: sql<string>`away_team.logo_url`,
        competitionName: competitionsTable.name,
        competitionLogo: competitionsTable.logoUrl,
      })
      .from(fixturesTable)
      .leftJoin(teamsTable, eq(fixturesTable.homeTeamId, teamsTable.id))
      .leftJoin(
        competitionsTable,
        eq(fixturesTable.competitionId, competitionsTable.id),
      )
      .leftJoin(
        sql`teams as away_team`,
        eq(fixturesTable.awayTeamId, sql`away_team.id`),
      )
      .where(eq(fixturesTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Fixture not found" });
      return;
    }

    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.post("/fixtures", requireAdmin, async (req, res, next) => {
  try {
    const {
      competitionId,
      homeTeamId,
      awayTeamId,
      matchDate,
      venue,
      status,
      stage,
      round,
    } = req.body;

    if (!matchDate) {
      res.status(400).json({ error: "matchDate is required" });
      return;
    }

    const [fixture] = await db
      .insert(fixturesTable)
      .values({
        competitionId: competitionId ?? null,
        homeTeamId: homeTeamId ?? null,
        awayTeamId: awayTeamId ?? null,
        matchDate: new Date(matchDate),
        venue: venue ?? null,
        status: status ?? "scheduled",
        stage: stage ?? null,
        round: round ?? null,
      })
      .returning();

    res.status(201).json(fixture);
  } catch (error) {
    next(error);
  }
});

router.patch("/fixtures/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid fixture id" });
      return;
    }

    const allowed = [
      "competitionId",
      "homeTeamId",
      "awayTeamId",
      "homeScore",
      "awayScore",
      "status",
      "matchDate",
      "venue",
      "stage",
      "round",
    ];
    const updateData: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updateData[key] =
          key === "matchDate" ? new Date(req.body[key]) : req.body[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    updateData.updatedAt = new Date();

    const [fixture] = await db
      .update(fixturesTable)
      .set(updateData)
      .where(eq(fixturesTable.id, id))
      .returning();

    if (!fixture) {
      res.status(404).json({ error: "Fixture not found" });
      return;
    }

    res.json(fixture);
  } catch (error) {
    next(error);
  }
});

router.delete("/fixtures/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid fixture id" });
      return;
    }

    const [fixture] = await db
      .delete(fixturesTable)
      .where(eq(fixturesTable.id, id))
      .returning();

    if (!fixture) {
      res.status(404).json({ error: "Fixture not found" });
      return;
    }

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

router.get("/competitions", async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(competitionsTable)
      .orderBy(asc(competitionsTable.name));

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/competitions", requireAdmin, async (req, res, next) => {
  try {
    const { name, slug, country, sport, logoUrl } = req.body;

    if (!name || !slug) {
      res.status(400).json({ error: "name and slug are required" });
      return;
    }

    const [competition] = await db
      .insert(competitionsTable)
      .values({
        name,
        slug,
        country: country ?? null,
        sport: sport ?? "football",
        logoUrl: logoUrl ?? null,
      })
      .returning();

    res.status(201).json(competition);
  } catch (error) {
    next(error);
  }
});

router.get("/teams", async (req, res, next) => {
  try {
    const { search } = req.query as Record<string, string | undefined>;

    const filters = [];
    if (search) {
      filters.push(
        or(
          ilike(teamsTable.name, `%${search}%`),
          ilike(teamsTable.shortName, `%${search}%`),
        ),
      );
    }

    const whereClause = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select()
      .from(teamsTable)
      .where(whereClause)
      .orderBy(asc(teamsTable.name));

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/teams", requireAdmin, async (req, res, next) => {
  try {
    const { name, slug, shortName, logoUrl, sport } = req.body;

    if (!name || !slug) {
      res.status(400).json({ error: "name and slug are required" });
      return;
    }

    const [team] = await db
      .insert(teamsTable)
      .values({
        name,
        slug,
        shortName: shortName ?? null,
        logoUrl: logoUrl ?? null,
        sport: sport ?? "football",
      })
      .returning();

    res.status(201).json(team);
  } catch (error) {
    next(error);
  }
});

router.get("/sports/health", async (_req, res, next) => {
  try {
    const [totalRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(fixturesTable);

    const [upcomingRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(fixturesTable)
      .where(
        and(
          eq(fixturesTable.status, "scheduled"),
          gte(fixturesTable.matchDate, new Date()),
        ),
      );

    const [recentRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(fixturesTable)
      .where(eq(fixturesTable.status, "finished"));

    res.json({
      status: "ok",
      providers: [],
      fixtures: {
        total: totalRow?.total ?? 0,
        upcoming: upcomingRow?.total ?? 0,
        recent: recentRow?.total ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
