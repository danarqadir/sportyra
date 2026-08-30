import crypto from "node:crypto";
export { hashPassword, verifyPassword } from "./password";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, sessionsTable, usersTable, passwordResetsTable, partnersTable } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      locals?: {
        user?: typeof import("@workspace/db").usersTable.$inferSelect;
        sessionId?: number;
        partner?: typeof import("@workspace/db").partnersTable.$inferSelect;
      };
    }
    interface Response {
      locals: {
        user?: typeof import("@workspace/db").usersTable.$inferSelect;
        sessionId?: number;
        partner?: typeof import("@workspace/db").partnersTable.$inferSelect;
      };
    }
  }
}

const SESSION_COOKIE = "sportyra_session";
const MFA_SESSION_COOKIE = "sportyra_admin_mfa";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MFA_SESSION_TTL_MS = 1000 * 60 * 30;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60;
const ADMIN_ROLES = new Set(["admin"]);
const EDITOR_ROLES = new Set(["admin", "editor"]);
const PARTNER_ROLES = new Set(["partner"]);
const VALID_ROLES = new Set(["user", "editor", "admin", "partner"]);

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

export async function createMfaSession(userId: number, res: Response) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MFA_SESSION_TTL_MS);
  await db.insert(sessionsTable).values({
    userId,
    tokenHash: hashToken(token),
    purpose: "mfa",
    expiresAt,
  });
  res.cookie(MFA_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MFA_SESSION_TTL_MS,
  });
  return expiresAt;
}

export async function hasValidMfaSession(req: Request, userId: number): Promise<boolean> {
  const token = req.cookies?.[MFA_SESSION_COOKIE];
  if (!token) return false;
  const [row] = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.tokenHash, hashToken(token)),
        eq(sessionsTable.userId, userId),
        eq(sessionsTable.purpose, "mfa"),
        gt(sessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return !!row;
}

export function clearMfaSession(res: Response) {
  res.clearCookie(MFA_SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
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

// The static admin bearer token maps to a real admin user row so that
// downstream handlers can safely read res.locals.user (e.g. user.id).
// If no admin user exists yet, one is auto-provisioned so the system
// works out of the box with just the SPORTYRA_ADMIN_TOKEN env var.
export async function ensureAdminTokenUser(res: Response): Promise<boolean> {
  if (res.locals.user) return true;
  const [admin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);
  if (admin) {
    res.locals.user = admin;
    return true;
  }
  // Auto-provision a placeholder admin user so admin token auth works.
  try {
    const [created] = await db
      .insert(usersTable)
      .values({
        name: "Admin",
        email: "admin@sportyra.local",
        passwordHash: crypto.randomBytes(32).toString("hex"),
        role: "admin",
      })
      .returning();
    if (created) {
      res.locals.user = created;
      return true;
    }
  } catch {
    // Duplicate email from a race — fall through to re-select.
  }
  const [retry] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);
  if (!retry) return false;
  res.locals.user = retry;
  return true;
}

export function requireAdminOrRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (hasAdminToken(req)) {
        const ok = await ensureAdminTokenUser(res);
        if (!ok) {
          res.status(503).json({ error: "No admin user is provisioned on the server" });
          return;
        }
        const admin = res.locals.user as typeof usersTable.$inferSelect;
        if (admin.mfaEnabled && !(await hasValidMfaSession(req, admin.id))) {
          res.status(403).json({ error: "MFA required", code: "MFA_REQUIRED" });
          return;
        }
        next();
        return;
      }
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
    } catch (error) {
      next(error);
    }
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
  ensureAdminTokenUser(res).then(async (ok) => {
    if (!ok) {
      res.status(503).json({ error: "No admin user is provisioned on the server" });
      return;
    }
    const admin = res.locals.user as typeof usersTable.$inferSelect;
    if (admin.mfaEnabled && !(await hasValidMfaSession(req, admin.id))) {
      res.status(403).json({ error: "MFA required", code: "MFA_REQUIRED" });
      return;
    }
    next();
  }).catch(next);
}

export function generatePartnerSecret(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `spr_p_${crypto.randomBytes(24).toString("base64url")}`;
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, 16);
  return { plaintext, hash, prefix };
}

export function hashPartnerSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export async function getSessionPartner(req: Request) {
  const partnerId = req.headers["x-partner-id"];
  if (!partnerId) return null;
  const id = Number(partnerId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const authorization = req.header("authorization") ?? "";
  const secret = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!secret || !secret.startsWith("spr_p_")) return null;

  const secretHash = hashPartnerSecret(secret);
  const [row] = await db
    .select({ partner: partnersTable })
    .from(partnersTable)
    .where(and(eq(partnersTable.id, id), eq(partnersTable.secretHash, secretHash)))
    .limit(1);
  return row?.partner ?? null;
}

export async function requirePartner(req: Request, res: Response, next: NextFunction) {
  try {
    const partner = await getSessionPartner(req);
    if (!partner) {
      res.status(401).json({ error: "Partner authentication required" });
      return;
    }
    if (partner.status !== "approved" && partner.status !== "active") {
      res.status(403).json({ error: "Partner account not approved" });
      return;
    }
    res.locals.partner = partner;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requirePartnerOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (hasAdminToken(req)) {
    const ok = await ensureAdminTokenUser(res);
    if (!ok) {
      res.status(503).json({ error: "No admin user is provisioned on the server" });
      return;
    }
    const admin = res.locals.user as typeof usersTable.$inferSelect;
    if (admin.mfaEnabled && !(await hasValidMfaSession(req, admin.id))) {
      res.status(403).json({ error: "MFA required", code: "MFA_REQUIRED" });
      return;
    }
    return next();
  }
  const partner = await getSessionPartner(req);
  if (partner && (partner.status === "approved" || partner.status === "active")) {
    res.locals.partner = partner;
    return next();
  }
  const session = await getSessionUser(req);
  if (!session) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const user = session.user;
  if (user.role === "admin") {
    return next();
  }
  res.status(403).json({ error: "Insufficient permissions" });
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
        isNull(passwordResetsTable.usedAt),
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
