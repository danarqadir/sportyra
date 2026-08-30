import type { NextFunction, Request, Response } from "express";

const REDIS_URL = process.env["REDIS_URL"];

interface RedisLike {
  incr(key: string): Promise<number>;
  pExpire(key: string, ms: number): Promise<boolean>;
  pTTL(key: string): Promise<number>;
}

let redisClient: RedisLike | null = null;

async function getRedisClient(): Promise<RedisLike | null> {
  if (redisClient) return redisClient;
  if (!REDIS_URL) return null;
  try {
    // Dynamic import to avoid type dependency — redis is optional
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

const buckets = new Map<string, { count: number; resetAt: number }>();

async function slidingWindowCheck(key: string, windowMs: number, max: number): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const client = await getRedisClient();
  const now = Date.now();
  if (client) {
    const windowKey = `rl:${key}`;
    try {
      const current = await client.incr(windowKey);
      if (current === 1) {
        await client.pExpire(windowKey, windowMs);
      }
      const ttl = await client.pTTL(windowKey);
      if (current > max) {
        return { allowed: false, retryAfterMs: ttl > 0 ? ttl : windowMs };
      }
      return { allowed: true, retryAfterMs: 0 };
    } catch {
      // Redis failed, fall through to in-memory
    }
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  current.count += 1;
  if (current.count > max) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const normalizedPath = req.path.replace(/\/\d+/g, "/:id");
    const key = `${req.ip || req.socket.remoteAddress || "unknown"}:${normalizedPath}`;
    const result = await slidingWindowCheck(key, options.windowMs, options.max);
    if (!result.allowed) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil(result.retryAfterMs / 1000)));
      res.status(429).json({ error: options.message ?? "Too many requests. Please try again shortly." });
      return;
    }
    next();
  };
}

export const adminMutationRateLimit = rateLimit({ windowMs: 60_000, max: 30 });

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000).unref();
