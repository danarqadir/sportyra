import { db } from "@workspace/db";
import {
  competitionsTable,
  teamsTable,
  fixturesTable,
  matchesTable,
  playersTable,
  teamPagesTable,
  matchEventsTable,
  matchStatsTable,
  matchLineupsTable,
  transfersTable,
  sportsDataCacheTable,
} from "@workspace/db";
import { and, eq, isNotNull, or, sql, desc } from "drizzle-orm";
import { logger } from "./logger";
import {
  isSportmonksConfigured,
  getLeagues,
  getTeams,
  getPlayers,
  getFixturesBetween,
  getLivescoresNow,
  getInplayNow,
  getFixture,
  getStandingsBySeason,
  getSeasonsByLeague,
  getTransfers,
  getSquadPlayers,
  isSubscriptionLimitedError,
  type SportmonksLeague,
  type SportmonksTeam,
  type SportmonksPlayer,
  type SportmonksFixture,
  type SportmonksFixtureDetail,
  type SportmonksFixtureLineup,
  type SportmonksStanding,
  type SportmonksTransfer,
} from "./sportmonks";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "team"
  );
}

function leagueApiId(id: number): string {
  return `league:${id}`;
}
function teamApiId(id: number): string {
  return `team:${id}`;
}
function fixtureApiId(id: number): string {
  return `fixture:${id}`;
}
function playerApiId(id: number): string {
  return `player:${id}`;
}

async function competitionIdByApiId(apiId: string): Promise<number | null> {
  const [row] = await db.select().from(competitionsTable).where(eq(competitionsTable.apiId, apiId));
  return row?.id ?? null;
}
async function teamIdByApiId(apiId: string): Promise<number | null> {
  const [row] = await db.select().from(teamsTable).where(eq(teamsTable.apiId, apiId));
  return row?.id ?? null;
}
async function playerIdByApiId(apiId: string): Promise<number | null> {
  const [row] = await db.select().from(playersTable).where(eq(playersTable.apiId, apiId));
  return row?.id ?? null;
}
async function teamPageIdByApiId(apiId: string): Promise<number | null> {
  const [row] = await db.select().from(teamPagesTable).where(eq(teamPagesTable.apiId, apiId));
  return row?.id ?? null;
}
async function fixtureIdByApiId(apiId: string): Promise<number | null> {
  const [row] = await db.select().from(fixturesTable).where(eq(fixturesTable.apiId, apiId));
  return row?.id ?? null;
}
async function matchIdByApiId(apiId: string): Promise<number | null> {
  const [row] = await db.select().from(matchesTable).where(eq(matchesTable.apiId, apiId));
  return row?.id ?? null;
}
async function transferIdByApiId(apiId: string): Promise<number | null> {
  const [row] = await db.select().from(transfersTable).where(eq(transfersTable.apiId, apiId));
  return row?.id ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// SportMonks returns bracket/tournament placeholder "teams" (e.g. "Winner Match 1",
// "Loser Semi-final 2", "1st Group A", "TBC", "Retired"). They are not real clubs
// and must never be stored/synced as teams.
const JUNK_TEAM_NAME_RE =
  /\b(winner|loser|semi[- ]?finalist|finalist|tbc|retired)\b|(^|[\s-])\d+(st|nd|rd|th)(\s|$)|(^|[\s-])(ranked|rank|position|group)(\s|$)|play[- ]off path/i;

function isJunkTeamName(name: string): boolean {
  return JUNK_TEAM_NAME_RE.test(name || "");
}

// Player catalog sync cadence. The subscription exposes a finite historical catalog
// via /players; re-fetching all pages every worker cycle is wasteful and risks rate
// limits, so we throttle via the sports_data_cache table.
const PLAYER_CATALOG_SYNC_KEY = "sportmonks:player_catalog_sync";
const PLAYER_CATALOG_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SQUAD_SYNC_KEY = "sportmonks:squad_sync";
const SQUAD_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const TRANSFERS_SYNC_KEY = "sportmonks:transfers_sync";
const TRANSFERS_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const PLAYER_PAGE_DELAY_MS = 120;
const MAX_PLAYER_CATALOG_PAGES = 800; // safety guard (~20k rows); the catalog is ~236 pages

async function getSyncMarker(cacheKey: string): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(sportsDataCacheTable).where(eq(sportsDataCacheTable.cacheKey, cacheKey));
  return row ? (row.data as Record<string, unknown>) : null;
}

async function setSyncMarker(cacheKey: string, ttlMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  const data = { lastRunAt: new Date().toISOString() };
  await db
    .insert(sportsDataCacheTable)
    .values({ cacheKey, data, provider: "sportmonks", expiresAt })
    .onConflictDoUpdate({ target: sportsDataCacheTable.cacheKey, set: { data, expiresAt } });
}

function isSyncDue(marker: Record<string, unknown> | null, intervalMs: number): boolean {
  if (!marker) return true;
  const last = marker.lastRunAt;
  if (typeof last !== "string") return true;
  const t = Date.parse(last);
  if (Number.isNaN(t)) return true;
  return Date.now() - t >= intervalMs;
}

async function ensureCompetition(league: SportmonksLeague): Promise<number> {
  const apiId = leagueApiId(league.id);
  const name = (league.name || "Unknown League").trim();
  const slug = slugify(name);
  const existing = await competitionIdByApiId(apiId);
  if (existing) {
    await db
      .update(competitionsTable)
      .set({ name, country: league.country?.name ?? null, logoUrl: league.image_path ?? null })
      .where(eq(competitionsTable.id, existing));
    return existing;
  }
  try {
    const [row] = await db
      .insert(competitionsTable)
      .values({ name, slug, country: league.country?.name ?? null, sport: "football", logoUrl: league.image_path ?? null, apiId })
      .onConflictDoNothing({ target: competitionsTable.apiId })
      .returning();
    if (row) return row.id;
  } catch {
    // slug collision or race; handled below
  }
  const refetched = await competitionIdByApiId(apiId);
  if (refetched) return refetched;
  const [bySlug] = await db.select().from(competitionsTable).where(eq(competitionsTable.slug, slug)).limit(1);
  if (bySlug) {
    await db.update(competitionsTable).set({ apiId }).where(eq(competitionsTable.id, bySlug.id));
    return bySlug.id;
  }
  const [inserted] = await db
    .insert(competitionsTable)
    .values({ name, slug, country: league.country?.name ?? null, logoUrl: league.image_path ?? null, apiId })
    .returning();
  return inserted.id;
}

