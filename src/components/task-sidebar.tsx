import Link from "next/link";

import type { SubjectChip } from "@/db/queries";
import { STALE_DAYS } from "@/db/stats";
import { Dot, Meta } from "@/components/ui";
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
  selectedId,
}: {
  tasks: Task[];
  selectedId?: string;
}) {
  return (
    <nav aria-label="Your tasks">
      <div className="mb-3 flex items-baseline justify-between gap-3">
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

      {selectedId && (
        <Link
          href="/"
          className="extlink mb-2 block text-[13px] text-faint hover:text-muted"
        >
          ← Show everything
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
              <Link
                href={selected ? "/" : `/?task=${t.id}`}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "rowlink block rounded-xs border px-3 py-2.5",
                  selected
                    ? "border-line-strong bg-raised"
                    : "border-transparent",
                )}
              >
                <span
                  className={cn(
                    "block text-[14px] leading-snug",
                    selected ? "text-text" : "text-body",
                  )}
                >
                  {t.title}
                </span>

                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {t.subjects.slice(0, 2).map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1">
                      <Dot colour={s.colour} />
                      <Meta>{s.name}</Meta>
                    </span>
                  ))}
                  <Meta>· {t.eventCount}</Meta>
                  {/* Stale is stated in words — a dim dot would read as decoration. */}
                  <Meta className={stale ? "text-muted" : undefined}>
                    · {stale ? `quiet ${ago(t.lastActivityAt)}` : ago(t.lastActivityAt)}
                  </Meta>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
