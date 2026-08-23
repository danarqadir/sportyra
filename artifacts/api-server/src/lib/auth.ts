import crypto from "node:crypto";
export { hashPassword, verifyPassword } from "./password";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable, passwordResetsTable } from "@workspace/db";

const SESSION_COOKIE = "sportyra_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60;
const ADMIN_ROLES = new Set(["admin"]);
const EDITOR_ROLES = new Set(["admin", "editor"]);
const VALID_ROLES = new Set(["user", "editor", "admin"]);

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateRole(role: string): boolean {
  return VALID_ROLES.has(role);
}

export async function createSession(userId: number, res: Response) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ userId, tokenHash: hashToken(token), expiresAt });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
  return expiresAt;
}

export async function getSessionUser(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const [row] = await db
    .select({ user: usersTable, sessionId: sessionsTable.id })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
    .where(and(eq(sessionsTable.tokenHash, hashToken(token)), gt(sessionsTable.expiresAt, new Date()), eq(usersTable.active, true)))
    .limit(1);
  return row ?? null;
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, hashToken(token)));
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
}

export async function destroyAllUserSessions(userId: number) {
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.locals.user = session.user;
    res.locals.sessionId = session.sessionId;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as typeof usersTable.$inferSelect | undefined;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export function requireAdminOrRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (hasAdminToken(req)) return next();
    const user = res.locals.user as typeof usersTable.$inferSelect | undefined;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(user.role) && !ADMIN_ROLES.has(user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export function hasAdminToken(req: Request) {
  const expected = process.env["SPORTYRA_ADMIN_TOKEN"];
  if (!expected) return false;
  const authorization = req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return false;
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);
  return tokenBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!process.env["SPORTYRA_ADMIN_TOKEN"]) {
    res.status(503).json({ error: "Admin access is not configured on the server" });
    return;
  }
  if (!hasAdminToken(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function generatePasswordResetToken(userId: number): Promise<string> {
  await db.delete(passwordResetsTable).where(
    eq(passwordResetsTable.userId, userId),
  );
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await db.insert(passwordResetsTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return token;
}

export async function verifyPasswordResetToken(token: string): Promise<number | null> {
  const tokenHashVal = hashToken(token);
  const [row] = await db
    .select()
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.tokenHash, tokenHashVal),
        gt(passwordResetsTable.expiresAt, new Date()),
        eq(passwordResetsTable.usedAt, null as unknown as Date),
      ),
    )
    .limit(1);
  if (!row) return null;
  await db
    .update(passwordResetsTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetsTable.id, row.id));
  return row.userId;
}
