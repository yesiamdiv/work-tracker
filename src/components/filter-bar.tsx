"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { MultiPicker, type PickerOption } from "@/components/multi-picker";
import { Button, Input, Label, Meta } from "@/components/ui";
import { KIND_LABEL } from "@/lib/capture";
import {
  activeCount,
  CLOCK_PRESETS,
  clockText,
  dowText,
  type Filters,
  KIND_VALUES,
  OUTCOMES,
  parseFilters,
  RANGES,
  rangeText,
  toParams,
} from "@/lib/filters";
import { DOW_LABEL } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Everything you can narrow the log by.
 *
 * The old bar had four dropdowns and could express one subject, one kind, one
 * outcome and a range rounded to whole days back from this instant. The
 * questions that actually come up are not that shape: two subjects at once,
 * the three tasks that moved last week, Tuesday afternoon specifically, the
 * overnight runs, weekdays only.
 *
 * It is a form rather than a set of live dropdowns. Each dropdown used to
 * navigate on change, which was fine for one filter and wrong for six — you
 * cannot assemble "these two subjects, this fortnight, mornings only" without
 * sitting through five intermediate page loads, each one re-querying. So the
 * controls edit a draft, Apply commits it in a single navigation, and the
 * applied set is shown separately as chips. Taking a chip off is the one thing
 * that does navigate immediately, because removing a filter is never half of
 * a larger intent.
 */
