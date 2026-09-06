import { describe, expect, it } from "vitest";
import { getAdminAuthorizationFailure } from "../admin-authorization";

// This policy backs the canonical requireAdminMutation()/authorizeAdminMutation()
// used by every sensitive admin endpoint, including /auth/users management.
describe("sensitive admin authorization policy", () => {
  it("rejects unauthenticated requests", () => {
    expect(getAdminAuthorizationFailure({})).toBe("authentication_required");
    expect(getAdminAuthorizationFailure({ active: true })).toBe("authentication_required");
    expect(getAdminAuthorizationFailure({ mfaEnabled: false })).toBe("authentication_required");
  });

  it("rejects authenticated non-admin users", () => {
    expect(getAdminAuthorizationFailure({ role: "editor", active: true })).toBe("admin_required");
    expect(getAdminAuthorizationFailure({ role: "user", active: true })).toBe("admin_required");
    expect(getAdminAuthorizationFailure({ role: "partner", active: true })).toBe("admin_required");
  });

  it("rejects inactive administrators", () => {
    expect(getAdminAuthorizationFailure({ role: "admin", active: false })).toBe("admin_required");
    expect(getAdminAuthorizationFailure({ role: "admin", active: false, mfaEnabled: true, mfaValid: true })).toBe("admin_required");
  });

  it("requires a valid MFA session when MFA is enabled", () => {
    expect(getAdminAuthorizationFailure({ role: "admin", active: true, mfaEnabled: true, mfaValid: false })).toBe("mfa_required");
    expect(getAdminAuthorizationFailure({ role: "admin", active: true, mfaEnabled: true })).toBe("mfa_required");
  });

  it("allows an active administrator with valid MFA", () => {
    expect(getAdminAuthorizationFailure({ role: "admin", active: true, mfaEnabled: true, mfaValid: true })).toBeNull();
  });

  it("allows an active administrator when MFA is not enabled", () => {
    expect(getAdminAuthorizationFailure({ role: "admin", active: true, mfaEnabled: false })).toBeNull();
    expect(getAdminAuthorizationFailure({ role: "admin", active: true, mfaEnabled: null })).toBeNull();
  });

  it("full matrix", () => {
    const matrix: Array<{ name: string; p: Parameters<typeof getAdminAuthorizationFailure>[0]; expected: ReturnType<typeof getAdminAuthorizationFailure> }> = [
      { name: "unauthenticated", p: {}, expected: "authentication_required" },
      { name: "normal user", p: { role: "user", active: true, mfaEnabled: false }, expected: "admin_required" },
      { name: "editor", p: { role: "editor", active: true, mfaEnabled: false }, expected: "admin_required" },
      { name: "inactive admin", p: { role: "admin", active: false, mfaEnabled: false }, expected: "admin_required" },
      { name: "admin without required MFA", p: { role: "admin", active: true, mfaEnabled: true, mfaValid: false }, expected: "mfa_required" },
      { name: "admin with valid MFA", p: { role: "admin", active: true, mfaEnabled: true, mfaValid: true }, expected: null },
      { name: "admin with MFA disabled", p: { role: "admin", active: true, mfaEnabled: false }, expected: null },
    ];
    for (const row of matrix) {
      expect(getAdminAuthorizationFailure(row.p), row.name).toBe(row.expected);
    }
  });

  describe("requireAdminOrRole (editor allowed) policy", () => {
    const adminAndEditor = new Set(["admin", "editor"]);

    it("allows an active editor", () => {
      expect(getAdminAuthorizationFailure({ role: "editor", active: true, mfaEnabled: false }, adminAndEditor)).toBeNull();
    });

    it("rejects a normal user even when editor is allowed", () => {
      expect(getAdminAuthorizationFailure({ role: "user", active: true, mfaEnabled: false }, adminAndEditor)).toBe("admin_required");
    });

    it("rejects an inactive editor", () => {
      expect(getAdminAuthorizationFailure({ role: "editor", active: false, mfaEnabled: false }, adminAndEditor)).toBe("admin_required");
    });

    it("requires MFA for an editor with MFA enabled but no valid session", () => {
      expect(getAdminAuthorizationFailure({ role: "editor", active: true, mfaEnabled: true, mfaValid: false }, adminAndEditor)).toBe("mfa_required");
    });

    it("allows an editor with valid MFA", () => {
      expect(getAdminAuthorizationFailure({ role: "editor", active: true, mfaEnabled: true, mfaValid: true }, adminAndEditor)).toBeNull();
    });

    it("requires MFA for an admin with MFA enabled when admin+editor are allowed", () => {
      expect(getAdminAuthorizationFailure({ role: "admin", active: true, mfaEnabled: true, mfaValid: false }, adminAndEditor)).toBe("mfa_required");
      expect(getAdminAuthorizationFailure({ role: "admin", active: true, mfaEnabled: true, mfaValid: true }, adminAndEditor)).toBeNull();
    });
  });
});
