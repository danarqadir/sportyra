import { Router } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, usersTable, auditLogTable, sessionsTable, commentsTable, bookmarksTable, entityFollowsTable, notificationsTable, predictionsTable, leaderboardTable, pushSubscriptionsTable, passwordResetsTable, moderationReportsTable } from "@workspace/db";
import {
  createSession, destroyAllUserSessions, destroySession,
  hashPassword, normalizeEmail, requireUser, verifyPassword,
  generatePasswordResetToken, verifyPasswordResetToken, validateRole,
  requireAdmin, requireAdminMutation, hasAdminToken, ensureAdminTokenUser,
  createMfaSession, clearMfaSession,
} from "../lib/auth";
import { generateTotpSecret, verifyTotp, otpauthUrl } from "../lib/totp";
import { recordFailedLogin, isLockedOut, clearFailedLogin, getLockoutRemainingMs } from "../lib/lockout";
import { enrichEvent } from "../lib/enrichment";
import { logger } from "../lib/logger";
import { sendPasswordResetEmail } from "../lib/email";
import { rateLimit } from "../lib/rate-limit";

const router = Router();

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  minLowercase: 1,
  minUppercase: 1,
  minDigit: 1,
  minSpecial: 1,
};

function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_RULES.minLength || password.length > PASSWORD_RULES.maxLength) {
    return `Password must be between ${PASSWORD_RULES.minLength} and ${PASSWORD_RULES.maxLength} characters.`;
  }
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one digit.";
  if (!/[^a-zA-Z0-9]/.test(password)) return "Password must contain at least one special character.";
  return null;
}

router.post("/auth/register", rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (name.length < 2 || name.length > 80 || !emailPattern.test(email)) {
      res.status(400).json({ error: "Name and a valid email are required." });
      return;
    }
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing) {
      res.status(201).json({ message: "Registration successful." });
      return;
    }
    const [user] = await db.insert(usersTable).values({ name, email, passwordHash: hashPassword(password) }).returning();
    await createSession(user.id, res);
    res.status(201).json({ message: "Registration successful." });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/login", rateLimit({ windowMs: 15 * 60_000, max: 20 }), async (req, res, next): Promise<void> => {
  try {
    const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!emailPattern.test(email) || !password) {
      res.status(400).json({ error: "Please enter a valid email and password." });
      return;
    }
    if (await isLockedOut(email)) {
      const remainingMs = await getLockoutRemainingMs(email);
      logger.info({ email, action: "login_locked_out", remainingMs }, "Auth: login attempt while locked out");
      res.status(429).json({ error: "Too many failed attempts. Please try again in 15 minutes." });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      const locked = await recordFailedLogin(email);
      const enriched = enrichEvent(req);
      if (locked) {
        logger.warn({ email, action: "login_locked_out", ipHash: enriched.clientIpHash, uaEngine: enriched.userAgentEngine }, "Auth: account locked after failed attempts");
        res.status(429).json({ error: "Account temporarily locked due to too many failed attempts. Please try again in 15 minutes." });
      } else {
        logger.info({ email, action: "login_failure", ipHash: enriched.clientIpHash, uaEngine: enriched.userAgentEngine }, "Auth: login failed");
        res.status(401).json({ error: "Invalid email or password." });
      }
      return;
    }
    await clearFailedLogin(email);
    await destroyAllUserSessions(user.id);
    await createSession(user.id, res);
    const enriched = enrichEvent(req);
    logger.info({ userId: user.id, action: "login_success", ipHash: enriched.clientIpHash, country: enriched.clientIpCountry }, "Auth: login successful");
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", requireUser, (req, res) => {
  const user = res.locals.user as typeof usersTable.$inferSelect;
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

router.post("/auth/validate-token", rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const { hasAdminToken } = await import("../lib/auth");
  if (hasAdminToken(req)) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false, error: "Invalid admin token" });
  }
});