async function ensureTeam(team: SportmonksTeam): Promise<number> {
  const apiId = teamApiId(team.id);
  const name = (team.name || "Unknown Team").trim();
  const slug = slugify(name);
  let id = await teamIdByApiId(apiId);
  if (id) {
    await db.update(teamsTable).set({ name, shortName: team.short_code ?? null, logoUrl: team.image_path ?? null }).where(eq(teamsTable.id, id));
  } else {
    try {
      const [row] = await db
        .insert(teamsTable)
        .values({ name, slug, shortName: team.short_code ?? null, logoUrl: team.image_path ?? null, apiId })
        .onConflictDoNothing({ target: teamsTable.apiId })
        .returning();
      if (row) id = row.id;
    } catch {
      // continue to lookup below
    }
    if (!id) id = await teamIdByApiId(apiId);
    if (!id) {
      const [bySlug] = await db.select().from(teamsTable).where(eq(teamsTable.slug, slug)).limit(1);
      if (bySlug) {
        await db.update(teamsTable).set({ apiId }).where(eq(teamsTable.id, bySlug.id));
        id = bySlug.id;
      }
    }
    if (!id) {
      const [inserted] = await db.insert(teamsTable).values({ name, slug, shortName: team.short_code ?? null, logoUrl: team.image_path ?? null, apiId }).returning();
      id = inserted.id;
    }
  }
  return id;
}

async function ensurePlayer(player: SportmonksPlayer): Promise<boolean> {
  const apiId = playerApiId(player.id);
  const name = (player.display_name || player.common_name || player.name || "Unknown Player").trim();
  const slug = slugify(name);
  const position = player.position?.name ?? null;
  const nationality = player.nationality ?? (player.country?.name ?? null);
  // Only use team info SportMonks actually returned for this player. Never invent or
  // guess a club. The /players catalog returns no team data; squads do.
  const hasTeam = Array.isArray(player.teams) && player.teams.length > 0;
  const club = hasTeam ? (player.teams?.[0]?.name ?? null) : null;
  let clubId: number | null = null;
  if (hasTeam) {
    clubId = player.teams?.[0]?.id ? await teamIdByApiId(teamApiId(player.teams[0].id)) : null;
    if (clubId === null && club) {
      const [byName] = await db.select().from(teamsTable).where(eq(teamsTable.name, club)).limit(1);
      clubId = byName?.id ?? null;
    }
  }
  const existing = await playerIdByApiId(apiId);
  if (existing) {
    const updates: Record<string, unknown> = {
      name,
      nationality,
      position,
      photoUrl: player.image_path ?? null,
      updatedAt: new Date(),
    };
    // Do not overwrite an existing club with "null" just because the /players
    // catalog entry carried no team data.
    if (hasTeam) {
      updates.club = club;
      updates.clubId = clubId;
    }
    await db.update(playersTable).set(updates).where(eq(playersTable.id, existing));
    return false;
  }
  const insertValues = {
    name,
    slug,
    nationality,
    dateOfBirth: player.date_of_birth ? new Date(player.date_of_birth) : null,
    position,
    club,
    clubId,
    photoUrl: player.image_path ?? null,
    goals: 0,
    assists: 0,
    appearances: 0,
    trophies: [],
    apiId,
  };
  try {
    const [row] = await db
      .insert(playersTable)
      .values(insertValues)
      .onConflictDoNothing({ target: playersTable.apiId })
      .returning();
    if (row) return true;
  } catch {
    // continue to lookup below
  }
  if (await playerIdByApiId(apiId)) return false;
  // Slug collision with a different SportMonks player: do NOT steal the existing
  // row's apiId. Instead create a disambiguated slug so both real players are kept.
  const [bySlug] = await db.select().from(playersTable).where(eq(playersTable.slug, slug)).limit(1);
  if (bySlug) {
    let candidate = slug;
    let suffix = 1;
    while (
      (await db.select({ id: playersTable.id }).from(playersTable).where(eq(playersTable.slug, candidate)).limit(1)).length > 0
    ) {
      suffix += 1;
      candidate = `${slug}-${suffix}`;
    }
    const [row] = await db
      .insert(playersTable)
      .values({ ...insertValues, slug: candidate })
      .onConflictDoNothing({ target: playersTable.apiId })
      .returning();
    return !!row;
  }
  return false;
}

// Map Sportmonks fixture state to the app's status vocabulary.
function mapStatus(state?: { name?: string | null; developer_name?: string | null } | null, stateId?: number | null): { status: string; minute: number | null } {
  const dev = (state?.developer_name || "").toUpperCase();
  const name = (state?.name || "").toLowerCase();
  if (dev === "FT" || name.includes("full time") || stateId === 5) return { status: "finished", minute: null };
  if (stateId === 3 || dev === "ET" || name.includes("extra") || name.includes("penalt")) return { status: "live", minute: 90 };
  if (name.includes("ht") || dev === "HT" || stateId === 4) return { status: "live", minute: 45 };
  if (stateId === 2 || dev === "1H" || name.includes("first half")) return { status: "live", minute: 30 };
  if (name.includes("cancelled") || name.includes("abandoned") || name.includes("postponed") || stateId === 9 || stateId === 10) return { status: "cancelled", minute: null };
  if (name.includes("not started") || name.includes("scheduled") || stateId === 1 || !state) return { status: "scheduled", minute: null };
  if (stateId === 5) return { status: "finished", minute: null };
  return { status: "scheduled", minute: null };
}

