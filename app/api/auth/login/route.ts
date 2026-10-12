import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  isAuthConfigurationReady,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/lib/session";

export const runtime = "nodejs";

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
// Best-effort per-process throttling only; it is not a distributed/host-level rate limiter.
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isThrottled(key: string, now: number): boolean {
  const state = failedAttempts.get(key);
  if (!state) return false;
  if (state.resetAt <= now) {
    failedAttempts.delete(key);
    return false;
  }
  return state.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(key: string, now: number): void {
  const current = failedAttempts.get(key);
  if (!current || current.resetAt <= now) {
    failedAttempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
  } else {
    failedAttempts.set(key, { count: current.count + 1, resetAt: current.resetAt });
  }
  if (failedAttempts.size > 1000) {
    for (const [entry, state] of failedAttempts) {
      if (state.resetAt <= now) failedAttempts.delete(entry);
    }
  }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Send the sign-in request as JSON." }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }

  const ownerPassword = process.env.OWNER_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;
  if (!isAuthConfigurationReady(ownerPassword, authSecret)) {
    return NextResponse.json(
      { error: "Owner-only access is not configured. The app remains locked until the owner sets OWNER_PASSWORD and a 32-byte-or-longer AUTH_SECRET on the server." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const key = clientKey(request);
  const now = Date.now();
  if (isThrottled(key, now)) {
    return NextResponse.json({ error: "Too many failed sign-in attempts. Wait 15 minutes before trying again." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "900" } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const suppliedPassword = typeof body === "object" && body !== null && "password" in body
    ? (body as { password?: unknown }).password
    : undefined;
  if (typeof suppliedPassword !== "string" || suppliedPassword.length > 1024) {
    return NextResponse.json({ error: "Enter the owner password." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const expected = Buffer.from(ownerPassword, "utf8");
  const supplied = Buffer.from(suppliedPassword, "utf8");
  const comparable = Buffer.alloc(expected.length);
  supplied.copy(comparable, 0, 0, expected.length);
  const equalBytes = timingSafeEqual(comparable, expected);
  const matches = equalBytes && supplied.length === expected.length;
  if (!matches) {
    recordFailure(key, now);
    return NextResponse.json({ error: "The password was not accepted." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  failedAttempts.delete(key);
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const token = await createSessionToken(authSecret, expiresAt);
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
