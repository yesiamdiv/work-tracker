import Link from "next/link";

import type { Stats } from "@/db/stats";
import { STALE_DAYS } from "@/db/stats";
import { Spark } from "@/components/spark";
import { Meta } from "@/components/ui";

/**
 * A static row of tiles. It scrolls by hand on narrow screens and never moves
 * on its own: a dashboard has to be scannable, and a panel that rotates can't
 * be compared against the one beside it or found again afterwards.
 */

function Tile({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string | number;
  note?: string;
  href?: string;
}) {
  const inner = (
    <>
      <Meta className="block text-muted">{label}</Meta>
      <span className="mt-1 block text-[26px] leading-none text-text tnum">
        {value}
      </span>
      {note && <Meta className="mt-1.5 block truncate">{note}</Meta>}
    </>
  );

  const base =
    "block min-w-[9.5rem] shrink-0 rounded-xs border border-line px-4 py-3.5 sm:min-w-0 sm:flex-1";

  return href ? (
    <Link href={href} className={`rowlink ${base}`}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

export function StatTiles({
  stats,
  activity,
}: {
  stats: Stats;
  activity: { day: string; n: number }[];
}) {
  const delta = stats.entriesThisWeek - stats.entriesLastWeek;
  const trend =
    stats.entriesLastWeek === 0
      ? `${stats.entriesLastWeek} last week`
      : `${delta >= 0 ? "+" : ""}${delta} vs last week`;

  return (
    <div className="mb-8">
      <div className="flex gap-3 overflow-x-auto pb-1 sm:overflow-visible">
        <Tile label="Open tasks" value={stats.openTasks} />
        <Tile
          label="Entries this week"
          value={stats.entriesThisWeek}
          note={trend}
        />
        <Tile
          label={`Quiet ${STALE_DAYS}+ days`}
          value={stats.staleTasks}
          note={stats.staleTasks ? "needs a look" : "all current"}
          href={stats.staleTasks ? "/?view=stale" : undefined}
        />
        <Tile label="Bugs found (30d)" value={stats.bugsThisMonth} />
        <Tile
          label="Longest open"
          value={
            stats.longestRunningDays === null
              ? "—"
              : `${stats.longestRunningDays}d`
          }
          note={stats.longestRunningTitle ?? undefined}
        />
      </div>

      <div className="mt-3 rounded-xs border border-line px-4 py-3">
        <Meta className="text-muted">Activity, last 28 days</Meta>
        <Spark
          data={activity.map((a) => a.n)}
          height={22}
          fullWidth
          className="mt-2"
          label={`Entries per day over the last ${activity.length} days`}
        />
      </div>
    </div>
  );
}
