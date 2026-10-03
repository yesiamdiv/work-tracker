import Link from "next/link";

import { signOut } from "@/auth";
import { authDisabled, getSession } from "@/lib/session";

const links = [
  { href: "/", label: "Today" },
  { href: "/stream", label: "Stream" },
  { href: "/subjects", label: "Subjects" },
  { href: "/ask", label: "Assistant" },
];

export async function Nav() {
  const session = await getSession();
  if (!session) return null;

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-4 sm:px-8">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-xs px-1 py-0.5 text-body transition-colors hover:text-text"
          >
            {l.label}
          </Link>
        ))}
        {authDisabled ? (
          <span className="ml-auto text-[12.5px] text-faint">local</span>
        ) : (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="ml-auto"
          >
            <button className="text-[12.5px] text-faint transition-colors hover:text-muted">
              Sign out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
