import Link from "next/link";

import type { FeedEntry } from "@/db/feed";
import { KIND_LABEL } from "@/lib/capture";
import { Dot, Empty, Meta } from "@/components/ui";
import { byDay, timeLabel } from "@/lib/utils";

/**
 * The shared entry feed — used on the dashboard unfiltered, and on the Stream
 * page with filters applied. Grouped by day, newest first.
 */
export function FeedList({
  entries,
  showTask = true,
  empty = "Nothing logged yet.",
}: {
  entries: FeedEntry[];
  showTask?: boolean;
  empty?: string;
}) {
  if (!entries.length) return <Empty>{empty}</Empty>;

  const days = byDay(entries, (e) => e.occurredAt);

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <section key={day.label}>
          <h3 className="mb-2 text-[13px] text-muted">{day.label}</h3>
          <div className="divide-y divide-line rounded-xs border border-line">
            {day.rows.map((e) => (
              <Row key={e.id} entry={e} showTask={showTask} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({ entry, showTask }: { entry: FeedEntry; showTask: boolean }) {
  const failed = entry.outcome === "fail";

  return (
    <article className="px-4 py-3.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Meta className="text-muted">{timeLabel(entry.occurredAt)}</Meta>
        <span aria-hidden className="h-3 w-px bg-line" />
        <Meta className="text-muted">{KIND_LABEL[entry.kind]}</Meta>
        {entry.outcome && (
          <>
            <span aria-hidden className="h-3 w-px bg-line" />
            <Meta className={failed ? "text-text" : "text-muted"}>
              {entry.outcome}
            </Meta>
          </>
        )}
        {entry.refCount > 0 && (
          <>
            <span aria-hidden className="h-3 w-px bg-line" />
            <Meta>
              {entry.refCount} link{entry.refCount > 1 ? "s" : ""}
            </Meta>
          </>
        )}
      </div>

      <div className={failed ? "border-l border-line-strong pl-3" : ""}>
        <p className="whitespace-pre-wrap break-words text-body">{entry.body}</p>
      </div>

      {showTask && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/t/${entry.taskId}`}
            className="extlink text-[13px] text-muted hover:text-text"
          >
            {entry.taskTitle}
          </Link>
          {entry.subjects.map((s) => (
            <span key={s.slug} className="inline-flex items-center gap-1.5">
              <Dot colour={s.colour} />
              <Meta>{s.parentName ? `${s.parentName} / ${s.name}` : s.name}</Meta>
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
