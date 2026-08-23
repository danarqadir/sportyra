import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  createSession, destroyAllUserSessions, destroySession,
  hashPassword, normalizeEmail, requireUser, verifyPassword,
  generatePasswordResetToken, verifyPasswordResetToken, validateRole,
} from "../lib/auth";
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

const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function recordFailedLogin(email: string): boolean {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) {
    loginAttempts.set(key, { count: 1, lockedUntil: 0 });
    return false;
  }
  if (entry.lockedUntil > now) {
    return true;
  }
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    return true;
  }
  return false;
}

function isLockedOut(email: string): boolean {
  const key = email.toLowerCase();
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil === 0) return false;
  if (entry.lockedUntil <= Date.now()) { loginAttempts.delete(key); return false; }
  return true;
}

function clearFailedLogin(email: string) {
  loginAttempts.delete(email.toLowerCase());
}

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
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
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
    if (isLockedOut(email)) {
      res.status(429).json({ error: "Too many failed attempts. Please try again in 15 minutes." });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      const locked = recordFailedLogin(email);
      if (locked) {
        res.status(429).json({ error: "Account temporarily locked due to too many failed attempts. Please try again in 15 minutes." });
      } else {
        res.status(401).json({ error: "Invalid email or password." });
      }
      return;
    }
    clearFailedLogin(email);
    await createSession(user.id, res);
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

router.get("/auth/users", requireUser, async (req, res, next): Promise<void> => {
  try {
    const currentUser = res.locals.user as typeof usersTable.$inferSelect;
    if (currentUser.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, active: usersTable.active, createdAt: usersTable.createdAt }).from(usersTable);
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.patch("/auth/users/:id/role", requireUser, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const currentUser = res.locals.user as typeof usersTable.$inferSelect;
    if (currentUser.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
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
    res.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: updated.active });
  } catch (error) {
    next(error);
  }
});

router.patch("/auth/users/:id/active", requireUser, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res, next): Promise<void> => {
  try {
    const currentUser = res.locals.user as typeof usersTable.$inferSelect;
    if (currentUser.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
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
    if (!active) await destroyAllUserSessions(targetId);
    res.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: updated.active });
  } catch (error) {
    next(error);
  }
});

export default router;
