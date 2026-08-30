import crypto from "node:crypto";

const REDIS_URL = process.env["REDIS_URL"];

interface RedisLike {
  incr(key: string): Promise<number>;
  pExpire(key: string, ms: number): Promise<boolean>;
  pTTL(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
}

let redisClient: RedisLike | null = null;

async function getRedisClient(): Promise<RedisLike | null> {
  if (redisClient) return redisClient;
  if (!REDIS_URL) return null;
  try {
    const createClient = (await Function("return import('redis')")()).default?.createClient;
    if (!createClient) return null;
    const client = createClient({ url: REDIS_URL });
    client.on("error", () => { redisClient = null; });
    await client.connect();
    redisClient = client as unknown as RedisLike;
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// In-memory fallback (lost on restart — acceptable for single-server dev)
const memAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MEM_MAX_SIZE = 10_000;

function memKey(email: string): string {
  return `lo:${email.toLowerCase()}`;
}

function memRecordFailure(email: string): boolean {
  const key = memKey(email);
  const now = Date.now();
  if (memAttempts.size > MEM_MAX_SIZE) {
    for (const [k, entry] of memAttempts) {
      if (entry.lockedUntil > 0 && entry.lockedUntil <= now) memAttempts.delete(k);
    }
    if (memAttempts.size > MEM_MAX_SIZE) {
      const oldest = memAttempts.keys().next().value;
      if (oldest) memAttempts.delete(oldest);
    }
  }
  const entry = memAttempts.get(key);
  if (!entry) {
    memAttempts.set(key, { count: 1, lockedUntil: 0 });
    return false;
  }
  if (entry.lockedUntil > now) return true;
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    return true;
  }
  return false;
}

function memIsLocked(email: string): boolean {
  const entry = memAttempts.get(memKey(email));
  if (!entry) return false;
  if (entry.lockedUntil === 0) return false;
  if (entry.lockedUntil <= Date.now()) { memAttempts.delete(memKey(email)); return false; }
  return true;
}

function memClear(email: string) {
  memAttempts.delete(memKey(email));
}

function memRemainingMs(email: string): number {
  const entry = memAttempts.get(memKey(email));
  if (!entry || entry.lockedUntil === 0) return 0;
  return Math.max(0, entry.lockedUntil - Date.now());
}

export async function recordFailedLogin(email: string): Promise<boolean> {
  const client = await getRedisClient();
  const key = `lockout:${email.toLowerCase()}`;
  if (client) {
    try {
      const count = await client.incr(key);
      if (count === 1) await client.pExpire(key, LOGIN_WINDOW_MS);
      if (count >= LOGIN_MAX_ATTEMPTS) {
        await client.pExpire(key, LOGIN_LOCKOUT_MS);
        return true;
      }
      return false;
    } catch { /* fall through to memory */ }
  }
  return memRecordFailure(email);
}

export async function isLockedOut(email: string): Promise<boolean> {
  const client = await getRedisClient();
  const key = `lockout:${email.toLowerCase()}`;
  if (client) {
    try {
      const ttl = await client.pTTL(key);
      if (ttl > 0) return true;
      return false;
    } catch { /* fall through to memory */ }
  }
  return memIsLocked(email);
}

export async function clearFailedLogin(email: string): Promise<void> {
  const client = await getRedisClient();
  const key = `lockout:${email.toLowerCase()}`;
  if (client) {
    try { await client.del(key); return; } catch { /* fall through to memory */ }
  }
  memClear(email);
}

export async function getLockoutRemainingMs(email: string): Promise<number> {
  const client = await getRedisClient();
  const key = `lockout:${email.toLowerCase()}`;
  if (client) {
    try {
      const ttl = await client.pTTL(key);
      return ttl > 0 ? ttl : 0;
    } catch { /* fall through to memory */ }
  }
  return memRemainingMs(email);
}