export function FilterBar({
  subjects,
  tasks,
  basePath = "/stream",
  searchLabel = "Search the text of your entries",
  tz,
}: {
  subjects: PickerOption[];
  tasks: PickerOption[];
  basePath?: string;
  searchLabel?: string;
  /** Resolved on the server, so the labels agree with the query. */
  tz: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const applied = useMemo(
    () => parseFilters(Object.fromEntries(params.entries())),
    [params],
  );
  const [draft, setDraft] = useState<Filters>(applied);

  // Follow the URL when it changes under us: back button, a chip removed, or
  // one of the links elsewhere in the app that arrives with filters set.
  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  const appliedQs = toParams(applied).toString();
  const draftQs = toParams(draft).toString();
  const dirty = appliedQs !== draftQs;

  const advancedCount =
    draft.subjectIds.length +
    draft.taskIds.length +
    draft.kinds.length +
    draft.outcomes.length +
    (draft.withRefs ? 1 : 0) +
    (draft.fromDay || draft.toDay ? 1 : 0) +
    (draft.clockFrom || draft.clockTo ? 1 : 0) +
    (draft.daysOfWeek.length ? 1 : 0);

  const [open, setOpen] = useState(advancedCount > 0);

  function go(f: Filters) {
    const qs = toParams(f).toString();
    start(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  }

  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  /** Toggle one value in one of the array filters. */
  function toggleIn<K extends "kinds" | "outcomes" | "daysOfWeek">(
    key: K,
    v: Filters[K][number],
  ) {
    setDraft((d) => {
      const list = d[key] as Filters[K][number][];
      const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
      return { ...d, [key]: key === "daysOfWeek" ? [...next].sort() : next };
    });
  }

  return (
    <div className="mb-7 rounded-xs border border-line">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(draft);
        }}
      >
        <div className="p-4">
          <Label>{searchLabel}</Label>
          <div className="flex gap-2">
            <Input
              aria-label={searchLabel}
              value={draft.q ?? ""}
              onChange={(e) => set({ q: e.target.value || undefined })}
              placeholder="e.g. reconnect, sleep current, ACME-4421"
            />
            <Button type="submit" busy={pending} className="shrink-0 px-4">
              Search
            </Button>
          </div>

          <div className="mt-4">
            <Label>When</Label>
            <div className="flex flex-wrap items-center gap-2">
              {RANGES.map((r) => (
                <Chip
                  key={r.v}
                  on={draft.range === r.v}
                  onClick={() =>
                    set({
                      range: draft.range === r.v ? undefined : r.v,
                      // A named range and an exact one are two answers to the
                      // same question, so choosing one drops the other.
                      fromDay: undefined,
                      toDay: undefined,
                    })
                  }
                >
                  {r.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="qbtn"
            >
              {open ? "Fewer filters" : "More filters"}
              {!open && advancedCount > 0 && ` (${advancedCount})`}
            </button>
            {!open && advancedCount > 0 && (
              <Meta>subject, task, exact dates, time of day and more</Meta>
            )}
          </div>
        </div>

        {open && (
          <div className="space-y-5 border-t border-line p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <Label>Subjects</Label>
                <MultiPicker
                  options={subjects}
                  value={draft.subjectIds}
                  onChange={(subjectIds) => set({ subjectIds })}
                  anyLabel="Any subject"
                  noun="subject"
                />
                <Meta className="mt-1.5 block">
                  Picking a parent includes its parts. Several means any of them.
                </Meta>
              </div>

              <div className="min-w-0">
                <Label>Tasks</Label>
                <MultiPicker
                  options={tasks}
                  value={draft.taskIds}
                  onChange={(taskIds) => set({ taskIds })}
                  anyLabel="Any task"
                  noun="task"
                />
                <Meta className="mt-1.5 block">
                  Open tasks first, then finished ones.
                </Meta>
              </div>
            </div>

            <div>
              <Label>Exact dates</Label>
              <div className="flex flex-wrap items-center gap-2">
                <DateField
                  label="From"
                  value={draft.fromDay ?? ""}
                  onChange={(fromDay) =>
                    set({ fromDay: fromDay || undefined, range: undefined })
                  }
                />
                <DateField
                  label="To"
                  value={draft.toDay ?? ""}
                  onChange={(toDay) =>
                    set({ toDay: toDay || undefined, range: undefined })
                  }
                />
                {(draft.fromDay || draft.toDay) && (
                  <button
                    type="button"
                    onClick={() => set({ fromDay: undefined, toDay: undefined })}
                    className="qbtn"
                  >
                    Clear dates
                  </button>
                )}
              </div>
              <Meta className="mt-1.5 block">
                Both ends count as inside the range. One on its own is an open
                end. Set either and the quick ranges above switch off.
              </Meta>
            </div>

            <div>
              <Label>Time of day</Label>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {CLOCK_PRESETS.map((p) => (
                  <Chip
                    key={p.label}
                    on={draft.clockFrom === p.t0 && draft.clockTo === p.t1}
                    onClick={() =>
                      set(
                        draft.clockFrom === p.t0 && draft.clockTo === p.t1
                          ? { clockFrom: undefined, clockTo: undefined }
                          : { clockFrom: p.t0, clockTo: p.t1 },
                      )
                    }
                  >
                    {p.label}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TimeField
                  label="After"
                  value={draft.clockFrom ?? ""}
                  onChange={(clockFrom) => set({ clockFrom: clockFrom || undefined })}
                />
                <TimeField
                  label="Before"
                  value={draft.clockTo ?? ""}
                  onChange={(clockTo) => set({ clockTo: clockTo || undefined })}
                />
                {(draft.clockFrom || draft.clockTo) && (
                  <button
                    type="button"
                    onClick={() => set({ clockFrom: undefined, clockTo: undefined })}
                    className="qbtn"
                  >
                    Clear times
                  </button>
                )}
              </div>
              <Meta className="mt-1.5 block">
                Applies to every day in the range, so &ldquo;mornings, this
                month&rdquo; is one filter. Read in {tz}. A later start than end
                — 22:00 to 06:00 — means across midnight.
              </Meta>
            </div>

            <div>
              <Label>Days of the week</Label>
              <div className="flex flex-wrap items-center gap-2">
                {DOW_LABEL.map((d, i) => (
                  <Chip
                    key={d}
                    on={draft.daysOfWeek.includes(i + 1)}
                    onClick={() => toggleIn("daysOfWeek", i + 1)}
                  >
                    {d}
                  </Chip>
                ))}
                <button
                  type="button"
                  onClick={() => set({ daysOfWeek: [1, 2, 3, 4, 5] })}
                  className="qbtn ml-1"
                >
                  Weekdays
                </button>
                {draft.daysOfWeek.length > 0 && (
                  <button
                    type="button"
                    onClick={() => set({ daysOfWeek: [] })}
                    className="qbtn"
                  >
                    Any day
                  </button>
                )}
              </div>
            </div>

            <div>
              <Label>Kind of entry</Label>
              <div className="flex flex-wrap items-center gap-2">
                {KIND_VALUES.map((k) => (
                  <Chip
                    key={k}
                    on={draft.kinds.includes(k)}
                    onClick={() => toggleIn("kinds", k)}
                  >
                    {KIND_LABEL[k]}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Label>Outcome</Label>
              <div className="flex flex-wrap items-center gap-2">
                {OUTCOMES.map((o) => (
                  <Chip
                    key={o}
                    on={draft.outcomes.includes(o)}
                    onClick={() => toggleIn("outcomes", o)}
                  >
                    {o}
                  </Chip>
                ))}
                <label className="ml-1 inline-flex cursor-pointer items-center gap-2 rounded-xs border border-line px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={draft.withRefs}
                    onChange={(e) => set({ withRefs: e.target.checked })}
                    className="size-3.5 accent-neutral-400"
                  />
                  <Meta className="text-body">Has a link</Meta>
                </label>
              </div>
            </div>
          </div>
        )}

        {/*
          The commit. Always present once something is unapplied, so the draft
          can never be mistaken for the view you are looking at.
        */}
        {(dirty || activeCount(applied) > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
            {dirty ? (
              <>
                <Button type="submit" busy={pending} className="px-4">
                  Apply
                </Button>
                <button
                  type="button"
                  onClick={() => setDraft(applied)}
                  className="qbtn"
                >
                  Undo changes
                </button>
                <Meta>Not applied yet</Meta>
              </>
            ) : (
              <Meta>
                {activeCount(applied)} filter
                {activeCount(applied) === 1 ? "" : "s"} applied
              </Meta>
            )}
            {activeCount(applied) > 0 && (
              <button
                type="button"
                onClick={() => go(parseFilters({}))}
                className="qbtn ml-auto"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </form>

      {/*
        What is actually narrowing the list right now — the applied set, not
        the draft. Each one comes off on its own, which is the common correction
        after a search that was too narrow.
      */}
      {activeCount(applied) > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          {pending && <span aria-hidden className="loadbar" />}
          {applied.q && (
            <Pill onRemove={() => go({ ...applied, q: undefined })}>
              text: {applied.q}
            </Pill>
          )}
          {applied.subjectIds.map((id) => (
            <Pill
              key={id}
              onRemove={() =>
                go({
                  ...applied,
                  subjectIds: applied.subjectIds.filter((s) => s !== id),
                })
              }
            >
              {subjects.find((s) => s.id === id)?.label ?? "subject"}
            </Pill>
          ))}
          {applied.taskIds.map((id) => (
            <Pill
              key={id}
              onRemove={() =>
                go({ ...applied, taskIds: applied.taskIds.filter((t) => t !== id) })
              }
            >
              {tasks.find((t) => t.id === id)?.label ?? "task"}
            </Pill>
          ))}
          {applied.kinds.map((k) => (
            <Pill
              key={k}
              onRemove={() =>
                go({ ...applied, kinds: applied.kinds.filter((x) => x !== k) })
              }
            >
              {KIND_LABEL[k]}
            </Pill>
          ))}
          {applied.outcomes.map((o) => (
            <Pill
              key={o}
              onRemove={() =>
                go({ ...applied, outcomes: applied.outcomes.filter((x) => x !== o) })
              }
            >
              {o}
            </Pill>
          ))}
          {applied.withRefs && (
            <Pill onRemove={() => go({ ...applied, withRefs: false })}>
              has a link
            </Pill>
          )}
          {rangeText(applied, tz) && (
            <Pill
              onRemove={() =>
                go({ ...applied, range: undefined, fromDay: undefined, toDay: undefined })
              }
            >
              {rangeText(applied, tz)}
            </Pill>
          )}
          {clockText(applied) && (
            <Pill
              onRemove={() =>
                go({ ...applied, clockFrom: undefined, clockTo: undefined })
              }
            >
              {clockText(applied)}
            </Pill>
          )}
          {dowText(applied) && (
            <Pill onRemove={() => go({ ...applied, daysOfWeek: [] })}>
              {dowText(applied)}
            </Pill>
          )}
        </div>
      )}
    </div>
  );
}

/** A filter that is either on or off, stated as a word rather than a checkbox. */
function Chip({
  children,
  on,
  onClick,
}: {
  children: React.ReactNode;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-xs border px-2.5 py-1 text-[13px] transition-colors",
        "active:translate-y-px active:border-line-strong active:bg-raised-hi active:text-text",
        on
          ? "border-line-strong bg-raised text-text"
          : "border-line text-muted hover:border-line-strong hover:bg-raised hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

/** An applied filter, with the one control that takes it off again. */
function Pill({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-xs border border-line-strong bg-raised px-2 py-[3px] text-[12.5px] text-body">
      <span className="min-w-0 truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this filter"
        className="shrink-0 px-0.5 text-faint transition-colors hover:text-text active:text-text"
      >
        ×
      </button>
    </span>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xs border border-line bg-raised px-2.5 py-1.5">
      <Meta className="shrink-0">{label}</Meta>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-[13px] text-body outline-none"
      />
    </label>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xs border border-line bg-raised px-2.5 py-1.5">
      <Meta className="shrink-0">{label}</Meta>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-[13px] text-body outline-none"
      />
    </label>
  );
}
