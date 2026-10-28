import Link from "next/link";

import { CaptureBox } from "@/components/capture-box";
import { FeedList } from "@/components/feed-list";
import { StatTiles } from "@/components/stat-tiles";
import { TaskSidebar } from "@/components/task-sidebar";
import { Empty, Meta, SectionLabel } from "@/components/ui";
import { feed } from "@/db/feed";
import { closedTasks, openTasks } from "@/db/queries";
import {
  activityByDay,
  dashboardStats,
  staleTasks,
  STALE_DAYS,
} from "@/db/stats";
import { ago } from "@/lib/utils";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ task?: string; view?: string }>;
}) {
  const { task: selectedTask, view } = await searchParams;

  const [tasks, finished, stats, activity, entries, stale] = await Promise.all([
    openTasks(),
    closedTasks(),
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
              <Link
                href="/"
                className="extlink text-[13px] text-muted hover:text-text"
              >
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

      {/*
        A column of tasks beside the log on desktop. On a phone there is no
        room beside anything, so the three parts stack — and the order matters
        more than it looks: the task list used to come last, below a whole
        screen of entries, which made changing task a scroll to the bottom and
        back. Capture stays first so a thought can be typed the moment the page
        opens; the tasks come next, where switching is one thumb away; the log
        follows, because reading it is what you do after choosing.

        A grid rather than flex ordering: capture and log share the right-hand
        column on desktop while the tasks span both rows, which flex can only
        express by nesting them — and nesting is what put the list last.
      */}
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <CaptureBox
            targets={tasks.map((t) => ({ id: t.id, title: t.title }))}
            defaultTargetId={selectedTask ?? tasks[0]?.id}
          />
        </div>

        <aside className="mb-9 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mb-0">
          <TaskSidebar
            tasks={tasks}
            closed={finished}
            selectedId={selectedTask}
          />
        </aside>

        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
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
            <p className="-mt-1 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                href={`/t/${selected.id}`}
                className="extlink text-[13px] text-text hover:opacity-80"
              >
                Open this task&rsquo;s own page ↗
              </Link>
              <Meta>
                where you can edit it, see its references, and attach files
              </Meta>
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
