import type { refs } from "@/db/schema";

type RefKind = (typeof refs.kind.enumValues)[number];

/**
 * How a reference kind is named in the UI — the single source for it.
 *
 * Previously copied into four files, which had already drifted: the subject
 * pages said "Tickets" while an entry said "Ticket", and a kind added to the
 * enum would have needed four edits to show up properly.
 */
const WORD: Record<RefKind, { one: string; many: string }> = {
  jira: { one: "Ticket", many: "Tickets" },
  sheet: { one: "Sheet", many: "Sheets" },
  doc: { one: "Doc", many: "Docs" },
  slide: { one: "Slides", many: "Slides" },
  confluence: { one: "Confluence", many: "Confluence" },
  pr: { one: "PR", many: "Pull requests" },
  build: { one: "Build", many: "Builds" },
  repo: { one: "Repo", many: "Repos" },
  other: { one: "Link", many: "Other links" },
};

export function refWord(kind: string): string {
  return WORD[kind as RefKind]?.one ?? "Link";
}

export function refGroupTitle(kind: string): string {
  return WORD[kind as RefKind]?.many ?? kind;
}

/**
 * What to show for a reference: its ticket key or label, else the bare host.
 * A URL that will not parse falls back to itself rather than throwing.
 */
export function refLabel(ref: {
  label?: string | null;
  externalKey?: string | null;
  url: string;
}): string {
  if (ref.label) return ref.label;
  if (ref.externalKey) return ref.externalKey;
  try {
    return new URL(ref.url).hostname.replace(/^www\./, "");
  } catch {
    return ref.url;
  }
}
