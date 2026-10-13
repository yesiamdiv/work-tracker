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

export type FeedFilters = {
  /** Free text over the entry body. */
  q?: string;
  /** A subject; its children are included automatically. */
  subjectId?: string;
  taskId?: string;
  kind?: (typeof events.kind.enumValues)[number];
  outcome?: (typeof events.outcome.enumValues)[number];
  /** Only entries that carry at least one external link. */
  withRefs?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
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

    if (filters.taskId) where.push(eq(events.taskId, filters.taskId));
    if (filters.kind) where.push(eq(events.kind, filters.kind));
    if (filters.outcome) where.push(eq(events.outcome, filters.outcome));
    if (filters.from) where.push(gte(events.occurredAt, filters.from));
    if (filters.to) where.push(lte(events.occurredAt, filters.to));

    if (filters.subjectId) {
      // Parent subjects include their children.
      const ids = await subjectFilterIds(filters.subjectId);
      where.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(taskSubjects)
            .where(
              and(
                eq(taskSubjects.taskId, events.taskId),
                inArray(taskSubjects.subjectId, ids),
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
  rows: Omit<FeedEntry, "subjects" | "attachments">[],
): Promise<FeedEntry[]> {
  if (!rows.length) return [];

  const taskIds = [...new Set(rows.map((r) => r.taskId))];
  const eventIds = rows.map((r) => r.id);

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
