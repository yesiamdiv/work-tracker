import Link from "next/link";
import { notFound } from "next/navigation";

import { AiSummary } from "@/components/ai-summary";
import { Clamp } from "@/components/clamp";
import { DeleteControl } from "@/components/delete-control";
import { TaskCollapseList } from "@/components/task-collapse-list";
import {
  Dot,
  Empty,
  ExtLink,
  Label,
  Meta,
  Rows,
  SectionLabel,
} from "@/components/ui";
import { deleteSubject, subjectDeleteImpact } from "@/app/actions";
import { summariseSubject } from "@/app/ai-actions";
import { getAiConfig } from "@/lib/ai";
import { subjectBySlug, subjectRefs, subjectTasks } from "@/db/queries";
import { refs as refsTable } from "@/db/schema";
import { refGroupTitle, refLabel } from "@/lib/ref-display";

/**
 * A big summary can take a while to generate, and Vercel kills a serverless
 * function at ten seconds by default. Sixty is the Hobby plan's maximum.
 */
export const maxDuration = 60;

type RefKind = (typeof refsTable.kind.enumValues)[number];

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const subject = await subjectBySlug(slug);
  if (!subject) notFound();

  const [tasks, allRefs] = await Promise.all([
    subjectTasks(subject.id),
    subjectRefs(subject.id),
  ]);

  const aiReady = (await getAiConfig()).active.ready;

  const open = tasks.filter(
    (t) => t.status !== "done" && t.status !== "abandoned",
  );
  const closed = tasks.filter(
    (t) => t.status === "done" || t.status === "abandoned",
  );

  const refsByKind = new Map<RefKind, typeof allRefs>();
  for (const r of allRefs) {
    const list = refsByKind.get(r.kind) ?? [];
    list.push(r);
    refsByKind.set(r.kind, list);
  }

  return (
    <>
      <p className="mb-5">
        <Link
          href="/subjects"
          className="extlink text-[13px] text-faint hover:text-muted"
        >
          ← All subjects
        </Link>
      </p>

      <header className="mb-9 rounded-xs border border-line p-5">
        <div className="flex items-center gap-2.5">
          <Dot colour={subject.colour} />
          <h1 className="min-w-0 flex-1 text-[22px] leading-tight text-text">
            {subject.name}
          </h1>
          <Link
            href={`/s/${subject.slug}/edit`}
            className="extlink shrink-0 text-[13px] text-muted hover:text-text"
          >
            Edit
          </Link>
          <DeleteControl
            what="this subject"
            label="Delete subject"
            redirectTo="/subjects"
            loadImpact={async () => {
              "use server";
              const i = await subjectDeleteImpact(subject.id);
              const parts = [];
              if (i.tasks)
                parts.push(
                  `${i.tasks} task${i.tasks === 1 ? "" : "s"} will lose this label but are kept`,
                );
              if (i.children)
                parts.push(
                  `${i.children} part${i.children === 1 ? "" : "s"} will move to top level`,
                );
              return parts.length ? `${parts.join("; ")}.` : "Nothing else is affected.";
            }}
            onDelete={async () => {
              "use server";
              await deleteSubject(subject.id);
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Meta className="text-muted">
            Kind <span className="text-body">{subject.kind.replace(/_/g, " ")}</span>
          </Meta>
          <Meta className="text-muted">
            <span className="text-body">{tasks.length}</span> task
            {tasks.length === 1 ? "" : "s"} in total
          </Meta>
        </div>

        {subject.description && (
          <div className="mt-4 border-t border-line pt-3.5">
            <Clamp maxHeight={140} moreLabel="Show all notes">
              <p className="whitespace-pre-wrap text-muted">{subject.description}</p>
            </Clamp>
          </div>
        )}

        {!subject.parentId && (
          <p className="mt-4 border-t border-line pt-3.5 text-[13px] text-faint">
            Showing tasks tagged with this subject and with any of its parts.
          </p>
        )}
      </header>

      {aiReady && tasks.length > 0 && (
        <div className="mb-10">
          <AiSummary
            title="Where this stands"
            cta="Summarise this subject"
            cached={subject.stateSummary}
            cachedAt={subject.stateSummaryAt}
            run={async () => {
              "use server";
              return summariseSubject(subject.id);
            }}
          />
        </div>
      )}

      <section className="mb-10">
        <SectionLabel
          hint="Open first, then finished. Includes tasks on this subject's parts."
          right={
            <Link
              href={`/tasks/new?subject=${subject.id}`}
              className="extlink text-[13px] text-muted hover:text-text"
            >
              New task for this subject
            </Link>
          }
        >
          Tasks
        </SectionLabel>
        <TaskCollapseList
          tasks={tasks}
          empty="No tasks on this subject yet."
        />
      </section>


      {allRefs.length > 0 && (
        <section>
          <SectionLabel hint="Every link ever recorded against this subject, gathered from all its tasks and entries.">
            All references
          </SectionLabel>
          <div className="space-y-5">
            {[...refsByKind.entries()].map(([kind, list]) => (
              <div key={kind} className="rounded-xs border border-line p-4">
                <Label>
                  {refGroupTitle(kind)} ({list.length})
                </Label>
                <div className="space-y-2">
                  {list.map((r) => (
                    <div key={r.id} className="truncate">
                      <ExtLink href={r.url} title={r.url}>
                        {refLabel(r)}
                      </ExtLink>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
