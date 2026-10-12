import { createHmac, timingSafeEqual } from "node:crypto";

export const OWNER_COOKIE_NAME = "cooking_owner_session";
export const OWNER_SESSION_SECONDS = 60 * 60 * 8;

function getSecret(): string {
  const secret = process.env.COOKING_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("COOKING_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export function signOwnerSession(expiresAt: number): string {
  return createHmac("sha256", getSecret()).update(`owner:${expiresAt}`).digest("hex");
}

export function verifyOwnerSession(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const separator = value.indexOf(".");
  if (separator < 1) return false;
  const expiresText = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!/^\d+$/.test(expiresText) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const expected = signOwnerSession(expiresAt);
  const actualBytes = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function verifyOwnerPassword(candidate: string): boolean {
  const expected = process.env.COOKING_OWNER_PASSWORD;
  if (!expected || expected.length < 16) {
    throw new Error("COOKING_OWNER_PASSWORD must be configured with at least 16 characters.");
  }
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}
