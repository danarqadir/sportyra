import { describe, expect, it } from "vitest";
import { resolveTrustProxy } from "../trust-proxy";

describe("trust proxy resolution", () => {
  it("defaults to loopback when unset or blank (safe for a loopback reverse proxy)", () => {
    expect(resolveTrustProxy(undefined)).toBe("loopback");
    expect(resolveTrustProxy("")).toBe("loopback");
    expect(resolveTrustProxy("   ")).toBe("loopback");
  });

  it("disables trust for explicit false/off/none/0", () => {
    expect(resolveTrustProxy("false")).toBe(false);
    expect(resolveTrustProxy("off")).toBe(false);
    expect(resolveTrustProxy("none")).toBe(false);
    expect(resolveTrustProxy("0")).toBe(false);
  });

  it("only trusts all when explicitly requested", () => {
    expect(resolveTrustProxy("true")).toBe(true);
    expect(resolveTrustProxy("all")).toBe(true);
  });

  it("maps predefined trust tokens", () => {
    expect(resolveTrustProxy("loopback")).toBe("loopback");
    expect(resolveTrustProxy("linklocal")).toBe("linklocal");
    expect(resolveTrustProxy("uniquelocal")).toBe("uniquelocal");
  });

  it("maps numeric hop counts", () => {
    expect(resolveTrustProxy("2")).toBe(2);
    expect(resolveTrustProxy("10")).toBe(10);
  });

  it("passes through a single address/CIDR and splits lists", () => {
    expect(resolveTrustProxy("10.0.0.1")).toBe("10.0.0.1");
    expect(resolveTrustProxy("10.0.0.0/8")).toBe("10.0.0.0/8");
    expect(resolveTrustProxy("10.0.0.1,10.0.0.2")).toEqual(["10.0.0.1", "10.0.0.2"]);
  });

  it("never resolves arbitrary or junk input to trust-all", () => {
    expect(resolveTrustProxy("whatever")).toBe("whatever");
    expect(resolveTrustProxy("on")).toBe("on");
    expect(resolveTrustProxy("yes")).toBe("yes");
  });
});
