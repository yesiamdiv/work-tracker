"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Label, Meta } from "@/components/ui";
import { cn } from "@/lib/utils";

/** How many to show before collapsing. Chosen to fill two or three lines. */
const VISIBLE = 12;

/** Above this many, a search box earns its place. */
const SEARCH_FROM = 8;

export type ChipOption = { id: string; label: string };

/**
 * Picks any number of subjects for a task.
 *
 * Chips flow inline and are only as wide as their name, so however many fit on
 * a line, do — a fixed list of rows would waste the page and, at a hundred
 * subjects, bury the form. Beyond a dozen the rest collapse behind a count,
 * and beyond eight a search box appears.
 *
 * Selected chips are always rendered, even while collapsed: a selection you
 * cannot see is a selection you cannot undo.
 */
export function SubjectChips({
  options,
  picked,
  onToggle,
  onClear,
}: {
  options: ChipOption[];
  picked: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // While collapsed, show the first slice plus anything already ticked.
  const shown = useMemo(() => {
    if (expanded || query.trim() || filtered.length <= VISIBLE) return filtered;
    const head = filtered.slice(0, VISIBLE);
    const missing = filtered.filter(
      (o) => picked.includes(o.id) && !head.some((h) => h.id === o.id),
    );
    return [...head, ...missing];
  }, [filtered, expanded, query, picked]);

  const hidden = filtered.length - shown.length;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <Label>Subjects</Label>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[13px] text-faint transition-colors hover:text-text"
          >
            Clear {picked.length} selected
          </button>
        )}
      </div>

      <p className="mb-2.5 text-[13px] text-faint">
        Optional, and more than one is fine. Leave them all unticked if this
        task is not about a particular subject.
      </p>

      {!options.length ? (
        <p className="rounded-xs border border-dashed border-line px-4 py-5 text-center text-muted">
          No subjects exist yet.{" "}
          <Link
            href="/subjects/new"
            className="extlink text-[13px] text-muted hover:text-text"
          >
            Create one
          </Link>
          <span className="text-[13px] text-faint">
            {" "}
            — or carry on without, it is not required.
          </span>
        </p>
      ) : (
        <>
          {options.length > SEARCH_FROM && (
            <input
              aria-label="Search subjects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${options.length} subjects`}
              className="mb-2.5 w-full rounded-xs border border-line bg-raised px-3 py-2 text-[13px] text-body transition-colors focus:border-line-strong"
            />
          )}

          {/* Chips flow and wrap; each is as wide as its own name. */}
          <div className="flex flex-wrap gap-2">
            {shown.map((o) => {
              const on = picked.includes(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-xs border px-2.5 py-1.5 text-[13px] transition-colors",
                    on
                      ? "border-accent bg-raised text-text"
                      : "border-line text-body hover:border-line-strong hover:bg-raised",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(o.id)}
                    className="size-3.5 shrink-0 accent-neutral-400"
                  />
                  {o.label}
                </label>
              );
            })}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-4">
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-[13px] text-muted underline decoration-line underline-offset-[3px] transition-colors hover:text-text"
              >
                Show {hidden} more
              </button>
            )}
            {expanded && !query.trim() && filtered.length > VISIBLE && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-[13px] text-faint transition-colors hover:text-text"
              >
                Show fewer
              </button>
            )}
            {query.trim() && !filtered.length && (
              <Meta>No subject matches &ldquo;{query.trim()}&rdquo;.</Meta>
            )}
            {picked.length > 0 && (
              <Meta className="ml-auto">
                {picked.length} selected
              </Meta>
            )}
          </div>
        </>
      )}
    </div>
  );
}
