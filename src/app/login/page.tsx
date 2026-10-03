import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { authDisabled, getSession } from "@/lib/session";
import { Button } from "@/components/ui";

export default async function LoginPage() {
  if (authDisabled || (await getSession())) redirect("/");

  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <h1 className="text-[17px] text-text">Work Tracker</h1>
      <p className="mt-2 text-faint">A record of work done.</p>

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