router.post("/auth/logout", async (req, res, next): Promise<void> => {
  try {
    await destroySession(req, res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.delete("/auth/sessions", requireUser, async (req, res, next): Promise<void> => {
  try {
    const user = res.locals.user as { id: number };
    await destroySession(req, res);
    await destroyAllUserSessions(user.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/auth/change-password", requireUser, rateLimit({ windowMs: 15 * 60_000, max: 5 }), async (req, res, next): Promise<void> => {
  try {
    const user = res.locals.user as typeof usersTable.$inferSelect;
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Current and new passwords are required." });
      return;
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    const newHash = hashPassword(newPassword);
    await db.update(usersTable).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    await destroyAllUserSessions(user.id);
    await createSession(user.id, res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/auth/forgot-password", rateLimit({ windowMs: 15 * 60_000, max: 3 }), async (req, res, next): Promise<void> => {
  try {
    const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
    if (!emailPattern.test(email)) {
      res.json({ message: "If an account exists with that email, a reset link has been sent." });
      return;
    }
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (user) {
      const token = await generatePasswordResetToken(user.id);
      const siteUrl = (process.env["PUBLIC_SITE_URL"] || "").replace(/\/$/, "");
      const baseUrl = siteUrl || `${req.protocol}://${req.get("host")}`;
      sendPasswordResetEmail(email, token, baseUrl).catch((err) => {
        req.log?.error?.({ err }, "Failed to send password reset email");
      });
    }
    res.json({ message: "If an account exists with that email, a reset link has been sent." });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/reset-password", rateLimit({ windowMs: 15 * 60_000, max: 5 }), async (req, res, next): Promise<void> => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const newPassword = typeof req.body?.password === "string" ? req.body.password : "";
    if (!token || !newPassword) {
      res.status(400).json({ error: "Token and new password are required." });
      return;
    }
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    const userId = await verifyPasswordResetToken(token);
    if (!userId) {
      res.status(400).json({ error: "Invalid or expired reset token." });
      return;
    }
    const newHash = hashPassword(newPassword);
    await db.update(usersTable).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(usersTable.id, userId));
    await destroyAllUserSessions(userId);
    res.json({ message: "Password has been reset. Please sign in with your new password." });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/mfa/setup", requireAdminMutation, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const admin = res.locals.user as typeof usersTable.$inferSelect;
    if (admin.mfaEnabled) {
      res.status(400).json({ error: "MFA is already enabled. Disable it first to generate a new secret." });
      return;
    }
    const secret = generateTotpSecret();
    await db.update(usersTable).set({ mfaSecret: secret, updatedAt: new Date() }).where(eq(usersTable.id, admin.id));
    await db.insert(auditLogTable).values({
      userId: admin.id,
      action: "auth.mfa_setup_started",
      targetType: "user",
      targetId: admin.id,
      details: "TOTP MFA setup initiated",
    }).catch(() => {});
    res.json({
      secret,
      otpauthUrl: otpauthUrl(secret, admin.email),
      issuer: "Sportyra",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/mfa/verify", requireAdminMutation, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const admin = res.locals.user as typeof usersTable.$inferSelect;
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!admin.mfaSecret) {
      res.status(400).json({ error: "No MFA secret configured. Call /auth/mfa/setup first." });
      return;
    }
    if (!verifyTotp(admin.mfaSecret, code)) {
      res.status(401).json({ error: "Invalid verification code." });
      return;
    }
    await db.update(usersTable).set({ mfaEnabled: true, updatedAt: new Date() }).where(eq(usersTable.id, admin.id));
    await createMfaSession(admin.id, res);
    await db.insert(auditLogTable).values({
      userId: admin.id,
      action: "auth.mfa_enabled",
      targetType: "user",
      targetId: admin.id,
      details: "TOTP MFA enabled",
    }).catch(() => {});
    res.json({ enabled: true });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/mfa/authenticate", rateLimit({ windowMs: 15 * 60_000, max: 20 }), async (req, res, next): Promise<void> => {
  try {
    if (!hasAdminToken(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const ok = await ensureAdminTokenUser(res);
    if (!ok) {
      res.status(503).json({ error: "No admin user is provisioned on the server" });
      return;
    }
    const admin = res.locals.user as typeof usersTable.$inferSelect;
    if (!admin.mfaEnabled || !admin.mfaSecret) {
      res.status(400).json({ error: "MFA is not enabled for the admin account." });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!verifyTotp(admin.mfaSecret, code)) {
      res.status(401).json({ error: "Invalid verification code." });
      return;
    }
    await createMfaSession(admin.id, res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/mfa/disable", requireAdminMutation, rateLimit({ windowMs: 15 * 60_000, max: 5 }), async (req, res, next): Promise<void> => {
  try {
    const admin = res.locals.user as typeof usersTable.$inferSelect;
    if (!admin.mfaEnabled || !admin.mfaSecret) {
      res.status(400).json({ error: "MFA is not enabled." });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!verifyTotp(admin.mfaSecret, code)) {
      res.status(401).json({ error: "Invalid verification code." });
      return;
    }
    await db.update(usersTable).set({ mfaEnabled: false, mfaSecret: null, updatedAt: new Date() }).where(eq(usersTable.id, admin.id));
    clearMfaSession(res);
    await db.insert(auditLogTable).values({
      userId: admin.id,
      action: "auth.mfa_disabled",
      targetType: "user",
      targetId: admin.id,
      details: "TOTP MFA disabled",
    }).catch(() => {});
    res.json({ enabled: false });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/mfa/status", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const admin = res.locals.user as typeof usersTable.$inferSelect;
    res.json({ enabled: admin.mfaEnabled });
  } catch (error) {
    next(error);
  }
});

router.delete("/auth/account", requireUser, rateLimit({ windowMs: 15 * 60_000, max: 3 }), async (req, res, next): Promise<void> => {
  try {
    const user = res.locals.user as typeof usersTable.$inferSelect;
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password) {
      res.status(400).json({ error: "Password confirmation required" });
      return;
    }
    if (!verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }

    await db.transaction(async (tx) => {
      // Delete dependent data
      await tx.delete(sessionsTable).where(eq(sessionsTable.userId, user.id));
      await tx.delete(passwordResetsTable).where(eq(passwordResetsTable.userId, user.id));
      await tx.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, user.id));
      await tx.delete(bookmarksTable).where(eq(bookmarksTable.userId, user.id));
      await tx.delete(entityFollowsTable).where(eq(entityFollowsTable.userId, user.id));
      await tx.delete(notificationsTable).where(eq(notificationsTable.userId, user.id));
      await tx.delete(predictionsTable).where(eq(predictionsTable.userId, user.id));
      await tx.delete(leaderboardTable).where(eq(leaderboardTable.userId, user.id));
      // Anonymize comments (keep content but remove PII)
      await tx.update(commentsTable).set({ userId: null, authorName: "Deleted User", authorEmail: "deleted@local" }).where(eq(commentsTable.userId, user.id));
      // Anonymize moderation reports
      await tx.update(moderationReportsTable).set({ reporterId: null }).where(eq(moderationReportsTable.reporterId, user.id));
      await tx.update(moderationReportsTable).set({ reviewedBy: null }).where(eq(moderationReportsTable.reviewedBy, user.id));
      // Delete user
      await tx.delete(usersTable).where(eq(usersTable.id, user.id));
    });

    // Clear session cookies
    destroySession(req, res);
    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/users", requireAdminMutation, async (req, res, next): Promise<void> => {
  try {
    const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, active: usersTable.active, mfaEnabled: usersTable.mfaEnabled, createdAt: usersTable.createdAt }).from(usersTable);
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.patch("/auth/users/:id/role", requireAdminMutation, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const currentUser = res.locals.user as typeof usersTable.$inferSelect;
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const role = typeof req.body?.role === "string" ? req.body.role.trim() : "";
    if (!validateRole(role)) {
      res.status(400).json({ error: "Invalid role. Must be one of: user, editor, admin" });
      return;
    }
    if (targetId === currentUser.id && role !== "admin") {
      res.status(400).json({ error: "Cannot change your own admin role" });
      return;
    }
    const [updated] = await db.update(usersTable).set({ role, updatedAt: new Date() }).where(eq(usersTable.id, targetId)).returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await db.insert(auditLogTable).values({
      userId: currentUser.id,
      action: "user.role_changed",
      targetType: "user",
      targetId: updated.id,
      details: `Role changed from ${updated.role} to ${role}`,
    }).catch(() => {});
    res.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: updated.active });
  } catch (error) {
    next(error);
  }
});

router.patch("/auth/users/:id/active", requireAdminMutation, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const currentUser = res.locals.user as typeof usersTable.$inferSelect;
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const active = typeof req.body?.active === "boolean" ? req.body.active : undefined;
    if (active === undefined) {
      res.status(400).json({ error: "active boolean is required" });
      return;
    }
    if (targetId === currentUser.id && !active) {
      res.status(400).json({ error: "Cannot deactivate your own account" });
      return;
    }
    const [updated] = await db.update(usersTable).set({ active, updatedAt: new Date() }).where(eq(usersTable.id, targetId)).returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await db.insert(auditLogTable).values({
      userId: currentUser.id,
      action: active ? "user.activated" : "user.deactivated",
      targetType: "user",
      targetId: updated.id,
      details: active ? "Account activated" : "Account deactivated",
    }).catch(() => {});
    if (!active) await destroyAllUserSessions(targetId);
    res.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: updated.active });
  } catch (error) {
    next(error);
  }
});

export default router;
