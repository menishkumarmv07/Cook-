import { NextRequest, NextResponse } from "next/server";
import { OWNER_COOKIE_NAME, OWNER_SESSION_SECONDS, signOwnerSession, verifyOwnerPassword } from "@/lib/owner-session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("password" in body) || typeof body.password !== "string" || body.password.length > 1024) {
    return NextResponse.json({ error: "Enter your owner password." }, { status: 400 });
  }

  try {
    if (!verifyOwnerPassword(body.password)) {
      return NextResponse.json({ error: "Password not accepted." }, { status: 401 });
    }
    const expiresAt = Date.now() + OWNER_SESSION_SECONDS * 1000;
    const response = NextResponse.json({ ok: true });
    response.cookies.set(OWNER_COOKIE_NAME, `${expiresAt}.${signOwnerSession(expiresAt)}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: OWNER_SESSION_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Owner access is not configured on this deployment." }, { status: 503 });
  }
}
