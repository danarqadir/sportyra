import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
export { resolveImageUrl, resolveTeamLogo, resolvePlayerPhoto, resolveCompetitionLogo, resolveMatchImage, batchResolveImages, PLACEHOLDER_LOGOS, PLACEHOLDER_PHOTOS, isValidHttpUrl, isPlaceholderUrl } from "./lib/image-resolver";
export { SportsImageProvider, getImageProvider, resetImageProvider } from "./lib/image-provider";
