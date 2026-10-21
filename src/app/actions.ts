"use server";

import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  events,
  refs,
  subjects,
  taggables,
  tags,
  taskSubjects,
  tasks,
} from "@/db/schema";
import { parseCapture } from "@/lib/capture";
import { getSession } from "@/lib/session";
import { slugify } from "@/lib/subjects";

/** Every action starts here. A single-user app still shouldn't take writes cold. */
async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  return session.email;
}

/* -------------------------------------------------------------- subjects --- */

const subjectInput = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(subjects.kind.enumValues),
  parentId: z.string().uuid().nullable().optional(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function createSubject(raw: z.input<typeof subjectInput>) {
  await requireUser();
  const input = subjectInput.parse(raw);

  // Depth cap: a child may not itself become a parent. Enforced here rather
  // than as a CHECK, which would need a trigger.
  if (input.parentId) {
    const [parent] = await db
      .select({ parentId: subjects.parentId })
      .from(subjects)
      .where(eq(subjects.id, input.parentId))
      .limit(1);
    if (!parent) throw new Error("Parent subject not found");
    if (parent.parentId) {
      throw new Error("Subjects nest two levels only — pick a top-level parent");
    }
  }

  const [row] = await db
    .insert(subjects)
    .values({
      name: input.name,
      slug: await uniqueSlug(slugify(input.name)),
      kind: input.kind,
      parentId: input.parentId ?? null,
      colour: input.colour ?? "#6b6b6b",
      description: input.description ?? null,
    })
    .returning();

  revalidatePath("/subjects");
  return row;
}

async function uniqueSlug(base: string): Promise<string> {
  const existing = await db
    .select({ slug: subjects.slug })
    .from(subjects)
    .where(sql`${subjects.slug} = ${base} or ${subjects.slug} like ${base + "-%"}`);
  if (!existing.some((r) => r.slug === base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!existing.some((r) => r.slug === candidate)) return candidate;
  }
}

/* ----------------------------------------------------------------- tasks --- */

const taskInput = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(tasks.type.enumValues).optional(),
  status: z.enum(tasks.status.enumValues).optional(),
  subjectIds: z.array(z.string().uuid()).optional(),
  description: z.string().max(4000).nullable().optional(),
});

export async function createTask(raw: z.input<typeof taskInput>) {
  await requireUser();
  const input = taskInput.parse(raw);

  const [task] = await db
    .insert(tasks)
    .values({
      title: input.title,
      type: input.type ?? "manual_test",
      status: input.status ?? "in_progress",
      description: input.description ?? null,
    })
    .returning();

  // Zero subjects is allowed on purpose — capture must never block on filing.
  if (input.subjectIds?.length) {
    await db.insert(taskSubjects).values(
      input.subjectIds.map((subjectId, i) => ({
        taskId: task.id,
        subjectId,
        isPrimary: i === 0 ? 1 : 0,
      })),
    );
  }

  revalidatePath("/");
  return task;
}

export async function setTaskStatus(
  taskId: string,
  status: (typeof tasks.status.enumValues)[number],
) {
  await requireUser();
  const closed = status === "done" || status === "abandoned";
  await db
    .update(tasks)
    .set({ status, closedAt: closed ? new Date() : null })
    .where(eq(tasks.id, taskId));
  revalidatePath("/");
  revalidatePath(`/t/${taskId}`);
}

export async function setTaskSubjects(taskId: string, subjectIds: string[]) {
  await requireUser();
  await db.delete(taskSubjects).where(eq(taskSubjects.taskId, taskId));
  if (subjectIds.length) {
    await db.insert(taskSubjects).values(
      subjectIds.map((subjectId, i) => ({
        taskId,
        subjectId,
        isPrimary: i === 0 ? 1 : 0,
      })),
    );
  }
  revalidatePath(`/t/${taskId}`);
}

/* ---------------------------------------------------------------- events --- */

