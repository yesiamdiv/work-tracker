import type { eventKind, eventOutcome } from "@/db/schema";
import { extractRefs, type DetectedRef } from "./refs";

type EventKind = (typeof eventKind.enumValues)[number];
type EventOutcome = (typeof eventOutcome.enumValues)[number];

export type ParsedCapture = {
  body: string;
  kind: EventKind;
  outcome: EventOutcome | null;
  tags: string[];
  refs: DetectedRef[];
};

/**
 * Bang-words set kind and outcome so your hands never leave the keyboard.
 * Kept short and unambiguous — if you have to remember it, it isn't working.
 */
const BANGS: Record<string, { kind?: EventKind; outcome?: EventOutcome }> = {
  bug: { kind: "bug_found" },
  fixed: { kind: "bug_update", outcome: "pass" },
  pass: { kind: "test_run", outcome: "pass" },
  fail: { kind: "test_run", outcome: "fail" },
  partial: { kind: "test_run", outcome: "partial" },
  flaky: { kind: "test_run", outcome: "inconclusive" },
  blocked: { kind: "blocker" },
  decision: { kind: "decision" },
  meeting: { kind: "meeting" },
  q: { kind: "question" },
  handoff: { kind: "handoff" },
  done: { kind: "milestone" },
};

export const BANG_HELP = Object.keys(BANGS)
  .map((b) => `!${b}`)
  .join("  ");

/**
 * Parse one line of capture input.
 *
 * `!bug` etc. set kind/outcome, `#tag` tags it, pasted URLs become refs. The
 * markers are stripped from the stored body — except tags, which read naturally
 * in prose and are left in place.
 */
export function parseCapture(input: string): ParsedCapture {
  let kind: EventKind = "note";
  let outcome: EventOutcome | null = null;
  const tags: string[] = [];

  const refs = extractRefs(input);

  // Strip bang-words. Last one wins, so a correction mid-sentence behaves.
  const body = input
    .replace(/(?:^|\s)!([a-z]+)\b/gi, (match, word: string) => {
      const hit = BANGS[word.toLowerCase()];
      if (!hit) return match; // Not a known bang — leave the text alone.
      if (hit.kind) kind = hit.kind;
      if (hit.outcome) outcome = hit.outcome;
      return " ";
    })
    .replace(/(?:^|\s)#([\w-]{1,32})\b/g, (match, tag: string) => {
      tags.push(tag.toLowerCase());
      return match; // Tags stay in the body; they read as prose.
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { body, kind, outcome, tags, refs };
}

/** Human labels for the kinds. No icons, no colour — just words. */
export const KIND_LABEL: Record<EventKind, string> = {
  note: "note",
  test_run: "test run",
  bug_found: "bug found",
  bug_update: "bug update",
  decision: "decision",
  meeting: "meeting",
  blocker: "blocker",
  question: "question",
  handoff: "handoff",
  milestone: "milestone",
};
