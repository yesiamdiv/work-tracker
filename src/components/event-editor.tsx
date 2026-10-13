"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateEvent } from "@/app/actions";
import { filesFromClipboard, uploadFilesToEvent } from "@/lib/drive-upload";
import {
  EntryFields,
  forDateTimeInput,
  type EntryOutcome,
} from "@/components/entry-fields";
import { FileStaging, type Staged } from "@/components/file-staging";
import { ImproveButton } from "@/components/improve-button";
import {
  looksLikeExpiredSignIn,
  ReauthNotice,
} from "@/components/reauth-notice";
import { Alert, Button, Label, Meta, Textarea } from "@/components/ui";
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
  const [staged, setStaged] = useState<Staged[]>([]);
  const [pending, start] = useTransition();

  // Warn before an edit silently drops a link that is currently attached.
  const linksNow = parseCapture(body).refs.length;

  const stage = (files: File[]) =>
    setStaged((list) => [...list, ...files.map((file) => ({ file }))]);

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

        // The entry already exists here, so files can go straight up.
        if (staged.length) {
          const result = await uploadFilesToEvent(
            event.id,
            staged.map((s) => s.file),
            ({ index, pct }) =>
              setStaged((list) =>
                list.map((s, i) => (i === index ? { ...s, pct } : s)),
              ),
          );
          if (result.failures.length) {
            const n = result.failures.length;
            setError(
              `Changes saved, but ${n} file${n > 1 ? "s" : ""} did not upload: ${result.failures[0].error}`,
            );
            router.refresh();
            return;
          }
        }

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
        onPaste={(e) => {
          const files = filesFromClipboard(e.nativeEvent);
          if (files.length) {
            e.preventDefault();
            stage(files);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) {
            e.preventDefault();
            stage(files);
          }
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
          {pending
            ? "Saving…"
            : staged.length
              ? `Save + ${staged.length} file${staged.length > 1 ? "s" : ""}`
              : "Save"}
        </Button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="text-[13px] text-faint transition-colors hover:text-muted"
        >
          Cancel
        </button>
        <FileStaging
          staged={staged}
          disabled={pending}
          onAdd={stage}
          onRemove={(i) => setStaged((list) => list.filter((_, j) => j !== i))}
        />
        <ImproveButton text={body} onAccept={setBody} />
        <Meta className="ml-auto">
          {linksNow
            ? `${linksNow} link${linksNow > 1 ? "s" : ""} in this text`
            : "no links in this text"}
        </Meta>
      </div>

      {error &&
        (looksLikeExpiredSignIn(error) ? (
          <ReauthNotice message={error} />
        ) : (
          <Alert>{error}</Alert>
        ))}
    </div>
  );
}
