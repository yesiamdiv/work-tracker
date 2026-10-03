import { auth } from "@/auth";

/**
 * Whether the app is running without authentication.
 *
 * The POC needs no Google OAuth client, so with no `AUTH_GOOGLE_ID` set the app
 * runs open. Guarded hard on `NODE_ENV` as well as the missing credential — a
 * production build will never take this path, however the env is configured.
 */
export const authDisabled =
  process.env.NODE_ENV !== "production" && !process.env.AUTH_GOOGLE_ID;

export type AppSession = { email: string; name: string } | null;

export async function getSession(): Promise<AppSession> {
  if (authDisabled) return { email: "local@dev", name: "Local" };
  const session = await auth();
  if (!session?.user?.email) return null;
  return {
    email: session.user.email,
    name: session.user.name ?? session.user.email,
  };
}
