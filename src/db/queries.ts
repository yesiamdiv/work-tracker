import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { events, refs, subjects, taskSubjects, tasks } from "@/db/schema";
import { withRetry } from "@/db/retry";
import { subjectFilterIds } from "@/lib/subjects";

/**
 * Correlated subqueries are written with literal, fully-qualified table names
 * rather than `${table}` / `${table.column}` interpolation.
 *
 * Drizzle only table-qualifies an interpolated column when the surrounding
 * query has a join. In a single-table query it emits
 * `… from "events" where "task_id" = "id"`, where both names bind to the
 * subquery's own table — so the correlation silently compares
 * `events.task_id = events.id` and every count comes back 0.
 */
const EVENT_COUNT = sql<number>`(
  select count(*) from "events" e where e."task_id" = "tasks"."id"
)`.mapWith(Number);

/** Open tasks, most recently touched first — the Today page's spine. */
export async function openTasks() {
  return withRetry("openTasks", async () => {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      type: tasks.type,
      status: tasks.status,
      priority: tasks.priority,
      lastActivityAt: tasks.lastActivityAt,
      startedAt: tasks.startedAt,
      eventCount: EVENT_COUNT,
    })
    .from(tasks)
    .where(and(ne(tasks.status, "done"), ne(tasks.status, "abandoned")))
    .orderBy(desc(tasks.priority), desc(tasks.lastActivityAt));

  return attachSubjects(rows);
  });
}

/** Subject chips for a set of tasks, in one query rather than N. */
async function attachSubjects<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return [] as (T & { subjects: SubjectChip[] })[];

  const links = await db
    .select({
      taskId: taskSubjects.taskId,
      isPrimary: taskSubjects.isPrimary,
      id: subjects.id,
      name: subjects.name,
      slug: subjects.slug,
      colour: subjects.colour,
      parentName: sql<string | null>`(
        select p.name from "subjects" p where p.id = "subjects"."parent_id"
      )`,
    })
    .from(taskSubjects)
    .innerJoin(subjects, eq(subjects.id, taskSubjects.subjectId))
    .where(
      inArray(
        taskSubjects.taskId,
        rows.map((r) => r.id),
      ),
    );

  const byTask = new Map<string, SubjectChip[]>();
  for (const l of links) {
    const list = byTask.get(l.taskId) ?? [];
    list.push(l);
    byTask.set(l.taskId, list);
  }

  return rows.map((r) => ({
    ...r,
    subjects: (byTask.get(r.id) ?? []).sort(
      (a, b) => b.isPrimary - a.isPrimary,
    ),
  }));
}

export type SubjectChip = {
  id: string;
  name: string;
  slug: string;
  colour: string;
  isPrimary: number;
  parentName: string | null;
};

export async function taskDetail(taskId: string) {
  return withRetry("taskDetail", async () => {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return null;

  const [stream, taskRefs, linked] = await Promise.all([
    db
      .select()
      .from(events)
      .where(eq(events.taskId, taskId))
      .orderBy(events.occurredAt),
    db.select().from(refs).where(eq(refs.taskId, taskId)),
    db
      .select({
        id: subjects.id,
        name: subjects.name,
        slug: subjects.slug,
        colour: subjects.colour,
        isPrimary: taskSubjects.isPrimary,
      })
      .from(taskSubjects)
      .innerJoin(subjects, eq(subjects.id, taskSubjects.subjectId))
      .where(eq(taskSubjects.taskId, taskId)),
  ]);

  // Refs recorded against an event are shown inline with it, not in the header.
  const refsByEvent = new Map<string, typeof taskRefs>();
  for (const r of taskRefs) {
    if (!r.eventId) continue;
    const list = refsByEvent.get(r.eventId) ?? [];
    list.push(r);
    refsByEvent.set(r.eventId, list);
  }

  return {
    task,
    subjects: linked.sort((a, b) => b.isPrimary - a.isPrimary),
    events: stream.map((e) => ({ ...e, refs: refsByEvent.get(e.id) ?? [] })),
    taskRefs: taskRefs.filter((r) => !r.eventId),
  };
  });
}

/** All subjects with counts, flat — `nest()` gives it the two-level shape. */
export async function subjectList() {
  return withRetry("subjectList", () =>
    db
    .select({
      id: subjects.id,
      name: subjects.name,
      slug: subjects.slug,
      kind: subjects.kind,
      status: subjects.status,
      colour: subjects.colour,
      parentId: subjects.parentId,
      /**
       * Rolls up children, so a parent's count matches what opening it shows.
       * `sc` is the subject a task is tagged with: either this row, or a child
       * of it.
       */
      openTasks: sql<number>`(
        select count(distinct t.id) from "task_subjects" ts
        join "tasks" t on t.id = ts.task_id
        join "subjects" sc on sc.id = ts.subject_id
        where (sc.id = "subjects"."id" or sc.parent_id = "subjects"."id")
          and t.status not in ('done', 'abandoned')
      )`.mapWith(Number),
      lastActivityAt: sql<string | null>`(
        select max(t.last_activity_at) from "task_subjects" ts
        join "tasks" t on t.id = ts.task_id
        join "subjects" sc on sc.id = ts.subject_id
        where sc.id = "subjects"."id" or sc.parent_id = "subjects"."id"
      )`,
    })
      .from(subjects)
      .where(isNull(subjects.archivedAt))
      .orderBy(subjects.name),
  );
}

export async function subjectBySlug(slug: string) {
  return withRetry("subjectBySlug", async () => {
  const [subject] = await db
    .select()
    .from(subjects)
    .where(eq(subjects.slug, slug))
    .limit(1);
  return subject ?? null;
  });
}

/**
 * Tasks for a subject, including its children by default — filtering by a
 * parent must surface everything beneath it.
 */
export async function subjectTasks(subjectId: string, includeChildren = true) {
  return withRetry("subjectTasks", async () => {
  const ids = includeChildren
    ? await subjectFilterIds(subjectId)
    : [subjectId];

  const rows = await db
    .selectDistinct({
      id: tasks.id,
      title: tasks.title,
      type: tasks.type,
      status: tasks.status,
      priority: tasks.priority,
      lastActivityAt: tasks.lastActivityAt,
      startedAt: tasks.startedAt,
      closedAt: tasks.closedAt,
      eventCount: EVENT_COUNT,
    })
    .from(tasks)
    .innerJoin(taskSubjects, eq(taskSubjects.taskId, tasks.id))
    .where(inArray(taskSubjects.subjectId, ids))
    .orderBy(desc(tasks.lastActivityAt));

  return attachSubjects(rows);
  });
}

/** Every ref ever attached to a subject, via its tasks and their events. */
export async function subjectRefs(subjectId: string) {
  return withRetry("subjectRefs", async () => {
  const ids = await subjectFilterIds(subjectId);
  return db
    .selectDistinct({
      id: refs.id,
      kind: refs.kind,
      url: refs.url,
      label: refs.label,
      externalKey: refs.externalKey,
      taskId: refs.taskId,
      createdAt: refs.createdAt,
    })
    .from(refs)
    .innerJoin(taskSubjects, eq(taskSubjects.taskId, refs.taskId))
    .where(inArray(taskSubjects.subjectId, ids))
    .orderBy(desc(refs.createdAt));
  });
}
