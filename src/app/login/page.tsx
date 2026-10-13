import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { Alert, Button, Meta } from "@/components/ui";
import { authDisabled, getSession } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  // An expired session has already been cleared by the middleware, so a stale
  // `getSession` must not bounce us straight back out.
  if (!expired && (authDisabled || (await getSession()))) redirect("/");

  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <h1 className="text-[17px] text-text">Work Tracker</h1>
      <p className="mt-2 text-faint">A record of work done.</p>

      {expired && (
        <div className="mt-6 max-w-md">
          <Alert>
            Your Google sign-in expired, so you have been signed out. Sign in
            again to carry on — your work is untouched.
          </Alert>
          <Meta className="mt-2 block">
            Google expires this weekly while the OAuth app is on Testing
            status, which is what allows file attachments in Drive at all.
          </Meta>
        </div>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
        className="mt-8"
      >
        <Button type="submit">Continue with Google</Button>
      </form>
    </div>
  );
}