function fixtureScores(fixture: SportmonksFixture): { homeScore: number; awayScore: number } {
  let home = 0;
  let away = 0;
  const entries = fixture.scores ?? [];
  // Prefer the CURRENT score (live/full-time); fall back to the max goals per participant.
  const current = entries.filter((s) => (s.description || "").toUpperCase() === "CURRENT");
  const pool = current.length ? current : entries;
  const goalsByParticipant = new Map<number, number>();
  for (const entry of pool) {
    if (!entry.participant_id) continue;
    const g = entry.score?.goals ?? 0;
    goalsByParticipant.set(entry.participant_id, Math.max(goalsByParticipant.get(entry.participant_id) ?? 0, g));
  }
  // Determine home/away by the score.participant label when available.
  const homePid = pool.find((s) => s.score?.participant === "home")?.participant_id;
  const awayPid = pool.find((s) => s.score?.participant === "away")?.participant_id;
  if (homePid) home = pool.filter((s) => s.participant_id === homePid).reduce((acc, s) => Math.max(acc, s.score?.goals ?? 0), 0);
  if (awayPid) away = pool.filter((s) => s.participant_id === awayPid).reduce((acc, s) => Math.max(acc, s.score?.goals ?? 0), 0);
  // If the plan didn't return participant labels, derive from the fixture name ordering.
  if (homePid === undefined && awayPid === undefined) {
    const ids = [...goalsByParticipant.keys()];
    if (ids.length >= 2) {
      const [first, second] = ids;
      // Order unknown without labels; use the first two participants in array order.
      home = goalsByParticipant.get(first) ?? 0;
      away = goalsByParticipant.get(second) ?? 0;
    }
  }
  return { homeScore: home, awayScore: away };
}

// Split a fixture name like "Horsens vs Viborg FF" into [home, away].
function splitFixtureName(name: string | null | undefined): { home?: string; away?: string } {
  if (!name) return {};
  const parts = name.split(/\s+vs\.?\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) return { home: parts[0], away: parts[1] };
  return {};
}

async function syncMatchDetails(sportmonksFixtureId: number, matchId: number): Promise<void> {
  const detail = await getFixture(sportmonksFixtureId, { include: "events.type;statistics.type;lineups;scores" });
  const data = detail.data as SportmonksFixtureDetail;
  const homePid = (data.scores ?? []).find((s) => s.score?.participant === "home")?.participant_id;
  const awayPid = (data.scores ?? []).find((s) => s.score?.participant === "away")?.participant_id;
  const nameParts = splitFixtureName(data.name);

  await db.transaction(async (tx) => {
    await tx.delete(matchEventsTable).where(eq(matchEventsTable.matchId, matchId));
    await tx.delete(matchStatsTable).where(eq(matchStatsTable.matchId, matchId));
    await tx.delete(matchLineupsTable).where(eq(matchLineupsTable.matchId, matchId));

    for (const ev of data.events ?? []) {
      let teamSide: string | null = null;
      if (homePid !== undefined && ev.participant_id === homePid) teamSide = "home";
      else if (awayPid !== undefined && ev.participant_id === awayPid) teamSide = "away";
      await tx.insert(matchEventsTable).values({
        matchId,
        eventType: ev.type?.name ?? "Event",
        minute: ev.minute ?? null,
        playerId: ev.player_id ?? null,
        playerName: ev.player_name ?? null,
        relatedPlayerId: ev.related_player_id ?? null,
        relatedPlayerName: ev.related_player_name ?? null,
        teamSide,
        detail: ev.result ?? null,
      });
    }

    // Sportmonks v3 returns a fixed set of stat type_ids per match (varies by plan/scorer).
    // Map primarily by type_id (stable across matches), with a name fallback.
    const TYPE_ID_COLUMN: Record<number, keyof typeof matchStatsTable._.columns> = {
      45: "possession",
      72: "shots",
      73: "shotsOnTarget",
      34: "corners",
      89: "fouls",
      24: "offsides",
      84: "yellowCards",
      85: "redCards",
      61: "saves",
    };
    const NAME_COLUMN: Record<string, keyof typeof matchStatsTable._.columns> = {
      possession: "possession",
      ballpossession: "possession",
      shots: "shots",
      shotstotal: "shots",
      shotsongoal: "shots",
      shotsontarget: "shotsOnTarget",
      corners: "corners",
      cornerkicks: "corners",
      fouls: "fouls",
      offsides: "offsides",
      yellowcards: "yellowCards",
      redcards: "redCards",
      saves: "saves",
    };
    const statsByName = new Map<string, { home: number; away: number }>();
    const statsByTypeId = new Map<number, { home: number; away: number }>();
    for (const st of data.statistics ?? []) {
      const value = Number(st.data?.value ?? 0);
      const nameKey = (st.type?.name || "stat").toLowerCase().replace(/[\s]+/g, "");
      const entryByType = statsByTypeId.get(st.type?.id ?? -1) ?? { home: 0, away: 0 };
      const entryByName = statsByName.get(nameKey) ?? { home: 0, away: 0 };
      if (st.location === "home") {
        entryByType.home = value;
        entryByName.home = value;
      } else if (st.location === "away") {
        entryByType.away = value;
        entryByName.away = value;
      }
      if (st.type?.id) statsByTypeId.set(st.type.id, entryByType);
      statsByName.set(nameKey, entryByName);
    }
    const statRows: Record<string, { home: number; away: number }> = {};
    const assignStat = (target: string, value: { home: number; away: number }) => {
      if (target && statRows[target] === undefined) statRows[target] = value;
    };
    for (const [typeId, value] of statsByTypeId) {
      const target = TYPE_ID_COLUMN[typeId];
      if (target) assignStat(target, value);
    }
    for (const [nameKey, value] of statsByName) {
      const target = NAME_COLUMN[nameKey];
      if (target) assignStat(target, value);
    }
    await tx.insert(matchStatsTable).values({ matchId, ...statRows });

    // Lineups come back as a flat list of players; group by team_id into two sides.
    const byTeam = new Map<number, SportmonksFixtureLineup[]>();
    for (const lu of data.lineups ?? []) {
      if (!lu.team_id) continue;
      const list = byTeam.get(lu.team_id) ?? [];
      list.push(lu);
      byTeam.set(lu.team_id, list);
    }
    const homeTeamId = homePid ?? (nameParts.home ? 0 : undefined);
    for (const [teamId, players] of byTeam) {
      const teamSide = teamId === homeTeamId ? "home" : "away";
      const lineup = players.map((p) => ({
        playerId: p.player_id ?? null,
        name: p.player_name ?? null,
        shirtNumber: p.jersey_number ?? null,
        position: null,
      }));
      await tx.insert(matchLineupsTable).values({
        matchId,
        teamSide,
        formation: null,
        lineup: lineup as unknown as object,
      });
    }
  });
}

