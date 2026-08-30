import crypto from "node:crypto";

// Minimal, dependency-free TOTP (RFC 6238) implementation built on node:crypto.
// Used to enforce a second factor for admin accounts.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  // Pad to a multiple of 8 with '=' like standard base32 (used by authenticator apps).
  const padding = output.length % 8 === 0 ? 0 : 8 - (output.length % 8);
  return output + "=".repeat(padding);
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    buffer = (buffer << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

function hmacDigits(secretBuffer: Buffer, counter: bigint, digits: number): number {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter, 0);
  const hmac = crypto.createHmac("sha1", secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return binCode % 10 ** digits;
}

export function totpCode(secret: string, timeStepSeconds = 30, digits = 6): string {
  const secretBuffer = base32Decode(secret);
  const counter = BigInt(Math.floor(Date.now() / 1000 / timeStepSeconds));
  return hmacDigits(secretBuffer, counter, digits).toString().padStart(digits, "0");
}

export function verifyTotp(
  secret: string,
  code: string,
  window = 1,
  timeStepSeconds = 30,
  digits = 6,
): boolean {
  const codeStr = code.trim();
  if (!/^\d{6}$/.test(codeStr)) return false;
  const secretBuffer = base32Decode(secret);
  if (secretBuffer.length === 0) return false;
  const currentCounter = Math.floor(Date.now() / 1000 / timeStepSeconds);
  for (let offset = -window; offset <= window; offset++) {
    const counter = BigInt(currentCounter + offset);
    const candidate = hmacDigits(secretBuffer, counter, digits).toString().padStart(digits, "0");
    // Constant-time comparison.
    if (candidate.length === codeStr.length && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(codeStr))) {
      return true;
    }
  }
  return false;
}

export function otpauthUrl(secret: string, accountName: string, issuer = "Sportyra"): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
