"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateEvent } from "@/app/actions";
import { ImproveButton } from "@/components/improve-button";
import { Button, Label, Meta } from "@/components/ui";
import { KIND_LABEL, parseCapture } from "@/lib/capture";
import type { Event } from "@/db/schema";

const KINDS = Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[];
const OUTCOMES = ["pass", "fail", "partial", "inconclusive"] as const;

/** `datetime-local` wants local wall-clock, not an ISO instant. */
function forInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Edits an entry in place.
 *
 * Kind and outcome are explicit controls rather than left to the shorthand: on
 * an edit the markers have already been stripped from the stored text, so
 * re-deriving them would silently reset a kind you had set on purpose.
 */
export function EventEditor({
  event,
  onDone,
}: {
  event: Event;
  onDone: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(event.body);
  const [kind, setKind] = useState(event.kind);
  const [outcome, setOutcome] = useState(event.outcome ?? "");
  const [when, setWhen] = useState(forInput(new Date(event.occurredAt)));
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
          outcome: outcome ? (outcome as (typeof OUTCOMES)[number]) : null,
          occurredAt: when ? new Date(when) : undefined,
        });
        router.refresh();
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  const selectCls =
    "rounded-xs border border-line bg-raised px-2 py-1.5 text-[13px] text-body transition-colors hover:border-line-strong focus:border-line-strong";

  return (
    <div className="rounded-xs border border-line-strong p-3.5">
      <Label>Editing this entry</Label>

      <textarea
        autoFocus
        rows={4}
        value={body}
        disabled={pending}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") onDone();
        }}
        className="w-full rounded-xs border border-line bg-raised px-3 py-2.5 text-body transition-colors focus:border-line-strong disabled:opacity-50"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <label className="inline-flex items-center gap-2">
          <Meta className="text-muted">Kind</Meta>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className={selectCls}
          >
            {KINDS.map((k) => (
              <option key={k} value={k} className="bg-bg">
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-2">
          <Meta className="text-muted">Outcome</Meta>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className={selectCls}
          >
            <option value="" className="bg-bg">
              none
            </option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o} className="bg-bg">
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-2">
          <Meta className="text-muted">When</Meta>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={selectCls}
          />
        </label>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-4">
        <Button onClick={save} disabled={pending || !body.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <button
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
