import { NextRequest, NextResponse } from "next/server";
import { OWNER_COOKIE_NAME, OWNER_SESSION_SECONDS, signOwnerSession, verifyOwnerPassword } from "@/lib/owner-session";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
// This process-local limiter is defense-in-depth for local/single-process use only.
// A hosted multi-instance deployment still requires a provider/edge rate limit.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function attemptKey(request: NextRequest): string {
  return request.headers.get("x-real-ip")?.slice(0, 80) || "unknown";
}

function rateLimitResponse(request: NextRequest): NextResponse | null {
  const now = Date.now();
  for (const [key, record] of loginAttempts) if (record.resetAt <= now) loginAttempts.delete(key);
  const key = attemptKey(request);
  const record = loginAttempts.get(key);
  if (!record || record.count < MAX_ATTEMPTS) return null;
  return noStore(NextResponse.json({ error: "Too many attempts. Wait before trying again." }, {
    status: 429,
    headers: { "Retry-After": String(Math.max(1, Math.ceil((record.resetAt - now) / 1000))) },
  }));
}

function recordFailure(request: NextRequest): void {
  const now = Date.now();
  const key = attemptKey(request);
  const record = loginAttempts.get(key);
  loginAttempts.set(key, record && record.resetAt > now
    ? { count: record.count + 1, resetAt: record.resetAt }
    : { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return noStore(NextResponse.json({ error: "Unsupported request." }, { status: 415 }));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid request." }, { status: 400 }));
  }
  if (typeof body !== "object" || body === null || !("password" in body) || typeof body.password !== "string" || body.password.length > 1024) {
    return noStore(NextResponse.json({ error: "Enter your owner password." }, { status: 400 }));
  }

  try {
    if (!verifyOwnerPassword(body.password)) {
      recordFailure(request);
      return noStore(NextResponse.json({ error: "Password not accepted." }, { status: 401 }));
    }
    loginAttempts.delete(attemptKey(request));
    const expiresAt = Date.now() + OWNER_SESSION_SECONDS * 1000;
    const response = NextResponse.json({ ok: true });
    response.cookies.set(OWNER_COOKIE_NAME, `${expiresAt}.${signOwnerSession(expiresAt)}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: OWNER_SESSION_SECONDS,
    });
    return noStore(response);
  } catch {
    return noStore(NextResponse.json({ error: "Owner access is not configured on this deployment." }, { status: 503 }));
  }
}
