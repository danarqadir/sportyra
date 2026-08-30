import { Router } from "express";
import { db, entityFollowsTable, usersTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { requireUser } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";

const router = Router();
const followRateLimit = rateLimit({ windowMs: 60_000, max: 30 });

const VALID_ENTITY_TYPES = ["player", "team", "league", "competition", "partner"] as const;
type EntityType = (typeof VALID_ENTITY_TYPES)[number];

function isValidEntityType(v: string): v is EntityType {
  return (VALID_ENTITY_TYPES as readonly string[]).includes(v);
}

router.post("/follows", followRateLimit, requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };
    const { entityType, entityId } = req.body as { entityType?: string; entityId?: number };
    if (!entityType || !isValidEntityType(entityType)) { res.status(400).json({ error: "Invalid entityType. Must be one of: player, team, league, competition, partner" }); return; }
    if (!entityId || !Number.isInteger(entityId) || entityId <= 0) { res.status(400).json({ error: "Invalid entityId" }); return; }

    const [existing] = await db.select().from(entityFollowsTable)
      .where(and(eq(entityFollowsTable.userId, user.id), eq(entityFollowsTable.entityType, entityType), eq(entityFollowsTable.entityId, entityId)))
      .limit(1);
    if (existing) { res.json({ followed: true, alreadyFollowing: true }); return; }

    await db.insert(entityFollowsTable).values({ userId: user.id, entityType, entityId });
    res.json({ followed: true, alreadyFollowing: false });
  } catch (error) { next(error); }
});

router.delete("/follows/:entityType/:entityId", followRateLimit, requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };
    const entityType = String(req.params.entityType);
    const entityId = String(req.params.entityId);
    if (!isValidEntityType(entityType)) { res.status(400).json({ error: "Invalid entityType" }); return; }
    const eid = Number(entityId);
    if (!Number.isInteger(eid) || eid <= 0) { res.status(400).json({ error: "Invalid entityId" }); return; }

    const [existing] = await db.select().from(entityFollowsTable)
      .where(and(eq(entityFollowsTable.userId, user.id), eq(entityFollowsTable.entityType, entityType), eq(entityFollowsTable.entityId, eid)))
      .limit(1);
    if (!existing) { res.json({ unfollowed: true, wasFollowing: false }); return; }

    await db.delete(entityFollowsTable)
      .where(and(eq(entityFollowsTable.userId, user.id), eq(entityFollowsTable.entityType, entityType), eq(entityFollowsTable.entityId, eid)));
    res.json({ unfollowed: true, wasFollowing: true });
  } catch (error) { next(error); }
});

router.get("/follows/check/:entityType/:entityId", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };
    const entityType = String(req.params.entityType);
    const entityId = String(req.params.entityId);
    if (!isValidEntityType(entityType)) { res.status(400).json({ error: "Invalid entityType" }); return; }
    const eid = Number(entityId);
    if (!Number.isInteger(eid) || eid <= 0) { res.status(400).json({ error: "Invalid entityId" }); return; }

    const [existing] = await db.select().from(entityFollowsTable)
      .where(and(eq(entityFollowsTable.userId, user.id), eq(entityFollowsTable.entityType, entityType), eq(entityFollowsTable.entityId, eid)))
      .limit(1);
    res.json({ following: !!existing });
  } catch (error) { next(error); }
});

router.get("/follows/:entityType/:entityId/count", async (req, res, next) => {
  try {
    const entityType = String(req.params.entityType);
    const entityId = String(req.params.entityId);
    if (!isValidEntityType(entityType)) { res.status(400).json({ error: "Invalid entityType" }); return; }
    const eid = Number(entityId);
    if (!Number.isInteger(eid) || eid <= 0) { res.status(400).json({ error: "Invalid entityId" }); return; }

    const [row] = await db.select({ total: count() }).from(entityFollowsTable)
      .where(and(eq(entityFollowsTable.entityType, entityType), eq(entityFollowsTable.entityId, eid)));
    res.json({ count: Number(row?.total ?? 0) });
  } catch (error) { next(error); }
});

router.get("/follows/my", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.user as { id: number };
    const { entityType } = req.query as Record<string, string | undefined>;
    const conditions = [eq(entityFollowsTable.userId, user.id)];
    if (entityType && isValidEntityType(entityType)) {
      conditions.push(eq(entityFollowsTable.entityType, entityType));
    }

    const rows = await db.select().from(entityFollowsTable)
      .where(and(...conditions))
      .orderBy(sql`${entityFollowsTable.createdAt} DESC`);

    res.json({ items: rows, total: rows.length });
  } catch (error) { next(error); }
});

export default router;