// Recompute real per-player season aggregates (goals/assists/appearances/minutes/cards)
// exclusively from synced match details (events + lineups) of finished, non-demo matches.
// Every number is derived from real Sportmonks data — nothing is fabricated.
export async function recomputePlayerStats(): Promise<{ players: number }> {
  const finished = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(and(eq(matchesTable.status, "finished"), eq(matchesTable.isDemo, false), isNotNull(matchesTable.apiId)));

  // Sportmonks player id -> aggregate counters
  interface PlayerAgg {
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    appearances: number;
    minutes: number;
  }
  const acc = new Map<number, PlayerAgg>();
  const bump = (pid: number): PlayerAgg => {
    let e = acc.get(pid);
    if (!e) {
      e = { goals: 0, assists: 0, yellow: 0, red: 0, appearances: 0, minutes: 0 };
      acc.set(pid, e);
    }
    return e;
  };

  for (const m of finished) {
    const [events, lineups] = await Promise.all([
      db.select().from(matchEventsTable).where(eq(matchEventsTable.matchId, m.id)),
      db.select().from(matchLineupsTable).where(eq(matchLineupsTable.matchId, m.id)),
    ]);

    // Who started (in a lineup), and per-player sub-off minute.
    const started = new Set<number>();
    for (const lu of lineups) {
      const arr = (lu.lineup as { playerId?: number | null }[] | null) ?? [];
      for (const p of arr) {
        if (p?.playerId != null) started.add(p.playerId);
      }
    }

    // Player set that genuinely appeared in this match.
    const appeared = new Set<number>(started);
    const subOffMinute = new Map<number, number>();
    const subOnMinute = new Map<number, number>();

    for (const ev of events) {
      if (ev.playerId != null) appeared.add(ev.playerId);
      if (ev.relatedPlayerId != null) appeared.add(ev.relatedPlayerId);
      const t = (ev.eventType || "").toLowerCase();
      if (t.includes("substitution") || t.includes("substituted")) {
        if (ev.playerId != null) subOffMinute.set(ev.playerId, ev.minute ?? 0);
        if (ev.relatedPlayerId != null) subOnMinute.set(ev.relatedPlayerId, ev.minute ?? 0);
      }
    }

    for (const pid of appeared) {
      const e = bump(pid);
      e.appearances += 1;
    }
    // Minutes: starters 90 unless subbed off; subs (90 - sub-on minute).
    for (const pid of started) {
      const off = subOffMinute.get(pid);
      bump(pid).minutes += off != null ? off : 90;
    }
    for (const [pid, on] of subOnMinute) {
      bump(pid).minutes += on >= 0 ? 90 - on : 0;
    }

    for (const ev of events) {
      const t = (ev.eventType || "").toLowerCase();
      if (t.includes("missed") || t.includes("disallowed") || t.includes("cancelled")) continue;
      if (t.includes("goal")) {
        if (ev.playerId != null) bump(ev.playerId).goals += 1;
        if (ev.relatedPlayerId != null) bump(ev.relatedPlayerId).assists += 1;
      } else if (t.includes("yellow")) {
        if (ev.playerId != null) bump(ev.playerId).yellow += 1;
      } else if (t.includes("red")) {
        if (ev.playerId != null) bump(ev.playerId).red += 1;
      }
    }
  }

  let players = 0;
  for (const [sportmonksPid, s] of acc) {
    const dbPlayerId = await playerIdByApiId(playerApiId(sportmonksPid));
    if (!dbPlayerId) continue;
    await db
      .update(playersTable)
      .set({
        goals: s.goals,
        assists: s.assists,
        appearances: s.appearances,
        minutes: s.minutes,
        yellowCards: s.yellow,
        redCards: s.red,
        updatedAt: new Date(),
      })
      .where(eq(playersTable.id, dbPlayerId));
    players++;
  }
  logger.info({ players }, "Sportmonks: player stats recomputed");
  return { players };
}

