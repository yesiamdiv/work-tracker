import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Google from "next-auth/providers/google";

/**
 * Auth.js builds its callback URL by handing AUTH_URL to `new URL()`, so a
 * value with no scheme throws `ERR_INVALID_URL` and every page 500s with
 * nothing but a digest to go on. A bare hostname is the obvious thing to paste
 * into a dashboard field, so accept it rather than crash on it.
 */
function normaliseAuthUrl() {
  const raw = process.env.AUTH_URL?.trim();
  if (!raw) return;
  if (/^https?:\/\//i.test(raw)) return;
  const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(raw) ? "http" : "https";
  process.env.AUTH_URL = `${scheme}://${raw}`;
  console.warn(
    `[auth] AUTH_URL had no scheme; reading it as ${process.env.AUTH_URL}`,
  );
}

normaliseAuthUrl();

const allowed = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Per-file Drive access: the app only ever sees files it created itself. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          /**
           * `drive.file` is included so attachments can be stored in Drive.
           *
           * This requires the OAuth app to stay on **Testing** publishing
           * status: a *published* app requesting any Drive scope is blocked
           * pending Google verification. The cost of Testing is that refresh
           * tokens expire after 7 days, so signing in again weekly is expected
           * — see the Drive section of PLAN.md.
           */
          scope: `openid email profile ${DRIVE_SCOPE}`,
          // Both are required to actually receive a refresh token.
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      // A single-user app: an empty allowlist locks everyone out rather than
      // letting anyone in.
      return allowed.includes(email);
    },

    async jwt({ token, account }) {
      // Fresh sign-in: keep the tokens and when the access token lapses.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt = account.expires_at;
        token.scope = account.scope;
        delete token.refreshFailed;
        return token;
      }

      // Google access tokens last an hour; refresh a minute early.
      const expiresAt = token.expiresAt ?? 0;
      if (Date.now() < (expiresAt - 60) * 1000) return token;
      if (!token.refreshToken) return token;

      return refresh(token);
    },

    session({ session, token }) {
      session.accessToken = token.accessToken;
      session.hasDrive = (token.scope ?? "").includes(DRIVE_SCOPE);
      session.refreshFailed = !!token.refreshFailed;
      return session;
    },
  },
});

/**
 * Exchanges the refresh token for a new access token.
 *
 * On a Testing-status app the refresh token itself expires after 7 days, which
 * surfaces here as `invalid_grant`. That is not recoverable in the background,
 * so the failure is flagged on the token and the UI asks for a fresh sign-in
 * rather than failing an upload with something cryptic.
 */
async function refresh(token: JWT): Promise<JWT> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    });

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      scope?: string;
      error?: string;
    };

    if (!response.ok || !data.access_token) {
      throw new Error(data.error ?? `token endpoint returned ${response.status}`);
    }

    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      // Google only sometimes rotates it; keep the old one otherwise.
      refreshToken: data.refresh_token ?? token.refreshToken,
      scope: data.scope ?? token.scope,
      refreshFailed: false,
    };
  } catch (error) {
    console.error("[auth] could not refresh the Google token:", error);
    return { ...token, accessToken: undefined, refreshFailed: true };
  }
}
