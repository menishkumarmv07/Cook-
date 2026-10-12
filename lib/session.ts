export const SESSION_COOKIE_NAME = "cooking_creator_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_OWNER_PASSWORD_LENGTH = 16;
const MIN_AUTH_SECRET_BYTES = 32;

export function isAuthConfigurationReady(
  ownerPassword = process.env.OWNER_PASSWORD,
  authSecret = process.env.AUTH_SECRET,
): boolean {
  return typeof ownerPassword === "string"
    && ownerPassword.length >= MIN_OWNER_PASSWORD_LENGTH
    && typeof authSecret === "string"
    && new TextEncoder().encode(authSecret).length >= MIN_AUTH_SECRET_BYTES;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const standard = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function getSigningKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

export async function createSessionToken(secret: string, expiresAt: number): Promise<string> {
  if (new TextEncoder().encode(secret).length < MIN_AUTH_SECRET_BYTES) {
    throw new Error("AUTH_SECRET must contain at least 32 UTF-8 bytes.");
  }
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new Error("Session expiry must be a positive integer timestamp.");
  }
  const message = new TextEncoder().encode(`cooking-creator-session:${expiresAt}`);
  const key = await getSigningKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return `${expiresAt}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token || !secret || new TextEncoder().encode(secret).length < MIN_AUTH_SECRET_BYTES) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d{10,12}$/.test(parts[0])) return false;
  const expiresAt = Number(parts[0]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + SESSION_TTL_SECONDS + 60) return false;
  const signature = decodeBase64Url(parts[1]);
  if (!signature || signature.length !== 32) return false;
  try {
    const key = await getSigningKey(secret, ["verify"]);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(`cooking-creator-session:${expiresAt}`),
    );
  } catch {
    return false;
  }
}
