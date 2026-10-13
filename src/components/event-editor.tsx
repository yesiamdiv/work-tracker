"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateEvent } from "@/app/actions";
import {
  EntryFields,
  forDateTimeInput,
  type EntryOutcome,
} from "@/components/entry-fields";
import { ImproveButton } from "@/components/improve-button";
import { Button, Label, Meta, Textarea } from "@/components/ui";
import { KIND_LABEL, parseCapture } from "@/lib/capture";
import type { events } from "@/db/schema";


/**
 * Edits an entry in place.
 *
 * Kind and outcome are explicit controls rather than left to the shorthand: on
 * an edit the markers have already been stripped from the stored text, so
 * re-deriving them would silently reset a kind you had set on purpose.
 */
/**
 * The fields an editor needs — not the whole row, so the dashboard feed's
 * lighter shape can use this as well as the task page's full entry.
 */
export type EditableEvent = {
  id: string;
  body: string;
  kind: (typeof events.kind.enumValues)[number];
  outcome: (typeof events.outcome.enumValues)[number] | null;
  occurredAt: Date;
};

export function EventEditor({
  event,
  onDone,
}: {
  event: EditableEvent;
  onDone: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(event.body);
  const [kind, setKind] = useState(event.kind);
  const [outcome, setOutcome] = useState<EntryOutcome>(event.outcome);
  const [when, setWhen] = useState(forDateTimeInput(new Date(event.occurredAt)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Warn before an edit silently drops a link that is currently attached.
  const linksNow = parseCapture(body).refs.length;

  function save() {
    if (!body.trim() || pending) return;
    setError(null);
    start(async () => {
      try {
        await updateEvent({
          eventId: event.id,
          body,
          kind,
          outcome,
          occurredAt: when ? new Date(when) : undefined,
        });
        router.refresh();
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <div className="rounded-xs border border-line-strong p-3.5">
      <Label>Editing this entry</Label>

      <Textarea
        autoFocus
        rows={4}
        value={body}
        disabled={pending}
        onChange={(e) => setBody(e.target.value)}
        /* No keyboard shortcut for saving — the Save button is the only way. */
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
        }}
      />

      <div className="mt-3">
        <EntryFields
          kind={kind}
          outcome={outcome}
          when={when}
          onKind={setKind}
          onOutcome={setOutcome}
          onWhen={setWhen}
          disabled={pending}
        />
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-4">
        <Button onClick={save} disabled={pending || !body.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="text-[13px] text-faint transition-colors hover:text-muted"
        >
          Cancel
        </button>
        <ImproveButton text={body} onAccept={setBody} />
        <Meta className="ml-auto">
          {linksNow
            ? `${linksNow} link${linksNow > 1 ? "s" : ""} in this text`
            : "no links in this text"}
        </Meta>
      </div>

      {error && <Meta className="mt-2 block text-body">{error}</Meta>}
    </div>
  );
}
