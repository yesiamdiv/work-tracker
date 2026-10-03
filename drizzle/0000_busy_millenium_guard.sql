CREATE TYPE "public"."event_kind" AS ENUM('note', 'test_run', 'bug_found', 'bug_update', 'decision', 'meeting', 'blocker', 'question', 'handoff', 'milestone');--> statement-breakpoint
CREATE TYPE "public"."event_outcome" AS ENUM('pass', 'fail', 'partial', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."ref_kind" AS ENUM('jira', 'sheet', 'doc', 'slide', 'confluence', 'pr', 'build', 'repo', 'other');--> statement-breakpoint
CREATE TYPE "public"."subject_kind" AS ENUM('client', 'sdk', 'firmware', 'hardware', 'mobile_app', 'web_app', 'feature', 'integration', 'internal');--> statement-breakpoint
CREATE TYPE "public"."subject_status" AS ENUM('active', 'dormant', 'archived');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('planned', 'in_progress', 'blocked', 'waiting', 'done', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('manual_test', 'automation', 'qa_pass', 'regression', 'investigation', 'release', 'integration', 'setup', 'review', 'other');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"drive_file_id" text NOT NULL,
	"name" text NOT NULL,
	"mime" text,
	"size" integer,
	"web_view_link" text,
	"thumbnail_link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" "event_kind" DEFAULT 'note' NOT NULL,
	"body" text NOT NULL,
	"outcome" "event_outcome",
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"task_id" uuid,
	"subject_id" uuid,
	"kind" "ref_kind" DEFAULT 'other' NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"external_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" uuid,
	"kind" "subject_kind" DEFAULT 'client' NOT NULL,
	"status" "subject_status" DEFAULT 'active' NOT NULL,
	"colour" text DEFAULT '#6366f1' NOT NULL,
	"description" text,
	"state_summary" text,
	"state_summary_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "taggables" (
	"tag_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	CONSTRAINT "taggables_tag_id_target_type_target_id_pk" PRIMARY KEY("tag_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"colour" text
);
--> statement-breakpoint
CREATE TABLE "task_subjects" (
	"task_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"is_primary" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_subjects_task_id_subject_id_pk" PRIMARY KEY("task_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"type" "task_type" DEFAULT 'manual_test' NOT NULL,
	"status" "task_status" DEFAULT 'in_progress' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"description" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"summary" text,
	"summary_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refs" ADD CONSTRAINT "refs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refs" ADD CONSTRAINT "refs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refs" ADD CONSTRAINT "refs_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_parent_id_subjects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taggables" ADD CONSTRAINT "taggables_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_subjects" ADD CONSTRAINT "task_subjects_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_subjects" ADD CONSTRAINT "task_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_event_idx" ON "attachments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "events_task_idx" ON "events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "events_occurred_idx" ON "events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "events_kind_idx" ON "events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "refs_event_idx" ON "refs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "refs_task_idx" ON "refs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "refs_subject_idx" ON "refs" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "refs_key_idx" ON "refs" USING btree ("external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_slug_idx" ON "subjects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "subjects_parent_idx" ON "subjects" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "taggables_target_idx" ON "taggables" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_idx" ON "tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "task_subjects_subject_idx" ON "task_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_activity_idx" ON "tasks" USING btree ("last_activity_at");