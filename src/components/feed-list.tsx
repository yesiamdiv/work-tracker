
import { FeedRow } from "@/components/feed-row";
import { Empty } from "@/components/ui";
import type { FeedEntry } from "@/db/feed";
import { byDay } from "@/lib/utils";

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
              <FeedRow key={e.id} entry={e} showTask={showTask} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
