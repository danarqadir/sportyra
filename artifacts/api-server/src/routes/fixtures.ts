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
import { FixtureCreate, FixtureUpdate, CompetitionCreate, TeamCreate } from "../lib/validation";
import { adminMutationRateLimit } from "../lib/rate-limit";

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

    const limit = Math.max(1, Math.min(Number(rawLimit) || 20, 50));

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
      .select({
        id: fixturesTable.id,
        homeScore: fixturesTable.homeScore,
        awayScore: fixturesTable.awayScore,
        status: fixturesTable.status,
        matchDate: fixturesTable.matchDate,
        venue: fixturesTable.venue,
        homeTeamName: teamsTable.name,
        homeTeamShortName: teamsTable.shortName,
        homeTeamLogo: teamsTable.logoUrl,
        awayTeamName: sql<string>`away_team.name`,
        awayTeamShortName: sql<string>`away_team.short_name`,
        awayTeamLogo: sql<string>`away_team.logo_url`,
        competitionName: competitionsTable.name,
        competitionSlug: competitionsTable.slug,
      })
      .from(fixturesTable)
      .leftJoin(teamsTable, eq(fixturesTable.homeTeamId, teamsTable.id))
      .leftJoin(competitionsTable, eq(fixturesTable.competitionId, competitionsTable.id))
      .leftJoin(sql`teams as away_team`, eq(fixturesTable.awayTeamId, sql`away_team.id`))
      .where(
        and(
          eq(fixturesTable.status, "scheduled"),
          gte(fixturesTable.matchDate, new Date()),
        ),
      )
      .orderBy(asc(fixturesTable.matchDate))
      .limit(10);

    res.json({
      items: rows.map((f) => ({
        id: f.id,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        status: f.status,
        matchDate: f.matchDate,
        venue: f.venue,
        homeTeam: { name: f.homeTeamName, shortName: f.homeTeamShortName, logoUrl: f.homeTeamLogo },
        awayTeam: { name: f.awayTeamName, shortName: f.awayTeamShortName, logoUrl: f.awayTeamLogo },
        competition: { name: f.competitionName, slug: f.competitionSlug },
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/fixtures/recent", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: fixturesTable.id,
        homeScore: fixturesTable.homeScore,
        awayScore: fixturesTable.awayScore,
        status: fixturesTable.status,
        matchDate: fixturesTable.matchDate,
        venue: fixturesTable.venue,
        homeTeamName: teamsTable.name,
        homeTeamShortName: teamsTable.shortName,
        homeTeamLogo: teamsTable.logoUrl,
        awayTeamName: sql<string>`away_team.name`,
        awayTeamShortName: sql<string>`away_team.short_name`,
        awayTeamLogo: sql<string>`away_team.logo_url`,
        competitionName: competitionsTable.name,
        competitionSlug: competitionsTable.slug,
      })
      .from(fixturesTable)
      .leftJoin(teamsTable, eq(fixturesTable.homeTeamId, teamsTable.id))
      .leftJoin(competitionsTable, eq(fixturesTable.competitionId, competitionsTable.id))
      .leftJoin(sql`teams as away_team`, eq(fixturesTable.awayTeamId, sql`away_team.id`))
      .where(eq(fixturesTable.status, "finished"))
      .orderBy(desc(fixturesTable.matchDate))
      .limit(10);

    res.json({
      items: rows.map((f) => ({
        id: f.id,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        status: f.status,
        matchDate: f.matchDate,
        venue: f.venue,
        homeTeam: { name: f.homeTeamName, shortName: f.homeTeamShortName, logoUrl: f.homeTeamLogo },
        awayTeam: { name: f.awayTeamName, shortName: f.awayTeamShortName, logoUrl: f.awayTeamLogo },
        competition: { name: f.competitionName, slug: f.competitionSlug },
      })),
    });
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

router.post("/fixtures", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const parsed = FixtureCreate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }
    const { matchDate, ...fields } = parsed.data;

    const [fixture] = await db
      .insert(fixturesTable)
      .values({
        ...fields,
        matchDate: new Date(matchDate),
      })
      .returning();

    res.status(201).json(fixture);
  } catch (error) {
    next(error);
  }
});

router.patch("/fixtures/:id", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid fixture id" });
      return;
    }

    const parsed = FixtureUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }

    const { matchDate, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (matchDate !== undefined) updateData.matchDate = new Date(matchDate);

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

router.delete("/fixtures/:id", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
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

router.get("/competitions", async (req, res, next) => {
  try {
    const { search, includeDemo } = req.query as Record<string, string | undefined>;
    const filters = [];
    if (search) {
      filters.push(or(
        ilike(competitionsTable.name, `%${search}%`),
        ilike(competitionsTable.country, `%${search}%`),
        ilike(competitionsTable.sport, `%${search}%`),
      )!);
    }
    // Seeded demo leagues are hidden by default; admins can opt in via includeDemo.
    if (includeDemo !== "true") filters.push(eq(competitionsTable.isDemo, false));
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select()
      .from(competitionsTable)
      .where(where)
      .orderBy(asc(competitionsTable.name));

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/competitions", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const parsed = CompetitionCreate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }

    const [competition] = await db
      .insert(competitionsTable)
      .values({
        ...parsed.data,
        sport: parsed.data.sport || "football",
      })
      .returning();

    res.status(201).json(competition);
  } catch (error) {
    next(error);
  }
});

router.get("/teams", async (req, res, next) => {
  try {
    const { search, includeDemo } = req.query as Record<string, string | undefined>;

    const filters = [];
    if (search) {
      filters.push(
        or(
          ilike(teamsTable.name, `%${search}%`),
          ilike(teamsTable.shortName, `%${search}%`),
        ),
      );
    }
    // Seeded demo clubs and SportMonks bracket placeholders are hidden by default.
    if (includeDemo !== "true") filters.push(eq(teamsTable.isDemo, false));

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

router.post("/teams", requireAdmin, adminMutationRateLimit, async (req, res, next) => {
  try {
    const parsed = TeamCreate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) });
      return;
    }

    const [team] = await db
      .insert(teamsTable)
      .values({
        ...parsed.data,
        sport: parsed.data.sport || "football",
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