async function syncFixtureEntity(fixture: SportmonksFixture, includeDetails = false): Promise<void> {
  const apiId = fixtureApiId(fixture.id);
  const competitionId = await competitionIdByApiId(leagueApiId(fixture.league_id));
  if (!competitionId) return;

  // Team ids from scores participant ids; names from the teams table (synced first).
  const homePid = (fixture.scores ?? []).find((s) => s.score?.participant === "home")?.participant_id;
  const awayPid = (fixture.scores ?? []).find((s) => s.score?.participant === "away")?.participant_id;
  const nameParts = splitFixtureName(fixture.name);

  let homeTeamId: number | null = homePid ? await teamIdByApiId(teamApiId(homePid)) : null;
  let awayTeamId: number | null = awayPid ? await teamIdByApiId(teamApiId(awayPid)) : null;

  // Fallback: match by team name (via the fixture name split) if ids aren't resolvable yet.
  let homeName = homePid ? (await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, homeTeamId ?? -1)))[0]?.name : undefined;
  let awayName = awayPid ? (await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, awayTeamId ?? -1)))[0]?.name : undefined;
  if (!homeName && nameParts.home) {
    const [t] = await db.select().from(teamsTable).where(eq(teamsTable.name, nameParts.home)).limit(1);
    if (t) {
      homeName = t.name;
      homeTeamId = t.id;
    }
  }
  if (!awayName && nameParts.away) {
    const [t] = await db.select().from(teamsTable).where(eq(teamsTable.name, nameParts.away)).limit(1);
    if (t) {
      awayName = t.name;
      awayTeamId = t.id;
    }
  }

  const start = new Date(fixture.starting_at);
  const { status, minute } = mapStatus(fixture.state, fixture.state_id);
  const { homeScore, awayScore } = fixtureScores(fixture);
  const venue = fixture.venue?.name ?? null;

  if (homeTeamId && awayTeamId) {
    const existingFixture = await fixtureIdByApiId(apiId);
    if (existingFixture) {
      await db
        .update(fixturesTable)
        .set({
          competitionId,
          homeTeamId,
          awayTeamId,
          homeScore,
          awayScore,
          status,
          matchDate: start,
          venue,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(fixturesTable.id, existingFixture));
    } else {
      try {
        const [row] = await db
          .insert(fixturesTable)
          .values({
            competitionId,
            homeTeamId,
            awayTeamId,
            homeScore,
            awayScore,
            status,
            matchDate: start,
            venue,
            apiId,
            lastSyncedAt: new Date(),
          })
          .onConflictDoNothing({ target: fixturesTable.apiId })
          .returning();
        if (!row) {
          const refetched = await fixtureIdByApiId(apiId);
          if (refetched) {
            await db
              .update(fixturesTable)
              .set({ competitionId, homeTeamId, awayTeamId, homeScore, awayScore, status, matchDate: start, venue, lastSyncedAt: new Date(), updatedAt: new Date() })
              .where(eq(fixturesTable.id, refetched));
          }
        }
      } catch {
        // race; later pass reconciles
      }
    }
  }

  // Denormalized matches table for the /api/matches frontend endpoint.
  if (homeName && awayName) {
    const existingMatch = await matchIdByApiId(apiId);
    const homeLogo = homeTeamId ? (await db.select({ logoUrl: teamsTable.logoUrl }).from(teamsTable).where(eq(teamsTable.id, homeTeamId)))[0]?.logoUrl ?? null : null;
    const awayLogo = awayTeamId ? (await db.select({ logoUrl: teamsTable.logoUrl }).from(teamsTable).where(eq(teamsTable.id, awayTeamId)))[0]?.logoUrl ?? null : null;
    const values = {
      competitionId,
      homeTeamId,
      awayTeamId,
      homeTeamName: homeName,
      awayTeamName: awayName,
      homeTeamLogo: homeLogo,
      awayTeamLogo: awayLogo,
      homeScore,
      awayScore,
      status,
      minute,
      matchDate: start,
      venue,
      competitionName: fixture.league?.name ?? null,
      competitionLogo: fixture.league?.image_path ?? null,
      apiId,
      updatedAt: new Date(),
    };
    if (existingMatch) {
      await db.update(matchesTable).set(values).where(eq(matchesTable.id, existingMatch));
      if (includeDetails) await syncMatchDetails(fixture.id, existingMatch);
    } else {
      try {
        const [row] = await db.insert(matchesTable).values(values).onConflictDoNothing({ target: matchesTable.apiId }).returning();
        if (includeDetails && row) await syncMatchDetails(fixture.id, row.id);
      } catch {
        // skip on race; a later sync pass reconciles
      }
    }
  }
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  // The subscription caps fixtures/between at a 100-day range. -60/+30 keeps within
  // that limit while covering the whole current season's finished matches (the 2026/27
  // Danish Superliga and Scottish Premiership seasons both started in late July 2026).
  const from = new Date(now);
  from.setDate(from.getDate() - 60);
  const to = new Date(now);
  to.setDate(to.getDate() + 30);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(from), to: fmt(to) };
}

export async function syncLeagues(): Promise<number> {
  if (!isSportmonksConfigured()) return 0;
  logger.info("Sportmonks: syncing leagues");
  let count = 0;
  let page = 1;
  let hasMore = true;
  do {
    const res = await getLeagues({ page, include: "country;currentSeason" });
    for (const league of res.data ?? []) {
      await ensureCompetition(league);
      count++;
    }
    hasMore = !!res.pagination?.has_more;
    page++;
  } while (hasMore && page <= 200);
  logger.info({ count }, "Sportmonks: leagues synced");
  return count;
}

export async function syncTeams(): Promise<number> {
  if (!isSportmonksConfigured()) return 0;
  logger.info("Sportmonks: syncing teams");
  let count = 0;
  let skipped = 0;
  let page = 1;
  let hasMore = true;
  do {
    const res = await getTeams({ page, include: "country;venue" });
    for (const team of res.data ?? []) {
      // Never store bracket/tournament placeholder teams.
      if (isJunkTeamName(team.name || "")) {
        skipped++;
        continue;
      }
      await ensureTeam(team);
      count++;
    }
    hasMore = !!res.pagination?.has_more;
    page++;
  } while (hasMore && page <= 200);
  logger.info({ count, skipped }, "Sportmonks: teams synced");
  return count;
}

