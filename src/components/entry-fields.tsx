"use client";

import { Meta } from "@/components/ui";
import { KIND_LABEL } from "@/lib/capture";
import type { events } from "@/db/schema";

export type EntryKind = (typeof events.kind.enumValues)[number];
export type EntryOutcome = (typeof events.outcome.enumValues)[number] | null;

const KINDS = Object.keys(KIND_LABEL) as EntryKind[];
const OUTCOMES = ["pass", "fail", "partial", "inconclusive"] as const;

/** `datetime-local` wants local wall-clock, not an ISO instant. */
export function forDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const selectCls =
  "cursor-pointer rounded-xs border border-line bg-raised px-2 py-1.5 text-[13px] text-body transition-colors hover:border-line-strong focus:border-line-strong disabled:opacity-50";

/**
 * Kind, outcome and when — the same three controls whether an entry is being
 * written or edited.
 *
 * They were only on the editor before. On creation the kind came solely from
 * shorthand in the text, and that shorthand sits behind a collapsed summary,
 * so in practice nearly everything was filed as a plain note and nothing could
 * be backdated at all.
 *
 * On creation the values follow the text until touched — typing `!bug` moves
 * the Kind select — so the fast path stays as fast as it was.
 */
export function EntryFields({
  kind,
  outcome,
  when,
  onKind,
  onOutcome,
  onWhen,
  disabled,
  note,
}: {
  kind: EntryKind;
  outcome: EntryOutcome;
  /** `datetime-local` value. */
  when: string;
  onKind: (k: EntryKind) => void;
  onOutcome: (o: EntryOutcome) => void;
  onWhen: (w: string) => void;
  disabled?: boolean;
  /** Said once, under the row, when it is worth explaining. */
  note?: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="inline-flex items-center gap-2">
          <Meta className="text-muted">Kind</Meta>
          <select
            aria-label="Entry kind"
            value={kind}
            disabled={disabled}
            onChange={(e) => onKind(e.target.value as EntryKind)}
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
            aria-label="Entry outcome"
            value={outcome ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onOutcome((e.target.value || null) as EntryOutcome)
            }
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
            aria-label="When this happened"
            value={when}
            disabled={disabled}
            onChange={(e) => onWhen(e.target.value)}
            className={selectCls}
          />
        </label>
      </div>

      {note && <Meta className="mt-1.5 block">{note}</Meta>}
    </div>
  );
}
