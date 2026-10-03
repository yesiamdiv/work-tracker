import { and, count, eq, gte, isNull, lt, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { withRetry } from "@/db/retry";
import { events, subjects, taskSubjects, tasks } from "@/db/schema";

/** A task with no entries for this many days is considered stalled. */
export const STALE_DAYS = 7;

const CLOSED: (typeof tasks.status.enumValues)[number][] = ["done", "abandoned"];

export type Stats = {
  openTasks: number;
  staleTasks: number;
  entriesThisWeek: number;
  entriesLastWeek: number;
  bugsThisMonth: number;
  activeSubjects: number;
  longestRunningDays: number | null;
  longestRunningTitle: string | null;
};

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * The dashboard tiles, in one place.
 *
 * Every figure is a plain aggregate — no caching, because at one user's volume
 * these are milliseconds and a stale number on a dashboard is worse than a
 * slightly slower page.
 */
export async function dashboardStats(): Promise<Stats> {
  return withRetry("dashboardStats", async () => {
    const staleBefore = daysAgo(STALE_DAYS);
    const weekAgo = daysAgo(7);
    const twoWeeksAgo = daysAgo(14);
    const monthAgo = daysAgo(30);

    const [
      [open],
      [stale],
      [thisWeek],
      [lastWeek],
      [bugs],
      [active],
      [longest],
    ] = await Promise.all([
      db
        .select({ n: count() })
        .from(tasks)
        .where(notInArray(tasks.status, CLOSED)),

      db
        .select({ n: count() })
        .from(tasks)
        .where(
          and(
            notInArray(tasks.status, CLOSED),
            lt(tasks.lastActivityAt, staleBefore),
          ),
        ),

      db
        .select({ n: count() })
        .from(events)
        .where(gte(events.occurredAt, weekAgo)),

      db
        .select({ n: count() })
        .from(events)
        .where(
          and(
            gte(events.occurredAt, twoWeeksAgo),
            lt(events.occurredAt, weekAgo),
          ),
        ),

      db
        .select({ n: count() })
        .from(events)
        .where(
          and(eq(events.kind, "bug_found"), gte(events.occurredAt, monthAgo)),
        ),

      db
        .select({ n: count() })
        .from(subjects)
        .where(isNull(subjects.archivedAt)),

      // Oldest still-open task, by start date.
      db
        .select({
          title: tasks.title,
          days: sql<number>`extract(day from now() - "tasks"."started_at")`.mapWith(
            Number,
          ),
        })
        .from(tasks)
        .where(notInArray(tasks.status, CLOSED))
        .orderBy(tasks.startedAt)
        .limit(1),
    ]);

    return {
      openTasks: open?.n ?? 0,
      staleTasks: stale?.n ?? 0,
      entriesThisWeek: thisWeek?.n ?? 0,
      entriesLastWeek: lastWeek?.n ?? 0,
      bugsThisMonth: bugs?.n ?? 0,
      activeSubjects: active?.n ?? 0,
      longestRunningDays: longest?.days ?? null,
      longestRunningTitle: longest?.title ?? null,
    };
  });
}

/** Open tasks that have gone quiet, worst first — the one stat worth acting on. */
export async function staleTasks(limit = 8) {
  return withRetry("staleTasks", () =>
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        lastActivityAt: tasks.lastActivityAt,
      })
      .from(tasks)
      .where(
        and(
          notInArray(tasks.status, CLOSED),
          lt(tasks.lastActivityAt, daysAgo(STALE_DAYS)),
        ),
      )
      .orderBy(tasks.lastActivityAt)
      .limit(limit),
  );
}

/** Entry counts per day for the last `days` days, oldest first — the sparkline. */
export async function activityByDay(days = 28) {
  return withRetry("activityByDay", async () => {
    const rows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', "events"."occurred_at"), 'YYYY-MM-DD')`,
        n: count(),
      })
      .from(events)
      .where(gte(events.occurredAt, daysAgo(days)))
      .groupBy(sql`date_trunc('day', "events"."occurred_at")`)
      .orderBy(sql`date_trunc('day', "events"."occurred_at")`);

    // Fill the gaps, so the sparkline shows quiet days rather than skipping them.
    const byDay = new Map(rows.map((r) => [r.day, Number(r.n)]));
    const out: { day: string; n: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = daysAgo(i).toISOString().slice(0, 10);
      out.push({ day: d, n: byDay.get(d) ?? 0 });
    }
    return out;
  });
}

/** Breakdown of entry kinds over a window, for the stats page. */
export async function kindBreakdown(days = 30) {
  return withRetry("kindBreakdown", () =>
    db
      .select({ kind: events.kind, n: count() })
      .from(events)
      .where(gte(events.occurredAt, daysAgo(days)))
      .groupBy(events.kind)
      .orderBy(sql`count(*) desc`),
  );
}

/**
 * Entries per week per subject, for the sparkline on the subjects browser.
 *
 * Counts are attributed to the subject a task is tagged with, then rolled up
 * into parents in JS — a parent's line has to include its children's work, and
 * doing that in SQL would need a self-join per row for no benefit.
 */
export async function subjectWeeklyActivity(weeks = 12) {
  return withRetry("subjectWeeklyActivity", async () => {
    const since = daysAgo(weeks * 7);

    const [rows, parents] = await Promise.all([
      db
        .select({
          subjectId: taskSubjects.subjectId,
          week: sql<string>`to_char(date_trunc('week', "events"."occurred_at"), 'YYYY-MM-DD')`,
          n: count(),
        })
        .from(events)
        .innerJoin(taskSubjects, eq(taskSubjects.taskId, events.taskId))
        .where(gte(events.occurredAt, since))
        .groupBy(taskSubjects.subjectId, sql`date_trunc('week', "events"."occurred_at")`),
      db
        .select({ id: subjects.id, parentId: subjects.parentId })
        .from(subjects),
    ]);

    // The week buckets, oldest first, so every subject's series lines up.
    const buckets: string[] = [];
    const monday = (d: Date) => {
      const x = new Date(d);
      const day = (x.getDay() + 6) % 7; // Monday = 0
      x.setDate(x.getDate() - day);
      return x.toISOString().slice(0, 10);
    };
    for (let i = weeks - 1; i >= 0; i--) buckets.push(monday(daysAgo(i * 7)));

    const index = new Map(buckets.map((b, i) => [b, i]));
    const series = new Map<string, number[]>();
    const blank = () => new Array(buckets.length).fill(0) as number[];

    for (const s of parents) series.set(s.id, blank());

    for (const r of rows) {
      const at = index.get(r.week);
      if (at === undefined) continue;
      const own = series.get(r.subjectId);
      if (own) own[at] += Number(r.n);
    }

    // Roll children into their parents.
    for (const s of parents) {
      if (!s.parentId) continue;
      const child = series.get(s.id);
      const parent = series.get(s.parentId);
      if (child && parent) {
        for (let i = 0; i < parent.length; i++) parent[i] += child[i];
      }
    }

    return { weeks: buckets, series };
  });
}
