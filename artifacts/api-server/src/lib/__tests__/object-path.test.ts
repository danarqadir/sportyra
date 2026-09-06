import { describe, expect, it } from "vitest";
import { isSafeObjectPath } from "../object-path";

describe("storage object path validation", () => {
  it("accepts normal object paths", () => {
    expect(isSafeObjectPath("uploads/abc.png")).toBe(true);
    expect(isSafeObjectPath("public/uploads/deep/file.png")).toBe(true);
    expect(isSafeObjectPath("logo.svg")).toBe(true);
  });

  it("rejects empty and whitespace-only paths", () => {
    expect(isSafeObjectPath("")).toBe(false);
    expect(isSafeObjectPath("   ")).toBe(false);
  });

  it("rejects dot-segment path traversal", () => {
    expect(isSafeObjectPath("..")).toBe(false);
    expect(isSafeObjectPath("../private/x")).toBe(false);
    expect(isSafeObjectPath("uploads/../../etc/passwd")).toBe(false);
    expect(isSafeObjectPath("a/./b")).toBe(false);
  });

  it("rejects absolute and backslash paths", () => {
    expect(isSafeObjectPath("/etc/passwd")).toBe(false);
    expect(isSafeObjectPath("//double")).toBe(false);
    expect(isSafeObjectPath("uploads\\..\\secret")).toBe(false);
  });

  it("rejects empty segments from double slashes", () => {
    expect(isSafeObjectPath("uploads//x.png")).toBe(false);
  });
});