import Link from "next/link";

import { CaptureBox } from "@/components/capture-box";
import { FeedList } from "@/components/feed-list";
import { StatTiles } from "@/components/stat-tiles";
import { TaskSidebar } from "@/components/task-sidebar";
import { Empty, Meta, SectionLabel } from "@/components/ui";
import { feed } from "@/db/feed";
import { openTasks } from "@/db/queries";
import { activityByDay, dashboardStats, staleTasks, STALE_DAYS } from "@/db/stats";
import { ago } from "@/lib/utils";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ task?: string; view?: string }>;
}) {
  const { task: selectedTask, view } = await searchParams;

  const [tasks, stats, activity, entries, stale] = await Promise.all([
    openTasks(),
    dashboardStats(),
    activityByDay(28),
    feed({ taskId: selectedTask, limit: 25 }),
    view === "stale" ? staleTasks() : Promise.resolve([]),
  ]);

  const selected = tasks.find((t) => t.id === selectedTask);

  return (
    <>
      <StatTiles stats={stats} activity={activity} />

      {view === "stale" && (
        <section className="mb-8 rounded-xs border border-line p-4">
          <SectionLabel
            hint={`Open tasks with no entries for ${STALE_DAYS} days or more, longest-quiet first.`}
            right={
              <Link href="/" className="extlink text-[13px] text-muted hover:text-text">
                Close
              </Link>
            }
          >
            Gone quiet
          </SectionLabel>
          {stale.length ? (
            <ul className="divide-y divide-line rounded-xs border border-line">
              {stale.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/t/${t.id}`}
                    className="rowlink flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-body">
                      {t.title}
                    </span>
                    <Meta className="shrink-0">
                      quiet {ago(t.lastActivityAt)}
                    </Meta>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing has gone quiet.</Empty>
          )}
        </section>
      )}

      {/* Sidebar beside the log on desktop; stacked on a phone, capture first. */}
      <div className="flex flex-col gap-9 lg:flex-row lg:gap-10">
        <aside className="order-2 lg:order-1 lg:w-64 lg:shrink-0">
          <TaskSidebar tasks={tasks} selectedId={selectedTask} />
        </aside>

        <div className="order-1 min-w-0 flex-1 lg:order-2">
          <CaptureBox
            targets={tasks.map((t) => ({ id: t.id, title: t.title }))}
            defaultTargetId={selectedTask ?? tasks[0]?.id}
          />

          <SectionLabel
            hint={
              selected
                ? undefined
                : "Everything you have logged, newest first, across all tasks."
            }
            right={
              <Link
                href="/stream"
                className="extlink text-[13px] text-muted hover:text-text"
              >
                Search &amp; filter
              </Link>
            }
          >
            {selected ? selected.title : "Recent activity"}
          </SectionLabel>

          {selected && (
            <p className="-mt-1 mb-3">
              <Link
                href={`/t/${selected.id}`}
                className="extlink text-[13px] text-muted hover:text-text"
              >
                Open this task in full
              </Link>
            </p>
          )}

          <FeedList
            entries={entries.entries}
            showTask={!selected}
            empty={
              selected
                ? "No entries on this task yet. Add the first one above."
                : "Nothing logged yet. Type above to make a start."
            }
          />

          {entries.hasMore && (
            <p className="mt-4">
              <Link
                href={selected ? `/stream?task=${selected.id}` : "/stream"}
                className="extlink text-[13px] text-muted hover:text-text"
              >
                See all entries
              </Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
