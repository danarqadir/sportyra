import { sql } from "drizzle-orm";

const PLACEHOLDER_LOGOS: Record<string, string> = {
  football: "https://upload.wikimedia.org/wikipedia/en/0/09/English_Football_League_logo.svg",
  basketball: "https://upload.wikimedia.org/wikipedia/en/0/0c/National_Basketball_Association_logo.svg",
  tennis: "https://upload.wikimedia.org/wikipedia/en/d/d3/ATP_Tour_logo.svg",
  motorsport: "https://upload.wikimedia.org/wikipedia/en/4/44/FIA_logo.svg",
};

const PLACEHOLDER_PHOTOS: Record<string, string> = {
  player: "https://i.pravatar.cc/300",
  team: "https://i.pravatar.cc/200",
  default: "https://i.pravatar.cc/300",
};

export type ImageSource = {
  url: string | null;
  source?: string;
  width?: number;
  height?: number;
};

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPlaceholderUrl(url: string): boolean {
  return url.includes("pravatar.cc") || url.includes("via.placeholder.com") || url.includes("placeholder.com");
}

export function resolveImageUrl(imageUrl: string | null | undefined, entityType?: string, entityId?: number): ImageSource {
  if (!imageUrl || imageUrl.trim() === "") {
    return {
      url: PLACEHOLDER_PHOTOS[entityType || "default"] || PLACEHOLDER_PHOTOS.default,
      source: "placeholder",
    };
  }

  const trimmed = imageUrl.trim();

  if (isValidHttpUrl(trimmed) && !isPlaceholderUrl(trimmed)) {
    return { url: trimmed, source: "provided" };
  }

  if (isValidHttpUrl(trimmed) && isPlaceholderUrl(trimmed)) {
    return { url: trimmed, source: "placeholder" };
  }

  if (trimmed.startsWith("/")) {
    return { url: trimmed, source: "local" };
  }

  if (isValidHttpUrl(trimmed)) {
    return { url: trimmed, source: "provided" };
  }

  return {
    url: PLACEHOLDER_PHOTOS[entityType || "default"] || PLACEHOLDER_PHOTOS.default,
    source: "fallback",
  };
}

export function resolveTeamLogo(logoUrl: string | null | undefined, teamId?: number): ImageSource {
  return resolveImageUrl(logoUrl, "team", teamId);
}

export function resolvePlayerPhoto(photoUrl: string | null | undefined, playerId?: number): ImageSource {
  return resolveImageUrl(photoUrl, "player", playerId);
}

export function resolveCompetitionLogo(logoUrl: string | null | undefined, competitionId?: number): ImageSource {
  return resolveImageUrl(logoUrl, "football", competitionId);
}

export function resolveMatchImage(homeTeamLogo: string | null | undefined, awayTeamLogo: string | null | undefined): { home: ImageSource; away: ImageSource } {
  return {
    home: resolveTeamLogo(homeTeamLogo),
    away: resolveTeamLogo(awayTeamLogo),
  };
}

export function batchResolveImages<T extends { id: number; imageUrl?: string | null }>(
  items: T[],
  entityType: string,
): Map<number, ImageSource> {
  const resolved = new Map<number, ImageSource>();
  for (const item of items) {
    resolved.set(item.id, resolveImageUrl(item.imageUrl, entityType, item.id));
  }
  return resolved;
}

export const IMAGE_RESOLVER_SELECT = sql<string>`COALESCE(
  NULLIF(${sql.raw("''")}, ''),
  ${sql.raw("'https://i.pravatar.cc/300'")}
)`;

export { PLACEHOLDER_LOGOS, PLACEHOLDER_PHOTOS, isValidHttpUrl, isPlaceholderUrl };
