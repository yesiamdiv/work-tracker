"use client";

import Link from "next/link";
import { useState } from "react";

import type { SubjectChip } from "@/db/queries";
import { STALE_DAYS } from "@/db/stats";
import { SubjectLinks } from "@/components/subject-link";
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
        {tasks.map((t) => {
          const selected = t.id === selectedId;
          const stale = isStale(t.lastActivityAt);
          return (
            <li key={t.id}>
              {/*
                The row filters the dashboard to this task, but the subject
                chips are their own links — so the row uses a stretched link
                rather than wrapping everything in one <a>, which cannot
                legally contain other links.
              */}
              <div
                className={cn(
                  "rowlink relative block rounded-xs border px-3 py-2.5",
                  selected ? "border-line-strong bg-raised" : "border-transparent",
                )}
              >
                <Link
                  href={selected ? "/" : `/?task=${t.id}`}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "block text-[14px] leading-snug after:absolute after:inset-0 after:content-['']",
                    selected ? "text-text" : "text-body",
                  )}
                >
                  {t.title}
                </Link>

                <span className="relative z-10 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <SubjectLinks
                    subjects={t.subjects}
                    taskId={t.id}
                    limit={2}
                  />

                  <Meta>· {t.eventCount}</Meta>
                  {/* Stale is stated in words — a dim dot would read as decoration. */}
                  <Meta className={stale ? "text-muted" : undefined}>
                    · {stale ? `quiet ${ago(t.lastActivityAt)}` : ago(t.lastActivityAt)}
                  </Meta>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {closed.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            aria-expanded={showClosed}
            className="text-[13px] text-muted underline decoration-line underline-offset-[3px] transition-colors hover:text-text"
          >
            {showClosed
              ? "Hide finished"
              : `Show ${closed.length} finished`}
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
