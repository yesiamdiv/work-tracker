import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Gates the app, and signs you out when Google access has lapsed.
 *
 * Auth is switched off when no Google client is configured outside production,
 * so the local POC needs neither credentials nor a secret. See src/lib/session.
 *
 * Deliberately not the `auth()` wrapper: reading the token directly keeps
 * NextAuth from initialising on the path where auth is disabled and there is
 * no AUTH_SECRET to initialise it with.
 */
const authDisabled =
  process.env.NODE_ENV !== "production" && !process.env.AUTH_GOOGLE_ID;

const COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
];

export async function middleware(req: NextRequest) {
  if (authDisabled) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: req.nextUrl.protocol === "https:",
  });

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  /*
   * Google expires the refresh token after seven days for an OAuth app on
   * Testing status, which a Drive scope requires. Once it lapses nothing can
   * recover it in the background, so rather than leave a session that looks
   * signed in but cannot reach Drive, end it here and ask for a fresh one.
   */
  if (token.refreshFailed) {
    const to = new URL("/login", req.nextUrl);
    to.searchParams.set("expired", "1");
    const response = NextResponse.redirect(to);
    for (const name of COOKIES) {
      response.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest).*)"],
};
