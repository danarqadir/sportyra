import { Router, type IRouter } from "express";
import {
  db,
  teamPagesTable,
  playersTable,
  matchesTable,
  transfersTable,
  newsTable,
} from "@workspace/db";
import { eq, desc, or, ilike, and, asc, sql } from "drizzle-orm";
import { competitionsTable } from "@workspace/db";
import { rateLimit } from "../lib/rate-limit";

const publicRateLimit = rateLimit({ windowMs: 60_000, max: 120 });

const STANDARDS_ZONES: { championsLeague: number; europaLeague: number; conferenceLeague: number; relegationCount: number } = {
  championsLeague: 4,
  europaLeague: 6,
  conferenceLeague: 7,
  relegationCount: 3,
};

function getZone(position: number, leagueSize: number): string {
  if (position <= STANDARDS_ZONES.championsLeague) return "champions-league";
  if (position <= STANDARDS_ZONES.europaLeague) return "europa-league";
  if (position <= STANDARDS_ZONES.conferenceLeague) return "conference-league";
  if (position > leagueSize - STANDARDS_ZONES.relegationCount) return "relegation";
  return "safe";
}

function normalizeLeague(value: string): string {
  return value.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, " ").trim();
}

const router: IRouter = Router();

router.get("/team-pages/standings", publicRateLimit, async (req, res, next) => {
  try {
    const { league } = req.query as Record<string, string | undefined>;
    if (!league || !league.trim()) {
      res.status(400).json({ error: "league query parameter is required" });
      return;
    }

    const target = normalizeLeague(league);

    const competitions = await db
      .select({ id: competitionsTable.id, name: competitionsTable.name, country: competitionsTable.country })
      .from(competitionsTable);

    let matchedCompetition: { id: number; name: string; country: string | null } | undefined;

    for (const comp of competitions) {
      if (normalizeLeague(comp.name) === target) {
        matchedCompetition = comp;
        break;
      }
    }

    if (!matchedCompetition) {
      for (const comp of competitions) {
        if (normalizeLeague(comp.name).includes(target) || target.includes(normalizeLeague(comp.name))) {
          matchedCompetition = comp;
          break;
        }
      }
    }

    if (!matchedCompetition) {
      for (const comp of competitions) {
        const compWords = normalizeLeague(comp.name).split(" ");
        const targetWords = target.split(" ");
        const overlap = targetWords.filter((w) => compWords.includes(w)).length;
        if (overlap >= Math.ceil(Math.min(compWords.length, targetWords.length) * 0.6)) {
          matchedCompetition = comp;
          break;
        }
      }
    }

    const teams = await db
      .select({
        name: teamPagesTable.name,
        slug: teamPagesTable.slug,
        badge: teamPagesTable.badge,
        leaguePosition: teamPagesTable.leaguePosition,
        points: teamPagesTable.points,
        played: teamPagesTable.played,
        won: teamPagesTable.won,
        drawn: teamPagesTable.drawn,
        lost: teamPagesTable.lost,
        goalsFor: teamPagesTable.goalsFor,
        goalsAgainst: teamPagesTable.goalsAgainst,
        form: teamPagesTable.form,
      })
      .from(teamPagesTable)
      .where(ilike(teamPagesTable.league, matchedCompetition ? matchedCompetition.name : league))
      .orderBy(
        asc(sql`COALESCE(${teamPagesTable.leaguePosition}, 9999)`),
        desc(sql`COALESCE(${teamPagesTable.points}, 0)`),
        desc(sql`COALESCE(${teamPagesTable.goalsFor}, 0) - COALESCE(${teamPagesTable.goalsAgainst}, 0)`),
      );

    const leagueSize = teams.length || 20;

    res.json({
      league: matchedCompetition?.name || league,
      country: matchedCompetition?.country || null,
      items: teams.map((t) => ({
        position: t.leaguePosition,
        name: t.name,
        slug: t.slug,
        badge: t.badge,
        played: t.played,
        won: t.won,
        drawn: t.drawn,
        lost: t.lost,
        goalsFor: t.goalsFor,
        goalsAgainst: t.goalsAgainst,
        goalDifference: (t.goalsFor ?? 0) - (t.goalsAgainst ?? 0),
        points: t.points,
        form: t.form ?? [],
        zone: getZone(t.leaguePosition ?? leagueSize, leagueSize),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/team-pages/leagues", publicRateLimit, async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        league: teamPagesTable.league,
        country: sql<string>`MIN(${teamPagesTable.country})`,
        teamCount: sql<number>`COUNT(*)::int`,
      })
      .from(teamPagesTable)
      .groupBy(teamPagesTable.league)
      .orderBy(asc(teamPagesTable.league));

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/team-pages", publicRateLimit, async (req, res, next) => {
  try {
    const { country, search } = req.query as Record<string, string | undefined>;
    const filters = [];
    if (country) filters.push(eq(teamPagesTable.country, country));
    if (search) filters.push(ilike(teamPagesTable.name, `%${search}%`));
    const whereClause = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({
        id: teamPagesTable.id,
        name: teamPagesTable.name,
        slug: teamPagesTable.slug,
        shortName: teamPagesTable.shortName,
        country: teamPagesTable.country,
        league: teamPagesTable.league,
        badge: teamPagesTable.badge,
        description: teamPagesTable.description,
        founded: teamPagesTable.founded,
        stadium: teamPagesTable.stadium,
        leaguePosition: teamPagesTable.leaguePosition,
        isDemo: teamPagesTable.isDemo,
      })
      .from(teamPagesTable)
      .where(whereClause)
      .orderBy(asc(teamPagesTable.name));

    res.json({ items: rows, total: rows.length });
  } catch (error) {
    next(error);
  }
});

router.get("/team-pages/:slug", publicRateLimit, async (req, res, next) => {
  try {
    const slugParam = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const slug: string = String(slugParam);

    const [team] = await db
      .select()
      .from(teamPagesTable)
      .where(eq(teamPagesTable.slug, slug));

    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const teamName = team.name;

    const squad = await db
      .select({
        id: playersTable.id,
        name: playersTable.name,
        slug: playersTable.slug,
        nationality: playersTable.nationality,
        position: playersTable.position,
        shirtNumber: playersTable.shirtNumber,
        goals: playersTable.goals,
        assists: playersTable.assists,
        appearances: playersTable.appearances,
      })
      .from(playersTable)
      .where(ilike(playersTable.club, teamName))
      .orderBy(asc(playersTable.position), asc(playersTable.shirtNumber));

    const recentMatches = await db
      .select()
      .from(matchesTable)
      .where(
        or(
          ilike(matchesTable.homeTeamName, teamName),
          ilike(matchesTable.awayTeamName, teamName),
        ),
      )
      .orderBy(desc(matchesTable.matchDate))
      .limit(10);

    const upcomingMatches = await db
      .select()
      .from(matchesTable)
      .where(
        and(
          eq(matchesTable.status, "scheduled"),
          or(
            ilike(matchesTable.homeTeamName, teamName),
            ilike(matchesTable.awayTeamName, teamName),
          ),
        ),
      )
      .orderBy(asc(matchesTable.matchDate))
      .limit(5);

    const relatedTransfers = await db
      .select()
      .from(transfersTable)
      .where(
        or(
          ilike(transfersTable.fromClub, teamName),
          ilike(transfersTable.toClub, teamName),
        ),
      )
      .orderBy(desc(transfersTable.createdAt))
      .limit(8);

    const relatedNews = await db
      .select({
        id: newsTable.id,
        title: newsTable.title,
        slug: newsTable.slug,
        image: newsTable.image,
        description: newsTable.description,
        category: newsTable.category,
        author: newsTable.author,
        publicationDate: newsTable.publicationDate,
        tags: newsTable.tags,
      })
      .from(newsTable)
      .where(
        and(
          eq(newsTable.published, true),
          sql`${teamName} = ANY(${newsTable.tags})`,
        ),
      )
      .orderBy(desc(newsTable.publicationDate))
      .limit(6);

    const last5 = recentMatches.slice(0, 5).reverse();
    const form = last5.map((m) => {
      const isHome = m.homeTeamName.toLowerCase() === teamName.toLowerCase();
      const teamScore = isHome ? m.homeScore : m.awayScore;
      const oppScore = isHome ? m.awayScore : m.homeScore;
      if (teamScore == null || oppScore == null) return "N";
      if (teamScore > oppScore) return "W";
      if (teamScore < oppScore) return "L";
      return "D";
    });

    res.json({
      ...team,
      squad,
      recentMatches,
      upcomingMatches,
      relatedTransfers,
      relatedNews,
      form,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
