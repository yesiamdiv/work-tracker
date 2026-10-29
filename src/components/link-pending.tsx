"use client";

import { useLinkStatus } from "next/link";

/**
 * Says that the link it sits inside is the one being waited for.
 *
 * Every page here is rendered on the server, so tapping a task or a section
 * did nothing visible until the new page arrived — on a slow connection, long
 * enough to wonder whether the tap had registered and press again.
 *
 * Must be rendered inside the `<Link>` it reports on: `useLinkStatus` reads
 * the nearest one above it. It renders nothing at rest, so an idle link keeps
 * exactly the layout it had.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden className="loadbar" />;
}
