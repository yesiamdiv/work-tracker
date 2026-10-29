"use client";

import { signOut } from "next-auth/react";

import { Alert } from "@/components/ui";

/** Text Drive throws when the refresh token has lapsed. */
const EXPIRED = /sign-in has expired|not granted|Not signed in/i;

export function looksLikeExpiredSignIn(message: string | null): boolean {
  return !!message && EXPIRED.test(message);
}

/**
 * Shown when Drive refuses because the Google sign-in lapsed.
 *
 * Google expires refresh tokens after seven days for an OAuth app on Testing
 * status, and Testing is required to use a Drive scope at all without
 * verification — so this recurs weekly by design. It offers the fix rather
 * than describing it.
 */
export function ReauthNotice({ message }: { message: string }) {
  return (
    <Alert
      action={
        <button
          type="button"
          onClick={() => signOut({ redirectTo: "/login" })}
          className="shrink-0 qbtn-strong"
        >
          Sign in again
        </button>
      }
    >
      {message}
    </Alert>
  );
}