export async function syncPlayers(force = false): Promise<number> {
  if (!isSportmonksConfigured()) return 0;
  let count = 0;

  // 1) Full catalog via /players. Paginate until SportMonks says there are no more
  //    pages (has_more=false). No arbitrary page cap, dedup handled by ensurePlayer
  //    keyed on the SportMonks player id.
  const catalogMarker = await getSyncMarker(PLAYER_CATALOG_SYNC_KEY);
  if (force || isSyncDue(catalogMarker, PLAYER_CATALOG_SYNC_INTERVAL_MS)) {
    logger.info("Sportmonks: syncing full player catalog via /players");
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= MAX_PLAYER_CATALOG_PAGES) {
      const res = await getPlayers({ page, include: "position;country" });
      const rows = res.data ?? [];
      for (const p of rows) {
        if (await ensurePlayer(p)) count++;
      }
      hasMore = !!res.pagination?.has_more;
      page++;
      if (hasMore) await sleep(PLAYER_PAGE_DELAY_MS);
    }
    await setSyncMarker(PLAYER_CATALOG_SYNC_KEY, PLAYER_CATALOG_SYNC_INTERVAL_MS);
    logger.info({ count, pages: page - 1 }, "Sportmonks: player catalog synced");
  } else {
    logger.info("Sportmonks: player catalog sync skipped (not due yet)");
  }

  // 2) Club resolution pass: /players returns no team info, so attach current clubs
  //    from squads of real subscribed-league teams (junk placeholder teams excluded).
  const squadMarker = await getSyncMarker(SQUAD_SYNC_KEY);
  if (force || isSyncDue(squadMarker, SQUAD_SYNC_INTERVAL_MS)) {
    logger.info("Sportmonks: syncing squad clubs for subscribed teams");
    const teams = await db
      .select({ id: teamsTable.id, name: teamsTable.name, apiId: teamsTable.apiId })
      .from(teamsTable)
      .where(and(isNotNull(teamsTable.apiId), eq(teamsTable.sport, "football"), eq(teamsTable.isDemo, false)));
    let processed = 0;
    for (const team of teams) {
      if (!team.apiId || !team.apiId.startsWith("team:")) continue;
      const sportmonksTeamId = Number(team.apiId.slice("team:".length));
      if (!Number.isInteger(sportmonksTeamId)) continue;
      if (isJunkTeamName(team.name)) continue;
      processed++;
      try {
        const res = await getSquadPlayers(sportmonksTeamId, { include: "player;player.position;player.country" });
        for (const entry of res.data ?? []) {
          const player = entry.player;
          if (!player) continue;
          const synced = await ensurePlayer({
            id: player.id as number,
            name: player.name ?? null,
            common_name: player.common_name ?? null,
            display_name: player.display_name ?? null,
            image_path: player.image_path ?? null,
            nationality: player.country?.name ?? null,
            country: player.country ?? null,
            date_of_birth: player.date_of_birth ?? null,
            position: player.position ?? null,
            teams: [{ id: sportmonksTeamId, name: team.name }],
          });
          if (synced) count++;
        }
      } catch (err) {
        if (isSubscriptionLimitedError(err)) {
          logger.warn({ team: team.name }, "Sportmonks: squad endpoint unavailable on this subscription; skipped team");
        } else {
          logger.warn({ err, team: team.name }, "Sportmonks: squad sync failed for team");
        }
      }
      await sleep(50);
    }
    await setSyncMarker(SQUAD_SYNC_KEY, SQUAD_SYNC_INTERVAL_MS);
    logger.info({ teams: processed }, "Sportmonks: squad club sync complete");
  } else {
    logger.info("Sportmonks: squad club sync skipped (not due yet)");
  }

  return count;
}

export async function syncFixtures(from: string, to: string): Promise<number> {
  if (!isSportmonksConfigured()) return 0;
  logger.info({ from, to }, "Sportmonks: syncing fixtures");
  let count = 0;
  let page = 1;
  let hasMore = true;
  do {
    const res = await getFixturesBetween(from, to, { page, include: "league;venue;state;scores" });
    for (const fixture of res.data ?? []) {
      await syncFixtureEntity(fixture, false);
      count++;
    }
    hasMore = !!res.pagination?.has_more;
    page++;
  } while (hasMore && page <= 200);
  logger.info({ count }, "Sportmonks: fixtures synced");
  return count;
}

export async function syncLivescores(): Promise<number> {
  if (!isSportmonksConfigured()) return 0;
  logger.info("Sportmonks: syncing livescores");
  let count = 0;
  try {
    const now = await getLivescoresNow({ include: "league;venue;state;scores" });
    for (const fixture of now.data ?? []) {
      await syncFixtureEntity(fixture, false);
      count++;
    }
  } catch (err) {
    if (isSubscriptionLimitedError(err)) {
      logger.warn("Sportmonks: live scores are NOT available on the current subscription; skipped");
    } else {
      logger.warn({ err }, "Sportmonks: livescores sync failed");
    }
  }
  try {
    const inplay = await getInplayNow({ include: "league;venue;state;scores" });
    for (const fixture of inplay.data ?? []) {
      await syncFixtureEntity(fixture, false);
      count++;
    }
  } catch (err) {
    if (isSubscriptionLimitedError(err)) {
      logger.warn("Sportmonks: in-play scores are NOT available on the current subscription; skipped");
    } else {
      logger.warn({ err }, "Sportmonks: in-play sync failed");
    }
  }
  return count;
}

export async function syncMatchDetailsByApiId(sportmonksFixtureId: number): Promise<boolean> {
  if (!isSportmonksConfigured()) return false;
  const matchId = await matchIdByApiId(fixtureApiId(sportmonksFixtureId));
  if (!matchId) return false;
  await syncMatchDetails(sportmonksFixtureId, matchId);
  return true;
}

function transferStatus(tr: SportmonksTransfer): string {
  if (tr.completed === true || tr.career_ended === true) return "completed";
  if (tr.type?.name && /loan/i.test(tr.type.name)) return "negotiating";
  return "rumour";
}

