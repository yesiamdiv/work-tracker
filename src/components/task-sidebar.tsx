"use client";

import Link from "next/link";
import { useState } from "react";

import type { SubjectChip } from "@/db/queries";
import { STALE_DAYS } from "@/db/stats";
import { SubjectLinks } from "@/components/subject-link";
import { LinkPending } from "@/components/link-pending";
import { Meta } from "@/components/ui";
import { ago } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  type: string;
  status: string;
  eventCount: number;
  lastActivityAt: Date | string;
  subjects: SubjectChip[];
};

/**
 * How many tasks a phone shows before asking.
 *
 * The list is ordered by what was touched last, so the task being worked on is
 * all but always in the first few — while all nine of them, at up to three
 * lines a title, come to more than a screen and would push the log out of
 * sight. Desktop has a column to itself and shows the lot.
 */
const PHONE_ROWS = 5;

function isStale(at: Date | string) {
  const ms = Date.now() - new Date(at).getTime();
  return ms > STALE_DAYS * 86_400_000;
}

/**
 * Current tasks, most recently touched first. Selecting one narrows the
 * dashboard to it and points the capture box at it — the "carry on with this"
 * flow, without a page of its own.
 */
export function TaskSidebar({
  tasks,
  closed = [],
  selectedId,
}: {
  tasks: Task[];
  /** Finished tasks, hidden until asked for. */
  closed?: Task[];
  selectedId?: string;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const overflowing = tasks.length > PHONE_ROWS;

  return (
    <nav aria-label="Your tasks">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] uppercase tracking-[0.1em] text-muted">
          Tasks
        </h2>
        <Link
          href="/tasks/new"
          className="extlink text-[13px] text-muted hover:text-text"
        >
          New
        </Link>
      </div>

      <p className="mb-3">
        <Meta>
          {tasks.length} open
          {closed.length > 0 && ` · ${closed.length} finished`}
        </Meta>
      </p>

      {/* This clears the feed filter, not the task list — say which. */}
      {selectedId && (
        <Link
          href="/"
          className="extlink mb-2 block text-[13px] text-muted hover:text-text"
        >
          ← Stop filtering the log
        </Link>
      )}

      {tasks.length === 0 && (
        <p className="rounded-xs border border-dashed border-line px-3 py-5 text-center text-[13px] text-muted">
          No open tasks.
        </p>
      )}

      <ul className="space-y-1">
        {tasks.map((t, i) => {
          const selected = t.id === selectedId;
          const stale = isStale(t.lastActivityAt);
          /*
           * Hidden on a phone only, and never the selected one — it can sit
           * anywhere in the order, and a filter you cannot see is a filter you
           * cannot undo.
           */
          const folded = !showAll && i >= PHONE_ROWS && !selected;
          return (
            <li key={t.id} className={cn(folded && "hidden lg:list-item")}>
              {/*
                The row filters the dashboard to this task, but the subject
                chips are their own links — so the row uses a stretched link
                rather than wrapping everything in one <a>, which cannot
                legally contain other links.
              */}
              <div
                className={cn(
                  "rowlink relative block rounded-xs border px-3 py-2.5",
                  selected
                    ? "border-line-strong bg-raised"
                    : "border-transparent",
                )}
              >
                <span className="flex items-start gap-2">
                  <Link
                    href={selected ? "/" : `/?task=${t.id}`}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "block min-w-0 flex-1 text-[14px] leading-snug after:absolute after:inset-0 after:content-['']",
                      selected ? "text-text" : "text-body",
                    )}
                  >
                    {t.title}
                    <LinkPending />
                  </Link>

                  {/*
                    Opens the task's own page, rather than filtering the feed.
                    Above the stretched link, which otherwise swallows the click.
                  */}
                  <Link
                    href={`/t/${t.id}`}
                    title="Open this task's own page"
                    aria-label={`Open ${t.title}`}
                    className="relative z-10 shrink-0 rounded-xs px-1 text-[13px] text-faint transition-colors hover:bg-raised hover:text-text"
                  >
                    ↗
                  </Link>
                </span>

                <span className="relative z-10 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <SubjectLinks subjects={t.subjects} taskId={t.id} limit={2} />

                  <Meta>· {t.eventCount}</Meta>
                  {/* Stale is stated in words — a dim dot would read as decoration. */}
                  <Meta className={stale ? "text-muted" : undefined}>
                    ·{" "}
                    {stale
                      ? `quiet ${ago(t.lastActivityAt)}`
                      : ago(t.lastActivityAt)}
                  </Meta>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {overflowing && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-2 qbtn lg:hidden"
        >
          {showAll ? "Show fewer" : `Show all ${tasks.length}`}
        </button>
      )}

      {closed.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            aria-expanded={showClosed}
            className="qbtn"
          >
            {showClosed ? "Hide finished" : `Show ${closed.length} finished`}
          </button>

          {showClosed && (
            <ul className="mt-2 space-y-1">
              {closed.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/t/${t.id}`}
                    className="rowlink block rounded-xs border border-transparent px-3 py-2"
                  >
                    <span className="block text-[14px] leading-snug text-muted line-through decoration-line-strong">
                      {t.title}
                    </span>
                    <Meta>
                      {t.status === "done" ? "done" : "dropped"} ·{" "}
                      {t.eventCount} · {ago(t.lastActivityAt)}
                    </Meta>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </nav>
  );
}
