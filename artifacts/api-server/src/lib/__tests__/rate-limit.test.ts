import { describe, expect, it, vi, beforeEach } from "vitest";
import { rateLimit } from "../rate-limit";

describe("rate limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows requests under the limit", async () => {
    const limiter = rateLimit({ windowMs: 1000, max: 3 });
    const req = { ip: "1.2.3.4", path: "/test" } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;
    const next = vi.fn();

    await limiter(req, res, next);
    await limiter(req, res, next);
    await limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks requests over the limit", async () => {
    const limiter = rateLimit({ windowMs: 1000, max: 2 });
    const req = { ip: "5.6.7.8", path: "/test" } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;
    const next = vi.fn();

    await limiter(req, res, next);
    await limiter(req, res, next);
    await limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
