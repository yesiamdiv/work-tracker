import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    /** Google access token, used for Drive uploads. Undefined if refresh failed. */
    accessToken?: string;
    /** Whether the granted scopes include drive.file. */
    hasDrive?: boolean;
    /** True when the refresh token has lapsed and a fresh sign-in is needed. */
    refreshFailed?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    /** Unix seconds. */
    expiresAt?: number;
    /** Space-separated granted scopes. */
    scope?: string;
    refreshFailed?: boolean;
  }
}
