import { db, notificationsTable, entityFollowsTable, notificationPreferencesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

type EntityType = "player" | "team" | "league" | "competition" | "partner";

export async function notifyFollowers(params: {
  entityType: EntityType;
  entityId: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  excludeUserId?: number;
}) {
  const { entityType, entityId, type, title, message, link, excludeUserId } = params;

  const followerRows = await db.select({ userId: entityFollowsTable.userId })
    .from(entityFollowsTable)
    .where(and(eq(entityFollowsTable.entityType, entityType), eq(entityFollowsTable.entityId, entityId)));

  const followerIds = followerRows.map((r) => r.userId).filter((id): id is number => id !== null && id !== excludeUserId);
  if (followerIds.length === 0) return { created: 0 };

  const prefsRows = await db.select().from(notificationPreferencesTable)
    .where(inArray(notificationPreferencesTable.userId, followerIds));

  const prefsMap = new Map(prefsRows.map((p) => [p.userId, p]));

  const rowsToInsert: Array<{
    userId: number;
    type: string;
    title: string;
    message: string;
    link: string | null;
  }> = [];

  for (const userId of followerIds) {
    const prefs = prefsMap.get(userId);
    if (prefs && !prefsWithTypeAllowed(prefs, type)) continue;
    rowsToInsert.push({ userId, type, title, message, link: link ?? null });
  }

  if (rowsToInsert.length === 0) return { created: 0 };

  await db.insert(notificationsTable).values(rowsToInsert);
  return { created: rowsToInsert.length };
}

function prefsWithTypeAllowed(prefs: { newArticles: boolean; importantNews: boolean }, type: string): boolean {
  if (type === "new_article" && !prefs.newArticles) return false;
  if (type === "important_news" && !prefs.importantNews) return false;
  return true;
}

export async function createNotification(params: {
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const { userId, type, title, message, link } = params;

  const [existingPref] = await db.select().from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);

  if (existingPref) {
    if (type === "new_article" && !existingPref.newArticles) return false;
    if (type === "important_news" && !existingPref.importantNews) return false;
  }

  await db.insert(notificationsTable).values({
    userId, type, title, message, link: link ?? null,
  });
  return true;
}