function transferType(tr: SportmonksTransfer): string {
  if (tr.type?.name && /loan/i.test(tr.type.name)) return "loan";
  return "permanent";
}

function formatTransferFee(amount: SportmonksTransfer["amount"]): string | null {
  if (!amount || amount.value == null) return null;
  const value = Number(amount.value);
  if (Number.isNaN(value)) return null;
  const currency = amount.currency?.toUpperCase() || "EUR";
  const millions = value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M` : String(value);
  return `${currency} ${millions}`;
}

export async function syncTransfers(force = false): Promise<number> {
  if (!isSportmonksConfigured()) return 0;
  const marker = await getSyncMarker(TRANSFERS_SYNC_KEY);
  if (!force && !isSyncDue(marker, TRANSFERS_SYNC_INTERVAL_MS)) {
    logger.info("Sportmonks: transfers sync skipped (not due yet)");
    return 0;
  }
  logger.info("Sportmonks: syncing transfers");
  let count = 0;
  let page = 1;
  let hasMore = true;
  try {
    do {
      const res = await getTransfers({ page, include: "player;fromTeam;toTeam;type" });
      for (const tr of res.data ?? []) {
        const apiId = `transfer:${tr.id}`;
        const playerName = (tr.player?.display_name || tr.player?.common_name || tr.player?.name || "Unknown Player").trim();
        const fromClub = (tr.fromteam?.name || "").trim();
        const toClub = (tr.toteam?.name || "").trim();
        if (!fromClub || !toClub) continue;
        const existing = await transferIdByApiId(apiId);
        const values = {
          playerName,
          playerId: tr.player_id ?? null,
          fromClub,
          toClub,
          fee: formatTransferFee(tr.amount),
          status: transferStatus(tr),
          transferType: transferType(tr),
          transferDate: tr.date ? new Date(tr.date) : null,
          source: "Sportmonks",
          confidence: tr.completed === true ? 100 : 60,
          apiId,
          isDemo: false,
        };
        if (existing) {
          await db.update(transfersTable).set(values).where(eq(transfersTable.id, existing));
        } else {
          try {
            const [row] = await db.insert(transfersTable).values(values).onConflictDoNothing({ target: transfersTable.apiId }).returning();
            if (row) count++;
          } catch {
            const refetched = await transferIdByApiId(apiId);
            if (refetched) await db.update(transfersTable).set(values).where(eq(transfersTable.id, refetched));
          }
        }
      }
      hasMore = !!res.pagination?.has_more;
      page++;
      if (hasMore) await sleep(80);
    } while (hasMore && page <= 200);
    await setSyncMarker(TRANSFERS_SYNC_KEY, TRANSFERS_SYNC_INTERVAL_MS);
  } catch (err) {
    if (isSubscriptionLimitedError(err)) {
      logger.warn({ err }, "Sportmonks: transfers endpoint unavailable on this subscription; skipped");
    } else {
      logger.warn({ err }, "Sportmonks: transfers sync failed");
    }
  }
  logger.info({ count }, "Sportmonks: transfers synced");
  return count;
}

// Standing detail names via include=details.type; fall back to well-known type ids.
// Only the OVERALL stat group (type_ids 129-134) is used; home/away variants must be ignored.
const STANDING_DETAIL_TYPES: Record<string, string> = {
  "129": "overall_matches_played",
  "130": "overall_won",
  "131": "overall_draw",
  "132": "overall_lost",
  "133": "overall_goals_for",
  "134": "overall_goals_against",
};

function standingFields(standing: SportmonksStanding) {
  const fields: Record<string, number> = {};
  for (const d of standing.details ?? []) {
    const typeId = String(d.type_id ?? "");
    const statGroup = (d.type as unknown as { stat_group?: string } | undefined)?.stat_group;
    if (statGroup && statGroup !== "overall") continue;
    const fromMap = STANDING_DETAIL_TYPES[typeId];
    if (!fromMap) continue;
    const value = d.value ?? 0;
    switch (fromMap) {
      case "overall_matches_played":
        fields.played = value;
        break;
      case "overall_won":
        fields.won = value;
        break;
      case "overall_draw":
        fields.drawn = value;
        break;
      case "overall_lost":
        fields.lost = value;
        break;
      case "overall_goals_for":
        fields.goalsFor = value;
        break;
      case "overall_goals_against":
        fields.goalsAgainst = value;
        break;
    }
  }
  if (fields.won !== undefined && fields.drawn !== undefined && fields.lost !== undefined && fields.played === undefined) {
    fields.played = fields.won + fields.drawn + fields.lost;
  }
  return fields;
}

async function syncStandingsForSeason(leagueId: number, seasonId: number): Promise<number> {
  const res = await getStandingsBySeason(seasonId, { include: "participant;details.type" });
  const standings: SportmonksStanding[] = res.data ?? [];
  let updated = 0;

  const competitionId = await competitionIdByApiId(leagueApiId(leagueId));
  if (!competitionId) return updated;
  const [comp] = await db.select().from(competitionsTable).where(eq(competitionsTable.id, competitionId));
  if (!comp) return updated;
  const leagueName = comp.name;
  const leagueCountry = comp.country ?? "Unknown";

  for (const standing of standings) {
    const teamApiKey = teamApiId(standing.participant_id);
    const teamName = (standing.participant?.name ?? "").trim();
    if (!teamName) continue;
    const f = standingFields(standing);
    const teamRowId = await teamIdByApiId(teamApiKey);
    // Ensure the team exists in teamsTable for FK integrity.
    if (!teamRowId) {
      await ensureTeam({
        id: standing.participant_id,
        name: teamName,
        short_code: standing.participant?.short_code ?? null,
        image_path: standing.participant?.image_path ?? null,
      });
    }

    const existing = await teamPageIdByApiId(teamApiKey);
    const pageValues = {
      teamId: teamRowId,
      name: teamName,
      shortName: standing.participant?.short_code ?? null,
      country: leagueCountry,
      league: leagueName,
      badge: standing.participant?.image_path ?? null,
      leaguePosition: standing.position ?? null,
      points: standing.points ?? 0,
      played: f.played ?? 0,
      won: f.won ?? 0,
      drawn: f.drawn ?? 0,
      lost: f.lost ?? 0,
      goalsFor: f.goalsFor ?? 0,
      goalsAgainst: f.goalsAgainst ?? 0,
    };
    if (existing) {
      await db.update(teamPagesTable).set(pageValues).where(eq(teamPagesTable.id, existing));
      updated++;
    } else {
      const slug = slugify(teamName);
      try {
        const [row] = await db.insert(teamPagesTable).values({ ...pageValues, slug, apiId: teamApiKey }).onConflictDoNothing({ target: teamPagesTable.apiId }).returning();
        if (row) updated++;
      } catch {
        const refetched = await teamPageIdByApiId(teamApiKey);
        if (refetched) {
          await db.update(teamPagesTable).set(pageValues).where(eq(teamPagesTable.id, refetched));
          updated++;
        }
      }
    }
  }
  return updated;
}

async function getCurrentSeasonId(leagueId: number): Promise<number | null> {
  try {
    const res = await getSeasonsByLeague(leagueId, { include: "currentSeason" });
    const s = res.data?.currentseason ?? res.data?.currentSeason;
    return s?.id ?? null;
  } catch {
    return null;
  }
}

export async function syncStandings(leagueApiId?: number): Promise<number> {
  if (!isSportmonksConfigured()) return 0;
  logger.info("Sportmonks: syncing standings");
  if (leagueApiId) {
    const seasonId = await getCurrentSeasonId(leagueApiId);
    return seasonId ? syncStandingsForSeason(leagueApiId, seasonId) : 0;
  }

  let updated = 0;
  const competitions = await db.select().from(competitionsTable);
  for (const competition of competitions) {
    if (!competition.apiId || !competition.apiId.startsWith("league:")) continue;
    const leagueId = Number(competition.apiId.slice("league:".length));
    if (!Number.isInteger(leagueId)) continue;
    const seasonId = await getCurrentSeasonId(leagueId);
    if (!seasonId) continue;
    try {
      updated += await syncStandingsForSeason(leagueId, seasonId);
    } catch (err) {
      logger.warn({ err, league: competition.name }, "Sportmonks: standings sync failed for league");
    }
  }
  logger.info({ updated }, "Sportmonks: standings synced");
  return updated;
}

export interface SyncSummary {
  leagues: number;
  teams: number;
  players: number;
  fixtures: number;
  livescores: number;
  standings: number;
  matchDetails: number;
  playerStats: number;
  transfers: number;
  configured: boolean;
}

export async function runSportmonksSync(options: {
  leagues?: boolean;
  teams?: boolean;
  players?: boolean;
  fixtures?: boolean;
  livescores?: boolean;
  standings?: boolean;
  matchDetails?: boolean;
  playerStats?: boolean;
  transfers?: boolean;
  forcePlayers?: boolean;
  forceTransfers?: boolean;
} = {}): Promise<SyncSummary> {
  const configured = isSportmonksConfigured();
  if (!configured) {
    logger.warn("Sportmonks sync skipped: SPORTMONKS_API_KEY not configured");
  }
  const summary: SyncSummary = {
    leagues: 0,
    teams: 0,
    players: 0,
    fixtures: 0,
    livescores: 0,
    standings: 0,
    matchDetails: 0,
    playerStats: 0,
    transfers: 0,
    configured,
  };

  // Each step is isolated so one failure never aborts the remaining sync work.
  if (options.leagues) {
    try { summary.leagues = await syncLeagues(); } catch (err) { logger.warn({ err }, "Sportmonks: league sync failed"); }
  }
  if (options.teams) {
    try { summary.teams = await syncTeams(); } catch (err) { logger.warn({ err }, "Sportmonks: team sync failed"); }
  }
  if (options.players) {
    try { summary.players = await syncPlayers(!!options.forcePlayers); } catch (err) { logger.warn({ err }, "Sportmonks: player sync failed"); }
  }
  if (options.fixtures) {
    const { from, to } = todayRange();
    try { summary.fixtures = await syncFixtures(from, to); } catch (err) { logger.warn({ err }, "Sportmonks: fixture sync failed"); }
  }
  if (options.livescores) {
    try { summary.livescores = await syncLivescores(); } catch (err) { logger.warn({ err }, "Sportmonks: livescores sync failed"); }
  }
  if (options.standings) {
    try { summary.standings = await syncStandings(); } catch (err) { logger.warn({ err }, "Sportmonks: standings sync failed"); }
  }
  if (options.transfers) {
    try { summary.transfers = await syncTransfers(!!options.forceTransfers); } catch (err) { logger.warn({ err }, "Sportmonks: transfers sync failed"); }
  }
  if (options.matchDetails) {
    const finished = await db.select().from(fixturesTable).where(eq(fixturesTable.status, "finished"));
    for (const fixture of finished) {
      if (!fixture.apiId || !fixture.apiId.startsWith("fixture:")) continue;
      const apiId = Number(fixture.apiId.slice("fixture:".length));
      if (!Number.isInteger(apiId)) continue;
      try {
        const ok = await syncMatchDetailsByApiId(apiId);
        if (ok) summary.matchDetails++;
      } catch (err) {
        logger.warn({ err, fixture: fixture.id }, "Sportmonks: match detail sync failed");
      }
    }
  }
  if (options.playerStats) {
    try {
      const r = await recomputePlayerStats();
      summary.playerStats = r.players;
    } catch (err) { logger.warn({ err }, "Sportmonks: player stats recompute failed"); }
  }

  logger.info({ summary }, "Sportmonks: sync complete");
  return summary;
}
