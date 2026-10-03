import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowed = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          /**
           * Sign-in only. No Drive scope.
           *
           * Any Drive scope makes a published app subject to Google
           * verification — "Access blocked: this app has not completed the
           * Google verification process" — and these three are non-sensitive,
           * so the app stays published and refresh tokens do not expire.
           *
           * Step 4 (attachments) adds `.../auth/drive.file` back and must pick
           * one of: unpublish to Testing and accept a weekly re-login, submit
           * for verification, or store files somewhere other than Drive.
           */
          scope: "openid email profile",
          // Required to actually receive a refresh token.
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
    jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
});
