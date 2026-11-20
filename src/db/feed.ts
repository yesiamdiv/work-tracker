import { and, desc, eq, exists, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { withRetry } from "@/db/retry";
import {
  attachments,
  events,
  refs,
  subjects,
  taskSubjects,
  tasks,
} from "@/db/schema";
import { subjectFilterIds } from "@/lib/subjects";
import { APP_TZ } from "@/lib/time";

export type FeedFilters = {
  /** Free text over the entry body. */
  q?: string;
  /**
   * Subjects; each one's children are included automatically, and several are
   * a union — "anything touching Acaas or Billing", which is how the work
   * actually divides up.
   */
  subjectIds?: string[];
  /** Tasks, as a union. */
  taskIds?: string[];
  kinds?: (typeof events.kind.enumValues)[number][];
  outcomes?: (typeof events.outcome.enumValues)[number][];
  /** Only entries that carry at least one external link. */
  withRefs?: boolean;
  /** Absolute instants. The callers build these from a date in {@link APP_TZ}. */
  from?: Date;
  to?: Date;
  /**
   * A window on the wall clock, `HH:MM`, applied to every day in range — so
   * "the morning runs, over the last fortnight" is one query. Read in
   * {@link APP_TZ}, because a time of day has no meaning without a zone.
   *
   * A window where the end is earlier than the start wraps midnight, which is
   * what someone asking for 22:00–06:00 means.
   */
  clockFrom?: string;
  clockTo?: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. Empty or all seven means no filter. */
  daysOfWeek?: number[];
  limit?: number;
  offset?: number;
  /** Convenience for the callers that only ever want one. */
  subjectId?: string;
  taskId?: string;
  kind?: (typeof events.kind.enumValues)[number];
  outcome?: (typeof events.outcome.enumValues)[number];
};

export type FeedEntry = {
  id: string;
  taskId: string;
  taskTitle: string;
  kind: (typeof events.kind.enumValues)[number];
  outcome: (typeof events.outcome.enumValues)[number] | null;
  body: string;
  occurredAt: Date;
  refCount: number;
  subjects: { name: string; slug: string; colour: string; parentName: string | null }[];
  /** The links found in this entry, so a question can be answered about them. */
  refs: {
    kind: string;
    externalKey: string | null;
    label: string | null;
    url: string;
  }[];
  /** Files on this entry, so the feed can show them without opening the task. */
  attachments: {
    id: string;
    name: string;
    mime: string | null;
    size: number | null;
    driveFileId: string;
    webViewLink: string | null;
  }[];
};

/**
 * The one query behind both the dashboard feed and the Stream page.
 *
 * Every filter is optional and they compose, so the dashboard is simply this
 * with no filters and a small limit.
 */
export async function feed(filters: FeedFilters = {}) {
  const limit = Math.min(filters.limit ?? 30, 200);

  return withRetry("feed", async () => {
    const where: (SQL | undefined)[] = [];

    if (filters.q?.trim()) {
      // ILIKE rather than full-text search: it matches partial words, which is
      // what you want when hunting for "provision" or a half-remembered build
      // number. At one person's volume the scan cost is irrelevant.
      const term = `%${filters.q.trim()}%`;
      where.push(or(ilike(events.body, term), ilike(tasks.title, term)));
    }

    // The singular forms are the same filter with one value in it.
    const taskIds = [
      ...new Set([...(filters.taskIds ?? []), filters.taskId].filter(Boolean)),
    ] as string[];
    const kinds = [
      ...new Set([...(filters.kinds ?? []), filters.kind].filter(Boolean)),
    ] as NonNullable<FeedFilters["kinds"]>;
    const outcomes = [
      ...new Set([...(filters.outcomes ?? []), filters.outcome].filter(Boolean)),
    ] as NonNullable<FeedFilters["outcomes"]>;
    const subjectIds = [
      ...new Set([...(filters.subjectIds ?? []), filters.subjectId].filter(Boolean)),
    ] as string[];

    if (taskIds.length) where.push(inArray(events.taskId, taskIds));
    if (kinds.length) where.push(inArray(events.kind, kinds));
    if (outcomes.length) where.push(inArray(events.outcome, outcomes));
    if (filters.from) where.push(gte(events.occurredAt, filters.from));
    if (filters.to) where.push(lte(events.occurredAt, filters.to));

    /*
     * The wall clock, in the app's zone.
     *
     * `AT TIME ZONE` turns the stored instant into the local reading, and the
     * cast drops the date so only the time of day is compared. Neither can use
     * the index on occurred_at, which is why the date range is kept as a plain
     * comparison above: that one narrows, these two sieve what is left.
     */
    const localTime = sql`(${events.occurredAt} AT TIME ZONE ${APP_TZ})::time`;
    const { clockFrom, clockTo } = filters;
    if (clockFrom && clockTo) {
      where.push(
        clockFrom <= clockTo
          ? and(
              sql`${localTime} >= ${clockFrom}::time`,
              sql`${localTime} <= ${clockTo}::time`,
            )
          : // Wraps midnight: late evening or early morning, not neither.
            or(
              sql`${localTime} >= ${clockFrom}::time`,
              sql`${localTime} <= ${clockTo}::time`,
            ),
      );
    } else if (clockFrom) {
      where.push(sql`${localTime} >= ${clockFrom}::time`);
    } else if (clockTo) {
      where.push(sql`${localTime} <= ${clockTo}::time`);
    }

    const dows = filters.daysOfWeek?.filter((d) => d >= 1 && d <= 7) ?? [];
    if (dows.length && dows.length < 7) {
      where.push(
        inArray(
          sql`extract(isodow from ${events.occurredAt} AT TIME ZONE ${APP_TZ})::int`,
          dows,
        ),
      );
    }

    if (subjectIds.length) {
      // Parent subjects include their children, and several subjects union.
      const expanded = [
        ...new Set(
          (await Promise.all(subjectIds.map((id) => subjectFilterIds(id)))).flat(),
        ),
      ];
      where.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(taskSubjects)
            .where(
              and(
                eq(taskSubjects.taskId, events.taskId),
                inArray(taskSubjects.subjectId, expanded),
              ),
            ),
        ),
      );
    }

    if (filters.withRefs) {
      where.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(refs)
            .where(eq(refs.eventId, events.id)),
        ),
      );
    }

    const rows = await db
      .select({
        id: events.id,
        taskId: events.taskId,
        taskTitle: tasks.title,
        kind: events.kind,
        outcome: events.outcome,
        body: events.body,
        occurredAt: events.occurredAt,
        refCount: sql<number>`(
          select count(*) from "refs" r where r."event_id" = "events"."id"
        )`.mapWith(Number),
      })
      .from(events)
      .innerJoin(tasks, eq(tasks.id, events.taskId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(events.occurredAt))
      .limit(limit + 1)
      .offset(filters.offset ?? 0);

    // One extra row tells us whether another page exists, without a count(*).
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return { entries: await hydrate(page), hasMore };
  });
}

