import Link from "next/link";
import { notFound } from "next/navigation";

import { AiSummary } from "@/components/ai-summary";
import { DeleteControl } from "@/components/delete-control";
import { EventItem } from "@/components/event-item";
import { TaskEventBox } from "@/components/task-event-box";
import { TaskStatus } from "@/components/task-status";
import {
  Dot,
  Empty,
  ExtLink,
  Label,
  Meta,
  SectionLabel,
} from "@/components/ui";
import { deleteTask, taskDeleteImpact } from "@/app/actions";
import { summariseTask } from "@/app/ai-actions";
import { aiConfigured } from "@/lib/ai";
import { taskDetail } from "@/db/queries";
import { byDay } from "@/lib/utils";

const REF_WORD: Record<string, string> = {
  jira: "Ticket",
  sheet: "Sheet",
  doc: "Doc",
  slide: "Slides",
  confluence: "Confluence",
  pr: "PR",
  build: "Build",
  repo: "Repo",
  other: "Link",
};

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await taskDetail(id);
  if (!detail) notFound();

  const { task, subjects, events, taskRefs } = detail;
  const days = byDay(events, (e) => e.occurredAt);

  return (
    <>
      <p className="mb-5">
        <Link href="/" className="extlink text-[13px] text-faint hover:text-muted">
          ← Back to today
        </Link>
      </p>

      <header className="mb-9 rounded-xs border border-line p-5">
        <h1 className="text-[22px] leading-tight text-text">{task.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <span className="inline-flex items-center gap-2">
            <Meta className="text-muted">Status</Meta>
            <TaskStatus taskId={task.id} status={task.status} />
          </span>
          <span className="inline-flex items-center gap-2">
            <Meta className="text-muted">Kind</Meta>
            <Meta className="text-body">{task.type.replace(/_/g, " ")}</Meta>
          </span>
          <span className="inline-flex items-center gap-2">
            <Meta className="text-muted">Entries</Meta>
            <Meta className="text-body">{events.length}</Meta>
          </span>
          <span className="ml-auto">
            <DeleteControl
              what="this task"
              label="Delete task"
              redirectTo="/"
              loadImpact={async () => {
                "use server";
                const i = await taskDeleteImpact(task.id);
                return i.entries
                  ? `Its ${i.entries} ${i.entries === 1 ? "entry" : "entries"} and ${i.refs} link${i.refs === 1 ? "" : "s"} go too.`
                  : "It has no entries.";
              }}
              onDelete={async () => {
                "use server";
                await deleteTask(task.id);
              }}
            />
          </span>
        </div>

        {subjects.length > 0 && (
          <div className="mt-4 border-t border-line pt-3.5">
            <Label>About</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {subjects.map((s) => (
                <Link
                  key={s.id}
                  href={`/s/${s.slug}`}
                  className="inline-flex items-center gap-2 rounded-xs border border-line px-2.5 py-1 text-[13px] text-body transition-colors hover:border-line-strong hover:bg-raised"
                >
                  <Dot colour={s.colour} />
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {task.description && (
          <p className="mt-4 whitespace-pre-wrap border-t border-line pt-3.5 text-muted">
            {task.description}
          </p>
        )}

        {taskRefs.length > 0 && (
          <div className="mt-4 border-t border-line pt-3.5">
            <Label>References on this task</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {taskRefs.map((r) => (
                <ExtLink key={r.id} href={r.url} title={r.url}>
                  {REF_WORD[r.kind] ?? "Link"} · {r.label ?? r.externalKey ?? r.kind}
                </ExtLink>
              ))}
            </div>
          </div>
        )}
      </header>

      {aiConfigured() && events.length >= 3 && (
        <div className="mb-8">
          <AiSummary
            title="What has happened so far"
            cta="Summarise this task"
            cached={task.summary}
            cachedAt={task.summaryAt}
            run={async () => {
              "use server";
              return summariseTask(task.id);
            }}
          />
        </div>
      )}

      <SectionLabel hint="Oldest first. Links found in an entry's text are saved with it.">
        Log
      </SectionLabel>

      {days.length ? (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.label}>
              <h3 className="mb-2 text-[13px] text-muted">{day.label}</h3>
              <div className="divide-y divide-line rounded-xs border border-line">
                {day.rows.map((e) => (
                  <EventItem key={e.id} event={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty>No entries yet. Add the first one below.</Empty>
      )}

      <TaskEventBox taskId={task.id} />
    </>
  );
}