/**
 * The hot path. One line of text in, one event plus its refs and tags out.
 *
 * Deliberately forgiving: a bare body with no markers is a valid note. Nothing
 * here can fail in a way that loses what was typed.
 */
export async function captureEvent(input: {
  taskId: string;
  text: string;
  occurredAt?: Date;
  /** Override the kind the text would imply — used when a caller already knows. */
  kind?: (typeof events.kind.enumValues)[number];
  outcome?: (typeof events.outcome.enumValues)[number] | null;
}) {
  await requireUser();

  const text = input.text.trim();
  if (!text) return null;

  const parsed = parseCapture(text);
  if (!parsed.body) return null;

  /*
   * Saving the same thing twice returns the first one instead of duplicating.
   *
   * A real pair of byte-identical multi-line entries appeared on one task four
   * minutes apart, so whatever prompted the second submit — a save that did not
   * look like it had landed, a double tap, a resubmitted form — the write has
   * to be idempotent rather than trusting the UI to prevent it. Logging the
   * same line twice within the window is, for a work log, always a mistake.
   *
   * Not a unique index: the same line genuinely can recur days later, so this
   * is bounded by time rather than forbidden outright.
   */
  const DEDUPE_WINDOW_MINUTES = 10;
  const [existing] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.taskId, input.taskId),
        eq(events.body, parsed.body),
        gte(
          events.createdAt,
          new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60_000),
        ),
      ),
    )
    .limit(1);

  if (existing) {
    console.warn(
      `[capture] identical entry saved ${Math.round((Date.now() - existing.createdAt.getTime()) / 1000)}s ago on this task; returning it rather than duplicating`,
    );
    return existing;
  }

  const [event] = await db
    .insert(events)
    .values({
      taskId: input.taskId,
      kind: input.kind ?? parsed.kind,
      outcome: input.outcome ?? parsed.outcome,
      body: parsed.body,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning();

  if (parsed.refs.length) {
    await db.insert(refs).values(
      parsed.refs.map((r) => ({
        eventId: event.id,
        taskId: input.taskId,
        kind: r.kind,
        url: r.url,
        label: r.label,
        externalKey: r.externalKey,
      })),
    );
  }

  if (parsed.tags.length) await attachTags(event.id, "event", parsed.tags);

  // Denormalised so "recently touched" ordering costs nothing to read.
  await db
    .update(tasks)
    .set({ lastActivityAt: new Date(), summary: null, summaryAt: null })
    .where(eq(tasks.id, input.taskId));

  revalidatePath("/");
  revalidatePath(`/t/${input.taskId}`);
  return event;
}

/**
 * Edits an entry.
 *
 * The body is re-parsed and its links re-extracted, so deleting a URL from the
 * text removes the reference too — otherwise an edit could leave a reference
 * pointing at something the entry no longer mentions. Shorthand markers are
 * honoured again as well, unless `kind`/`outcome` are given explicitly.
 */
export async function updateEvent(input: {
  eventId: string;
  body: string;
  kind?: (typeof events.kind.enumValues)[number];
  outcome?: (typeof events.outcome.enumValues)[number] | null;
  occurredAt?: Date;
}) {
  await requireUser();

  const raw = input.body.trim();
  if (!raw) throw new Error("An entry cannot be empty.");

  const parsed = parseCapture(raw);
  if (!parsed.body) throw new Error("An entry cannot be empty.");

  const [event] = await db
    .update(events)
    .set({
      body: parsed.body,
      kind: input.kind ?? parsed.kind,
      // `null` is a deliberate clear; `undefined` means fall back to the text.
      outcome: input.outcome !== undefined ? input.outcome : parsed.outcome,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(events.id, input.eventId))
    .returning({ taskId: events.taskId });

  if (!event) throw new Error("That entry no longer exists.");

  // Re-sync this entry's own references. Task- and subject-level refs are left
  // alone: they were not derived from this text.
  await db.delete(refs).where(eq(refs.eventId, input.eventId));
  if (parsed.refs.length) {
    await db.insert(refs).values(
      parsed.refs.map((r) => ({
        eventId: input.eventId,
        taskId: event.taskId,
        kind: r.kind,
        url: r.url,
        label: r.label,
        externalKey: r.externalKey,
      })),
    );
  }

  revalidatePath(`/t/${event.taskId}`);
  revalidatePath("/");
  revalidatePath("/stream");
}

/** Kept for callers that only have new text. */
export async function updateEventBody(eventId: string, body: string) {
  return updateEvent({ eventId, body });
}

/* ----------------------------------------------------------- task edits --- */

export async function updateTask(input: {
  taskId: string;
  title: string;
  type: (typeof tasks.type.enumValues)[number];
  status: (typeof tasks.status.enumValues)[number];
  description?: string | null;
  subjectIds?: string[];
}) {
  await requireUser();

  const title = input.title.trim();
  if (!title) throw new Error("A task needs a title.");

  const closed = input.status === "done" || input.status === "abandoned";

  await db
    .update(tasks)
    .set({
      title,
      type: input.type,
      status: input.status,
      description: input.description?.trim() || null,
      closedAt: closed ? new Date() : null,
    })
    .where(eq(tasks.id, input.taskId));

  if (input.subjectIds) {
    await db.delete(taskSubjects).where(eq(taskSubjects.taskId, input.taskId));
    if (input.subjectIds.length) {
      await db.insert(taskSubjects).values(
        input.subjectIds.map((subjectId, i) => ({
          taskId: input.taskId,
          subjectId,
          isPrimary: i === 0 ? 1 : 0,
        })),
      );
    }
  }

  revalidatePath(`/t/${input.taskId}`);
  revalidatePath("/");
  revalidatePath("/subjects");
}

/* -------------------------------------------------------- subject edits --- */

export async function updateSubject(input: {
  subjectId: string;
  name: string;
  kind: (typeof subjects.kind.enumValues)[number];
  parentId?: string | null;
  colour?: string;
  description?: string | null;
}) {
  await requireUser();

  const name = input.name.trim();
  if (!name) throw new Error("A subject needs a name.");

  if (input.parentId) {
    if (input.parentId === input.subjectId) {
      throw new Error("A subject cannot be its own parent.");
    }

    const [parent] = await db
      .select({ parentId: subjects.parentId })
      .from(subjects)
      .where(eq(subjects.id, input.parentId))
      .limit(1);
    if (!parent) throw new Error("That parent subject no longer exists.");
    if (parent.parentId) {
      throw new Error("Subjects nest two levels only — pick a top-level parent.");
    }

    // Moving a subject that has parts under it would make three levels.
    const [[kids]] = [
      await db
        .select({ n: count() })
        .from(subjects)
        .where(eq(subjects.parentId, input.subjectId)),
    ];
    if ((kids?.n ?? 0) > 0) {
      throw new Error(
        "This subject has parts of its own, so it cannot be moved under another. Move or delete its parts first.",
      );
    }
  }

  await db
    .update(subjects)
    .set({
      name,
      kind: input.kind,
      parentId: input.parentId ?? null,
      ...(input.colour ? { colour: input.colour } : {}),
      description: input.description?.trim() || null,
      // The slug is deliberately not regenerated: links and bookmarks to
      // /s/<slug> should survive a rename.
    })
    .where(eq(subjects.id, input.subjectId));

  revalidatePath("/subjects");
  revalidatePath("/");
}

export async function deleteEvent(eventId: string) {
  await requireUser();
  const [event] = await db
    .delete(events)
    .where(eq(events.id, eventId))
    .returning({ taskId: events.taskId });
  if (event) revalidatePath(`/t/${event.taskId}`);
}

/* ------------------------------------------------------------------ tags --- */

async function attachTags(
  targetId: string,
  targetType: "task" | "event" | "subject",
  names: string[],
) {
  const wanted = [...new Set(names.map((n) => n.toLowerCase()))];
  if (!wanted.length) return;

  // Upsert by name, then link. `onConflictDoNothing` keeps this a single round
  // trip even when most tags already exist.
  await db
    .insert(tags)
    .values(wanted.map((name) => ({ name })))
    .onConflictDoNothing({ target: tags.name });

  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.name, wanted));

  await db
    .insert(taggables)
    .values(rows.map((t) => ({ tagId: t.id, targetType, targetId })))
    .onConflictDoNothing();
}

