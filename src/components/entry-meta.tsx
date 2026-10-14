import { Clamp } from "@/components/clamp";
import { Meta } from "@/components/ui";
import { KIND_LABEL } from "@/lib/capture";
import type { events } from "@/db/schema";
import { timeLabel } from "@/lib/utils";

type Kind = (typeof events.kind.enumValues)[number];
type Outcome = (typeof events.outcome.enumValues)[number] | null;

/**
 * The strip above an entry: when, what kind, how it went, how many links.
 *
 * Shared by the task page and the feed rows, which had their own copies and
 * had already drifted — one showed the link count, the other did not.
 *
 * `actions` is whatever belongs on the right (Edit, Delete), which differs by
 * caller and so is passed in rather than guessed at.
 */
export function EntryMeta({
  occurredAt,
  kind,
  outcome,
  refCount = 0,
  actions,
}: {
  occurredAt: Date | string;
  kind: Kind;
  outcome: Outcome;
  refCount?: number;
  actions?: React.ReactNode;
}) {
  const failed = outcome === "fail";
  const rule = <span aria-hidden className="h-3 w-px bg-line" />;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <Meta className="text-muted">{timeLabel(occurredAt)}</Meta>
      {rule}
      <Meta className="text-muted">{KIND_LABEL[kind]}</Meta>
      {outcome && (
        <>
          {rule}
          <Meta className={failed ? "text-text" : "text-muted"}>{outcome}</Meta>
        </>
      )}
      {refCount > 0 && (
        <>
          {rule}
          <Meta>
            {refCount} link{refCount > 1 ? "s" : ""}
          </Meta>
        </>
      )}
      {actions && <span className="ml-auto flex items-center gap-3">{actions}</span>}
    </div>
  );
}

/**
 * An entry's text, with a failure marked by a rule down its side rather than a
 * colour.
 *
 * Long entries are capped and opened on demand: a single pasted block of
 * credentials or a stack trace would otherwise push every other entry off the
 * screen, and the feed's whole job is letting you scan what happened.
 *
 * Only the text is capped. Links, files and the attach control sit below it and
 * stay visible whether it is open or not — they are how you act on the entry.
 */
export function EntryBody({
  body,
  failed,
  children,
}: {
  body: string;
  failed: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={failed ? "border-l border-line-strong pl-3" : ""}>
      <Clamp moreLabel="Show the rest" lessLabel="Show less">
        <p className="whitespace-pre-wrap break-words text-body">{body}</p>
      </Clamp>
      {children}
    </div>
  );
}
