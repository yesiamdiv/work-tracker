import { and, desc, eq, exists, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { withRetry } from "@/db/retry";
import { events, refs, subjects, taskSubjects, tasks } from "@/db/schema";
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

    return { entries: await attachSubjects(page), hasMore };
  });
}

/** Subject chips for a page of entries, in one query rather than per row. */
async function attachSubjects(
  rows: Omit<FeedEntry, "subjects">[],
): Promise<FeedEntry[]> {
  if (!rows.length) return [];

  const taskIds = [...new Set(rows.map((r) => r.taskId))];
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

  return rows.map((r) => ({ ...r, subjects: byTask.get(r.taskId) ?? [] }));
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
