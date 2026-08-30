import { db, playersTable, teamsTable } from "@workspace/db";
import { and, inArray, eq } from "drizzle-orm";

export type TransferImageFields = {
  playerPhoto: string | null;
  fromClubLogo: string | null;
  toClubLogo: string | null;
};

/**
 * Enriches transfer rows with the real player photo and both club logos, resolved
 * from existing SportMonks-backed rows (players and teams) by name. If a name has
 * no match we return null so the UI can render a clean fallback — we never invent
 * images.
 */
export async function enrichTransfers<T extends { playerName: string; fromClub: string; toClub: string }>(
  rows: T[],
): Promise<Array<T & TransferImageFields>> {
  if (!rows.length) return rows.map((r) => ({ ...r, playerPhoto: null, fromClubLogo: null, toClubLogo: null }));

  const playerNames = [...new Set(rows.map((r) => r.playerName).filter((n) => n))];
  const clubNames = [...new Set([...rows.map((r) => r.fromClub), ...rows.map((r) => r.toClub)].filter((n) => n))];

  const playerPhotoBy = new Map<string, string>();
  const logoBy = new Map<string, string>();

  if (playerNames.length) {
    const players = await db
      .select({ name: playersTable.name, photoUrl: playersTable.photoUrl })
      .from(playersTable)
      .where(and(inArray(playersTable.name, playerNames), eq(playersTable.isDemo, false)));
    for (const p of players) {
      if (p.photoUrl && !playerPhotoBy.has(p.name)) playerPhotoBy.set(p.name, p.photoUrl);
    }
  }

  if (clubNames.length) {
    const teams = await db
      .select({ name: teamsTable.name, logoUrl: teamsTable.logoUrl })
      .from(teamsTable)
      .where(and(inArray(teamsTable.name, clubNames), eq(teamsTable.isDemo, false)));
    for (const t of teams) {
      if (t.logoUrl && !logoBy.has(t.name)) logoBy.set(t.name, t.logoUrl);
    }
  }

  return rows.map((r) => ({
    ...r,
    playerPhoto: r.playerName ? (playerPhotoBy.get(r.playerName) ?? null) : null,
    fromClubLogo: r.fromClub ? (logoBy.get(r.fromClub) ?? null) : null,
    toClubLogo: r.toClub ? (logoBy.get(r.toClub) ?? null) : null,
  }));
}