/* ------------------------------------------------------------------ refs --- */

export async function addRef(input: {
  url: string;
  taskId?: string;
  eventId?: string;
  subjectId?: string;
  label?: string;
}) {
  await requireUser();
  const { classifyUrl } = await import("@/lib/refs");
  const detected = classifyUrl(input.url);

  const [row] = await db
    .insert(refs)
    .values({
      ...detected,
      label: input.label ?? detected.label,
      taskId: input.taskId ?? null,
      eventId: input.eventId ?? null,
      subjectId: input.subjectId ?? null,
    })
    .returning();

  if (input.taskId) revalidatePath(`/t/${input.taskId}`);
  return row;
}

export async function deleteRef(refId: string) {
  await requireUser();
  const [row] = await db
    .delete(refs)
    .where(eq(refs.id, refId))
    .returning({ taskId: refs.taskId });
  if (row?.taskId) revalidatePath(`/t/${row.taskId}`);
}

/* ------------------------------------------------------------- unfiled ----- */

/**
 * A holding pen so capture never blocks. If you have something to log and no
 * task for it, this makes one.
 */
export async function inboxTask() {
  await requireUser();
  const [existing] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.title, "Inbox"), isNull(tasks.closedAt)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(tasks)
    .values({ title: "Inbox", type: "other", status: "in_progress" })
    .returning({ id: tasks.id });
  return created.id;
}

