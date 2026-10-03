import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------- enums --- */

/** What kind of thing a subject is. Drives icon + default grouping only. */
export const subjectKind = pgEnum("subject_kind", [
  "client",
  "sdk",
  "firmware",
  "hardware",
  "mobile_app",
  "web_app",
  "feature",
  "integration",
  "internal",
]);

export const subjectStatus = pgEnum("subject_status", [
  "active",
  "dormant",
  "archived",
]);

export const taskType = pgEnum("task_type", [
  "manual_test",
  "automation",
  "qa_pass",
  "regression",
  "investigation",
  "release",
  "integration",
  "setup",
  "review",
  "other",
]);

export const taskStatus = pgEnum("task_status", [
  "planned",
  "in_progress",
  "blocked",
  "waiting",
  "done",
  "abandoned",
]);

/**
 * Event kinds. Kept deliberately short — every extra option is a decision you
 * have to make while logging, and hesitation is what kills a capture habit.
 */
export const eventKind = pgEnum("event_kind", [
  "note",
  "test_run",
  "bug_found",
  "bug_update",
  "decision",
  "meeting",
  "blocker",
  "question",
  "handoff",
  "milestone",
]);

export const eventOutcome = pgEnum("event_outcome", [
  "pass",
  "fail",
  "partial",
  "inconclusive",
]);

export const refKind = pgEnum("ref_kind", [
  "jira",
  "sheet",
  "doc",
  "slide",
  "confluence",
  "pr",
  "build",
  "repo",
  "other",
]);

/* ------------------------------------------------------------- subjects --- */

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** URL-safe short name, used in /s/<slug>. */
    slug: text("slug").notNull(),
    /**
     * Two levels, no deeper. A subject with a parent may not itself be a
     * parent — enforced in `createSubject`/`updateSubject`, since expressing it
     * as a CHECK would need a trigger.
     *
     * Filtering by a parent implicitly includes its children: filter "ClientX"
     * and you get ClientX firmware and ClientX Android app too, without having
     * to know they exist. See `subjectFilterIds` in src/lib/subjects.ts.
     */
    parentId: uuid("parent_id").references((): AnyPgColumn => subjects.id, {
      onDelete: "set null",
    }),
    kind: subjectKind("kind").notNull().default("client"),
    status: subjectStatus("status").notNull().default("active"),
    /** Hex, used for the 3px left-border and matrix cells. */
    colour: text("colour").notNull().default("#6366f1"),
    description: text("description"),
    /** Cached AI "where this stands" paragraph. Regenerated on demand. */
    stateSummary: text("state_summary"),
    stateSummaryAt: timestamp("state_summary_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("subjects_slug_idx").on(t.slug),
    index("subjects_parent_idx").on(t.parentId),
  ],
);

/* ---------------------------------------------------------------- tasks --- */

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    type: taskType("type").notNull().default("manual_test"),
    status: taskStatus("status").notNull().default("in_progress"),
    /** 0 = normal, 1 = high, -1 = low. Ordering only, no ceremony. */
    priority: integer("priority").notNull().default(0),
    description: text("description"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Cached AI summary of the event stream. Invalidated when events change. */
    summary: text("summary"),
    summaryAt: timestamp("summary_at", { withTimezone: true }),
    /** Bumped on every event write, so "recently touched" ordering is cheap. */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_activity_idx").on(t.lastActivityAt),
  ],
);

/** A task can span subjects — one SDK bug affecting two clients. */
export const taskSubjects = pgTable(
  "task_subjects",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    /** The subject this task is chiefly about, when there are several. */
    isPrimary: integer("is_primary").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.subjectId] }),
    index("task_subjects_subject_idx").on(t.subjectId),
  ],
);

/* --------------------------------------------------------------- events --- */

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: eventKind("kind").notNull().default("note"),
    body: text("body").notNull(),
    outcome: eventOutcome("outcome"),
    /**
     * When it actually happened, as against when it was typed. These diverge
     * constantly — you log the morning's testing at 6pm — and collapsing them
     * into one column makes the timeline lie.
     */
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Free-form extras: device, os version, build number, env, suite name. */
    meta: jsonb("meta").$type<Record<string, string | number | boolean>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("events_task_idx").on(t.taskId),
    index("events_occurred_idx").on(t.occurredAt),
    index("events_kind_idx").on(t.kind),
  ],
);

/* ----------------------------------------------------------------- refs --- */

/**
 * External links as first-class rows rather than URLs buried in prose. The
 * point of `externalKey` is that "show me everything that touched JIRA-4421"
 * becomes one indexed query instead of a text scan.
 */
export const refs = pgTable(
  "refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "cascade",
    }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, {
      onDelete: "cascade",
    }),
    kind: refKind("kind").notNull().default("other"),
    url: text("url").notNull(),
    label: text("label"),
    /** "JIRA-4421", a PR number, a build id. */
    externalKey: text("external_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("refs_event_idx").on(t.eventId),
    index("refs_task_idx").on(t.taskId),
    index("refs_subject_idx").on(t.subjectId),
    index("refs_key_idx").on(t.externalKey),
  ],
);

/* ---------------------------------------------------------- attachments --- */

/** Metadata only. The bytes live in Drive; see step 3. */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    driveFileId: text("drive_file_id").notNull(),
    name: text("name").notNull(),
    mime: text("mime"),
    size: integer("size"),
    webViewLink: text("web_view_link"),
    thumbnailLink: text("thumbnail_link"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("attachments_event_idx").on(t.eventId)],
);

/* ----------------------------------------------------------------- tags --- */

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    colour: text("colour"),
  },
  (t) => [uniqueIndex("tags_name_idx").on(t.name)],
);

export const taggables = pgTable(
  "taggables",
  {
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(), // 'task' | 'event' | 'subject'
    targetId: uuid("target_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.targetType, t.targetId] }),
    index("taggables_target_idx").on(t.targetType, t.targetId),
  ],
);

/* ------------------------------------------------------------ relations --- */

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  parent: one(subjects, {
    fields: [subjects.parentId],
    references: [subjects.id],
    relationName: "subjectParent",
  }),
  children: many(subjects, { relationName: "subjectParent" }),
  taskSubjects: many(taskSubjects),
  refs: many(refs),
}));

export const tasksRelations = relations(tasks, ({ many }) => ({
  events: many(events),
  taskSubjects: many(taskSubjects),
  refs: many(refs),
}));

export const taskSubjectsRelations = relations(taskSubjects, ({ one }) => ({
  task: one(tasks, { fields: [taskSubjects.taskId], references: [tasks.id] }),
  subject: one(subjects, {
    fields: [taskSubjects.subjectId],
    references: [subjects.id],
  }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  task: one(tasks, { fields: [events.taskId], references: [tasks.id] }),
  refs: many(refs),
  attachments: many(attachments),
}));

export const refsRelations = relations(refs, ({ one }) => ({
  event: one(events, { fields: [refs.eventId], references: [events.id] }),
  task: one(tasks, { fields: [refs.taskId], references: [tasks.id] }),
  subject: one(subjects, {
    fields: [refs.subjectId],
    references: [subjects.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  event: one(events, { fields: [attachments.eventId], references: [events.id] }),
}));

/* ---------------------------------------------------------------- types --- */

export type Subject = typeof subjects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Ref = typeof refs.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Tag = typeof tags.$inferSelect;
