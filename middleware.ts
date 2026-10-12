import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigurationReady, SESSION_COOKIE_NAME, verifySessionToken } from "./lib/session";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Login and the two minimal session endpoints must remain reachable while locked.
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || pathname === "/offline.html") {
    return NextResponse.next();
  }

  if (!isAuthConfigurationReady()) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("setup", "1");
    return NextResponse.redirect(loginUrl);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifySessionToken(token, process.env.AUTH_SECRET);
  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|offline.html|login|api/auth).*)",
  ],
};