/* --------------------------------------------------------------- deletes --- */

/**
 * Deletes cascade along the foreign keys declared in the schema:
 *
 *   subject → its task links (the tasks themselves survive)
 *   task    → its entries → their refs and attachments
 *   entry   → its refs and attachments
 *
 * A deleted subject does NOT take its tasks with it: a task can belong to
 * several subjects, and losing a month of entries because one label was tidied
 * away would be indefensible. Children are detached to top level rather than
 * deleted, for the same reason.
 */

/** What deleting a subject would destroy — shown before confirming. */
export async function subjectDeleteImpact(subjectId: string) {
  await requireUser();
  const [[tasksLinked], [children]] = await Promise.all([
    db
      .select({ n: count() })
      .from(taskSubjects)
      .where(eq(taskSubjects.subjectId, subjectId)),
    db
      .select({ n: count() })
      .from(subjects)
      .where(eq(subjects.parentId, subjectId)),
  ]);
  return { tasks: tasksLinked?.n ?? 0, children: children?.n ?? 0 };
}

export async function deleteSubject(subjectId: string) {
  await requireUser();

  // Children are promoted to top level, not deleted.
  await db
    .update(subjects)
    .set({ parentId: null })
    .where(eq(subjects.parentId, subjectId));

  await db.delete(subjects).where(eq(subjects.id, subjectId));

  revalidatePath("/subjects");
  revalidatePath("/");
  revalidatePath("/stream");
}

/** What deleting a task would destroy — shown before confirming. */
export async function taskDeleteImpact(taskId: string) {
  await requireUser();
  const [[entries], [refCount]] = await Promise.all([
    db.select({ n: count() }).from(events).where(eq(events.taskId, taskId)),
    db.select({ n: count() }).from(refs).where(eq(refs.taskId, taskId)),
  ]);
  return { entries: entries?.n ?? 0, refs: refCount?.n ?? 0 };
}

export async function deleteTask(taskId: string) {
  await requireUser();
  // Entries, refs and attachments go with it via onDelete: "cascade".
  await db.delete(tasks).where(eq(tasks.id, taskId));
  revalidatePath("/");
  revalidatePath("/subjects");
  revalidatePath("/stream");
}
