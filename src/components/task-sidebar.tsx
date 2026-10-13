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
                  {t.subjects.length ? (
                    <>
                      {t.subjects.slice(0, 2).map((s) => (
                        <Link
                          key={s.id}
                          href={`/s/${s.slug}`}
                          title={
                            s.parentName
                              ? `${s.parentName} / ${s.name}`
                              : `Subject: ${s.name}`
                          }
                          className="inline-flex items-center gap-1 rounded-xs border border-line px-1.5 py-[1px] text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-text"
                        >
                          <Dot colour={s.colour} />
                          {s.name}
                        </Link>
                      ))}
                      {t.subjects.length > 2 && (
                        <Meta>+{t.subjects.length - 2} more</Meta>
                      )}
                    </>
                  ) : (
                    /* Say so rather than leave an empty gap. */
                    <Link
                      href={`/t/${t.id}/edit`}
                      title="Not linked to any subject — click to add one"
                      className="rounded-xs border border-dashed border-line px-1.5 py-[1px] text-[12.5px] text-faint transition-colors hover:border-line-strong hover:text-muted"
                    >
                      No subject
                    </Link>
                  )}

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
    </nav>
  );
}
