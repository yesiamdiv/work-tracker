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

/**
 * The one origin the app answers on, from AUTH_URL.
 *
 * Vercel serves this project on three aliases, but the OAuth redirect_uri is
 * fixed to AUTH_URL. A sign-in begun on any other alias therefore sets its
 * PKCE cookie on that host and then hands the callback to this one, where the
 * cookie does not exist — which Auth.js reports as `InvalidCheck:
 * pkceCodeVerifier value could not be parsed` and the person sees as "There is
 * a problem with the server configuration". It never recovers on its own,
 * because retrying from the same bookmark reproduces it exactly.
 *
 * Funnelling every page request to the canonical origin makes the mismatch
 * impossible rather than something to remember, and keeps Google's console to
 * a single registered redirect URI.
 */
const canonical = (() => {
  const raw = process.env.AUTH_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
})();

const COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
];

export async function middleware(req: NextRequest) {
  if (authDisabled) return NextResponse.next();

  /*
   * GET only. A redirect would drop a POST body, and a form posted from the
   * wrong host carries a CSRF cookie that would not validate here in any case.
   * Arriving at a page is a GET, which is how a stale bookmark gets here.
   */
  if (canonical && req.method === "GET") {
    const host = req.headers.get("host");
    if (host && host !== canonical.host) {
      const to = new URL(
        req.nextUrl.pathname + req.nextUrl.search,
        canonical.origin,
      );
      return NextResponse.redirect(to, 307);
    }
  }

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
