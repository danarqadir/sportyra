import { logger } from "./logger";

const DEFAULT_BASE_URL = "https://api.sportmonks.com/v3/football";
const REQUEST_TIMEOUT_MS = 25_000;

function getApiKey(): string | undefined {
  return process.env["SPORTMONKS_API_KEY"];
}

function getBaseUrl(): string {
  return (process.env["SPORTMONKS_BASE_URL"] || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function isSportmonksConfigured(): boolean {
  return typeof getApiKey() === "string" && getApiKey()!.length > 0;
}

export class SportmonksError extends Error {
  public readonly statusCode: number;
  public readonly payload: unknown;
  constructor(statusCode: number, message: string, payload?: unknown) {
    super(message);
    this.name = "SportmonksError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  const apiKey = getApiKey();
  if (apiKey) search.set("api_token", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

type RawResult = {
  status: number;
  json: () => Promise<unknown>;
};

async function rawFetch(path: string, params: Record<string, string | number | boolean | undefined>): Promise<RawResult> {
  const url = `${getBaseUrl()}${path}${buildQuery(params)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    if (aborted) {
      throw new SportmonksError(504, `Sportmonks request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    logger.error({ err, path }, "Sportmonks network request failed");
    throw new SportmonksError(502, "Sportmonks network request failed");
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The key is sent as a query parameter; the URL is never logged, only path + status.
    let msg = `Sportmonks request failed (${res.status})`;
    try {
      const parsed = JSON.parse(detail);
      msg = parsed?.message ?? msg;
    } catch {
      // non-JSON body; keep the generic message
    }
    logger.warn({ status: res.status, path }, "Sportmonks request returned non-ok status");
    throw new SportmonksError(res.status, msg, detail);
  }
  return {
    status: res.status,
    // The key is only sent as a query parameter. Never log the full URL/query.
    json: () => res.json(),
  };
}

async function fetchData<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const { json } = await rawFetch(path, params);
  return (await json()) as T;
}

export interface SportmonksPagination {
  count?: number;
  per_page?: number;
  has_more?: boolean;
  current_page?: number;
  next_page?: number | null;
  next_cursor?: string | null;
}

export interface SportmonksApiResponse<T> {
  data: T;
  message?: string;
  timezone?: string;
  pagination?: SportmonksPagination;
}

export interface SportmonksCountry {
  id?: number;
  name?: string;
  image_path?: string | null;
}

export interface SportmonksLeague {
  id: number;
  name: string;
  image_path?: string | null;
  type?: string;
  country?: SportmonksCountry | null;
  currentSeason?: { id?: number; name?: string | null } | null;
  // Sportmonks v3 returns the included season under a lowercase key.
  currentseason?: { id?: number; name?: string | null } | null;
}

export interface SportmonksTeam {
  id: number;
  name: string;
  short_code?: string | null;
  image_path?: string | null;
  country?: SportmonksCountry | null;
  founded?: number | null;
  venue?: { name?: string | null; capacity?: number | null } | null;
}

export interface SportmonksPlayer {
  id: number;
  name?: string | null;
  common_name?: string | null;
  display_name?: string | null;
  image_path?: string | null;
  nationality?: string | null;
  nationality_id?: number | null;
  country?: { id?: number; name?: string | null } | null;
  date_of_birth?: string | null;
  position?: { id?: number; name?: string | null } | null;
  teams?: Array<{ id?: number; name?: string | null }> | null;
}

export interface SportmonksScoreEntry {
  participant_id: number;
  score?: { goals?: number | null; participant?: string | null } | null;
  description?: string | null;
}

export interface SportmonksState {
  id?: number;
  state?: string | null;
  name?: string | null;
  developer_name?: string | null;
}

export interface SportmonksFixture {
  id: number;
  league_id: number;
  season_id?: number | null;
  state_id?: number | null;
  name?: string | null;
  starting_at: string;
  result_info?: string | null;
  league?: { id?: number; name?: string | null; image_path?: string | null } | null;
  venue?: { id?: number; name?: string | null; capacity?: number | null } | null;
  state?: SportmonksState | null;
  scores?: SportmonksScoreEntry[] | null;
}

export interface SportmonksFixtureEvent {
  player_id?: number | null;
  player_name?: string | null;
  related_player_id?: number | null;
  related_player_name?: string | null;
  participant_id?: number | null;
  result?: string | null;
  minute?: number | null;
  type?: { id?: number; name?: string | null } | null;
}

export interface SportmonksFixtureStatistic {
  type?: { id?: number; name?: string | null } | null;
  location?: string | null;
  data?: { value?: number | string | null } | null;
}

export interface SportmonksFixtureLineup {
  team_id?: number | null;
  player_id?: number | null;
  player_name?: string | null;
  jersey_number?: number | null;
  position_id?: number | null;
  type_id?: number | null;
}

export interface SportmonksFixtureDetail extends SportmonksFixture {
  events?: SportmonksFixtureEvent[] | null;
  statistics?: SportmonksFixtureStatistic[] | null;
  lineups?: SportmonksFixtureLineup[] | null;
}

export interface SportmonksStandingDetail {
  type?: { id?: number; name?: string | null } | null;
  type_id?: number | null;
  value?: number | null;
}

export interface SportmonksStanding {
  participant_id: number;
  position?: number | null;
  points?: number | null;
  participant?: {
    id?: number;
    name?: string | null;
    short_code?: string | null;
    image_path?: string | null;
  } | null;
  details?: SportmonksStandingDetail[] | null;
}

export interface SportmonksTransfer {
  id: number;
  player_id?: number | null;
  type_id?: number | null;
  from_team_id?: number | null;
  to_team_id?: number | null;
  date?: string | null;
  completed?: boolean | null;
  career_ended?: boolean | null;
  amount?: { value?: number | string | null; currency?: string | null } | null;
  player?: {
    id?: number | null;
    display_name?: string | null;
    common_name?: string | null;
    name?: string | null;
    image_path?: string | null;
    date_of_birth?: string | null;
    nationality_id?: number | null;
    country?: { id?: number; name?: string | null } | null;
  } | null;
  fromteam?: { id?: number; name?: string | null; image_path?: string | null } | null;
  toteam?: { id?: number; name?: string | null; image_path?: string | null } | null;
  type?: { id?: number; name?: string | null } | null;
}

export interface SportmonksSquadEntry {
  player_id?: number | null;
  team_id?: number | null;
  jersey_number?: number | null;
  position_id?: number | null;
  start?: string | null;
  end?: string | null;
  player?: {
    id?: number;
    display_name?: string | null;
    common_name?: string | null;
    name?: string | null;
    image_path?: string | null;
    date_of_birth?: string | null;
    nationality_id?: number | null;
    position?: { id?: number; name?: string | null } | null;
    country?: { id?: number; name?: string | null } | null;
  } | null;
}

export async function getLeagues(params: { page?: number; include?: string } = {}): Promise<SportmonksApiResponse<SportmonksLeague[]>> {
  return fetchData<SportmonksApiResponse<SportmonksLeague[]>>("/leagues", {
    page: params.page,
    include: params.include,
  });
}

export async function getTeams(params: { page?: number; include?: string } = {}): Promise<SportmonksApiResponse<SportmonksTeam[]>> {
  return fetchData<SportmonksApiResponse<SportmonksTeam[]>>("/teams", {
    page: params.page,
    include: params.include,
  });
}

export async function getPlayers(params: { page?: number; per_page?: number; include?: string } = {}): Promise<SportmonksApiResponse<SportmonksPlayer[]>> {
  return fetchData<SportmonksApiResponse<SportmonksPlayer[]>>("/players", {
    page: params.page,
    per_page: params.per_page,
    include: params.include,
  });
}

export async function getFixturesBetween(from: string, to: string, params: { page?: number; include?: string } = {}): Promise<SportmonksApiResponse<SportmonksFixture[]>> {
  return fetchData<SportmonksApiResponse<SportmonksFixture[]>>(`/fixtures/between/${from}/${to}`, {
    page: params.page,
    include: params.include,
  });
}

export async function getFixturesByDate(date: string, params: { page?: number; include?: string } = {}): Promise<SportmonksApiResponse<SportmonksFixture[]>> {
  return fetchData<SportmonksApiResponse<SportmonksFixture[]>>(`/fixtures/date/${date}`, {
    page: params.page,
    include: params.include,
  });
}

export async function getLivescoresNow(params: { include?: string } = {}): Promise<SportmonksApiResponse<SportmonksFixture[]>> {
  return fetchData<SportmonksApiResponse<SportmonksFixture[]>>("/livescores/now", {
    include: params.include,
  });
}

export async function getInplayNow(params: { include?: string } = {}): Promise<SportmonksApiResponse<SportmonksFixture[]>> {
  return fetchData<SportmonksApiResponse<SportmonksFixture[]>>("/livescores/inplay", {
    include: params.include,
  });
}

export async function getFixture(id: number, params: { include?: string } = {}): Promise<SportmonksApiResponse<SportmonksFixtureDetail>> {
  return fetchData<SportmonksApiResponse<SportmonksFixtureDetail>>(`/fixtures/${id}`, {
    include: params.include,
  });
}

export async function getStandingsBySeason(seasonId: number, params: { include?: string } = {}): Promise<SportmonksApiResponse<SportmonksStanding[]>> {
  return fetchData<SportmonksApiResponse<SportmonksStanding[]>>(`/standings/seasons/${seasonId}`, {
    include: params.include,
  });
}

export async function getSeasonsByLeague(leagueId: number, params: { include?: string } = {}): Promise<SportmonksApiResponse<SportmonksLeague>> {
  return fetchData<SportmonksApiResponse<SportmonksLeague>>(`/leagues/${leagueId}`, {
    include: params.include,
  });
}

export async function getTransfers(params: { page?: number; include?: string } = {}): Promise<SportmonksApiResponse<SportmonksTransfer[]>> {
  return fetchData<SportmonksApiResponse<SportmonksTransfer[]>>("/transfers", {
    page: params.page,
    include: params.include,
  });
}

export async function getSquadPlayers(teamId: number, params: { include?: string } = {}): Promise<SportmonksApiResponse<SportmonksSquadEntry[]>> {
  return fetchData<SportmonksApiResponse<SportmonksSquadEntry[]>>(`/squads/teams/${teamId}`, {
    include: params.include,
  });
}

/**
 * Returns the SportMonks "type" of a given API error so callers can tell
 * subscription/plan limitations apart from transient failures.
 */
export function isSubscriptionLimitedError(err: unknown): boolean {
  if (err instanceof SportmonksError) {
    const msg = typeof err.payload === "string" ? err.payload : String(err.message || "");
    if (msg.includes("endpoint does not exist")) return true;
    if (msg.includes("You do not have access")) return true;
    if (msg.includes("don't have access") || msg.includes("dont have access")) return true;
    if (msg.includes("No result(s) found")) return true;
    if (msg.includes("Invalid request parameters")) return true;
    return err.statusCode === 401 || err.statusCode === 403;
  }
  return false;
}
