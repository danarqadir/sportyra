import { describe, expect, it } from "vitest";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

describe("auth helpers", () => {
  it("normalizeEmail lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM  ")).toBe("foo@bar.com");
  });

  it("normalizeEmail handles already normalized input", () => {
    expect(normalizeEmail("user@test.com")).toBe("user@test.com");
  });

  it("normalizeEmail rejects empty after trim", () => {
    expect(normalizeEmail("   ")).toBe("");
  });

  it("normalizeEmail handles unicode", () => {
    expect(normalizeEmail(" 用户@测试.com ")).toBe("用户@测试.com");
  });
});

describe("password strength validation", () => {
  const PASSWORD_RULES = {
    minLength: 8,
    maxLength: 128,
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

  it("rejects short passwords", () => {
    expect(validatePasswordStrength("Ab1!")).toContain("between");
  });

  it("rejects passwords without uppercase", () => {
    expect(validatePasswordStrength("lowercase1!")).toContain("uppercase");
  });

  it("rejects passwords without lowercase", () => {
    expect(validatePasswordStrength("UPPERCASE1!")).toContain("lowercase");
  });

  it("rejects passwords without digit", () => {
    expect(validatePasswordStrength("NoDigitHere!")).toContain("digit");
  });

  it("rejects passwords without special character", () => {
    expect(validatePasswordStrength("NoSpecial1")).toContain("special");
  });

  it("accepts valid passwords", () => {
    expect(validatePasswordStrength("StrongP@ss1")).toBeNull();
    expect(validatePasswordStrength("Test!123abc")).toBeNull();
  });
});

describe("slug generation", () => {
  function slugify(value: string): string {
    return value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "story";
  }

  it("creates valid slugs", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("  Spaces  ")).toBe("spaces");
    expect(slugify("Special!@#$Chars")).toBe("special-chars");
    expect(slugify("")).toBe("story");
    expect(slugify("Arabic مرحبا")).toBe("arabic-مرحبا");
  });
});

describe("reading time calculation", () => {
  function calculateReadingTime(body: string | null | undefined, description: string): number {
    const text = `${description} ${body || ""}`.trim();
    if (!text) return 1;
    const words = text.split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  }

  it("returns 1 for very short content", () => {
    expect(calculateReadingTime(null, "Short description")).toBe(1);
  });

  it("calculates correct reading time for longer content", () => {
    const longBody = Array(600).fill("word").join(" ");
    expect(calculateReadingTime(longBody, "Description")).toBe(4);
  });
});
