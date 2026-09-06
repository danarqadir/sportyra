import { describe, expect, it } from "vitest";
import { getClientIp } from "../client-ip";

describe("client IP derivation", () => {
  it("uses Express's authoritative req.ip (trust-proxy derived) over the socket", () => {
    expect(getClientIp({ ip: "203.0.113.9", socket: { remoteAddress: "10.0.0.1" } })).toBe("203.0.113.9");
  });

  it("ignores client-controlled forwarding headers entirely", () => {
    // An attacker-supplied X-Forwarded-For / X-Real-IP / Forwarded header is never
    // consulted. The only inputs are req.ip (resolved by Express under the
    // configured trust proxy) and the raw socket peer address.
    const spoofed = {
      ip: "::ffff:127.0.0.1",
      socket: { remoteAddress: "10.0.0.5" },
      headers: {
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        "x-real-ip": "6.6.6.6",
        forwarded: "for=9.9.9.9",
      },
    } as any;
    expect(getClientIp(spoofed)).toBe("::ffff:127.0.0.1");
  });

  it("falls back to socket.remoteAddress when req.ip is absent", () => {
    expect(getClientIp({ socket: { remoteAddress: "10.0.0.8" } })).toBe("10.0.0.8");
  });

  it("returns empty string when no source is available", () => {
    expect(getClientIp({})).toBe("");
    expect(getClientIp({ ip: "", socket: { remoteAddress: "" } })).toBe("");
    expect(getClientIp({ ip: "::", socket: { remoteAddress: null } })).toBe("");
  });

  it("preserves IPv6, mapped IPv6, and rejects the empty mapped placeholder", () => {
    expect(getClientIp({ ip: "2001:db8::1" })).toBe("2001:db8::1");
    expect(getClientIp({ ip: "::ffff:192.0.2.5" })).toBe("::ffff:192.0.2.5");
    expect(getClientIp({ ip: "::ffff:", socket: { remoteAddress: "10.0.0.9" } })).toBe("10.0.0.9");
  });
});