/**
 * Subject chips and attachments for a page of entries — two queries for the
 * whole page rather than two per row.
 */
async function hydrate(
  rows: Omit<FeedEntry, "subjects" | "attachments" | "refs">[],
): Promise<FeedEntry[]> {
  if (!rows.length) return [];

  const taskIds = [...new Set(rows.map((r) => r.taskId))];
  const eventIds = rows.map((r) => r.id);

  const entryLinks = await db
    .select({
      eventId: refs.eventId,
      kind: refs.kind,
      externalKey: refs.externalKey,
      label: refs.label,
      url: refs.url,
    })
    .from(refs)
    .where(inArray(refs.eventId, eventIds));

  const refsByEvent = new Map<string, FeedEntry["refs"]>();
  for (const l of entryLinks) {
    if (!l.eventId) continue;
    const list = refsByEvent.get(l.eventId) ?? [];
    list.push(l);
    refsByEvent.set(l.eventId, list);
  }

  const files = await db
    .select({
      id: attachments.id,
      eventId: attachments.eventId,
      name: attachments.name,
      mime: attachments.mime,
      size: attachments.size,
      driveFileId: attachments.driveFileId,
      webViewLink: attachments.webViewLink,
    })
    .from(attachments)
    .where(inArray(attachments.eventId, eventIds));

  const byEvent = new Map<string, FeedEntry["attachments"]>();
  for (const f of files) {
    const list = byEvent.get(f.eventId) ?? [];
    list.push(f);
    byEvent.set(f.eventId, list);
  }

  const links = await db
    .select({
      taskId: taskSubjects.taskId,
      name: subjects.name,
      slug: subjects.slug,
      colour: subjects.colour,
      parentName: sql<string | null>`(
        select p.name from "subjects" p where p.id = "subjects"."parent_id"
      )`,
    })
    .from(taskSubjects)
    .innerJoin(subjects, eq(subjects.id, taskSubjects.subjectId))
    .where(inArray(taskSubjects.taskId, taskIds));

  const byTask = new Map<string, FeedEntry["subjects"]>();
  for (const l of links) {
    const list = byTask.get(l.taskId) ?? [];
    list.push(l);
    byTask.set(l.taskId, list);
  }

  return rows.map((r) => ({
    ...r,
    subjects: byTask.get(r.taskId) ?? [],
    attachments: byEvent.get(r.id) ?? [],
    refs: refsByEvent.get(r.id) ?? [],
  }));
}

/** Subjects for the filter dropdown, as "Parent / Child" labels. */
export async function subjectOptions() {
  return withRetry("subjectOptions", async () => {
    const rows = await db
      .select({
        id: subjects.id,
        name: subjects.name,
        parentId: subjects.parentId,
        parentName: sql<string | null>`(
          select p.name from "subjects" p where p.id = "subjects"."parent_id"
        )`,
      })
      .from(subjects)
      .orderBy(subjects.name);

    return rows.map((r) => ({
      id: r.id,
      label: r.parentName ? `${r.parentName} / ${r.name}` : r.name,
    }));
  });
}

/**
 * Tasks for the filter picker, open ones first.
 *
 * The task filter existed in the query and in the URL but never in the UI: the
 * only way to reach it was to click through from a task row, so "these two
 * tasks, last Tuesday afternoon" could not be asked at all.
 */
export async function taskOptions() {
  return withRetry("taskOptions", async () => {
    const rows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        lastActivityAt: tasks.lastActivityAt,
      })
      .from(tasks)
      .orderBy(desc(tasks.lastActivityAt))
      .limit(300);

    // "done" and "abandoned" are the two that have stopped; the rest are live.
    const isClosed = (s: (typeof rows)[number]["status"]) =>
      s === "done" || s === "abandoned";
    return [...rows.filter((r) => !isClosed(r.status)), ...rows.filter((r) => isClosed(r.status))].map(
      // `muted` is what the picker calls a row it should dim and sort last.
      (r) => ({ id: r.id, label: r.title, muted: isClosed(r.status) }),
    );
  });
}
