import { NextResponse, type NextRequest } from "next/server";

/**
 * Gate everything behind the login — unless auth is switched off, which it is
 * when no Google client is configured outside production. See src/lib/session.
 *
 * Kept as plain middleware rather than the `auth()` wrapper so that the
 * unauthenticated POC does not need `AUTH_SECRET` either.
 */
const authDisabled =
  process.env.NODE_ENV !== "production" && !process.env.AUTH_GOOGLE_ID;

export function middleware(req: NextRequest) {
  if (authDisabled) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Presence of the session cookie is enough to let the request through; the
  // pages themselves verify it properly via `getSession()`.
  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest).*)"],
};
