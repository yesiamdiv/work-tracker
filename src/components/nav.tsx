import Link from "next/link";

import { signOut } from "@/auth";
import { LinkPending } from "@/components/link-pending";
import { authDisabled, getSession } from "@/lib/session";

const links = [
  { href: "/", label: "Today" },
  { href: "/stream", label: "Stream" },
  { href: "/subjects", label: "Subjects" },
  { href: "/ask", label: "Assistant" },
  { href: "/answers", label: "Answers" },
  { href: "/settings", label: "Settings" },
];

export async function Nav() {
  const session = await getSession();
  if (!session) return null;

  return (
    <header className="border-b border-line">
      {/*
        Six links are wider than a phone, and running off the edge made the
        page itself scroll sideways: every swipe slid the whole layout under
        the finger. They wrap onto a second line instead.

        Wrapping rather than scrolling them, as the stat tiles do, because a
        link that has to be swiped into view is a link that goes unfound —
        whereas a tile off the edge is only one number of several.
      */}
      <div className="mx-auto flex w-full max-w-5xl items-start gap-4 px-6 py-4 sm:items-center sm:px-8">
        <nav
          aria-label="Sections"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 sm:gap-x-6"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-xs px-1 py-0.5 text-body transition-colors hover:text-text"
            >
              {l.label}
              <LinkPending />
            </Link>
          ))}
        </nav>
        {authDisabled ? (
          <span className="shrink-0 text-[12.5px] text-faint">local</span>
        ) : (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="shrink-0"
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
