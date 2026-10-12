import { NextResponse, type NextRequest } from "next/server";
import { inspectSessionToken, isAuthConfigurationReady, SESSION_COOKIE_NAME } from "./lib/session";

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
  const sessionCheck = await inspectSessionToken(token, process.env.AUTH_SECRET);
  if (sessionCheck.valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", pathname + request.nextUrl.search);
  const redirectResponse = NextResponse.redirect(loginUrl);
  // This header is enabled only during CI diagnostics; it never includes a token or secret.
  if (process.env.AUTH_TEST_DIAGNOSTICS === "1") {
    redirectResponse.headers.set("X-Owner-Auth-Diagnostic", sessionCheck.reason);
  }
  return redirectResponse;
}

export const config = {
  // Next.js 15.5 supports the Node.js middleware runtime; keep session crypto
  // in the same standard runtime as the login route rather than Edge Web Crypto.
  runtime: "nodejs",
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw\\.js$|offline\\.html$|login(?:/|$)|api/auth(?:/|$)).*)",
  ],
};
