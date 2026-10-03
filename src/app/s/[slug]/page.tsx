import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteControl } from "@/components/delete-control";
import { TaskRow } from "@/components/task-row";
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
import { subjectBySlug, subjectRefs, subjectTasks } from "@/db/queries";
import { refs as refsTable } from "@/db/schema";

type RefKind = (typeof refsTable.kind.enumValues)[number];

const REF_GROUP: Record<RefKind, string> = {
  jira: "Tickets",
  sheet: "Sheets",
  doc: "Docs",
  slide: "Slides",
  confluence: "Confluence",
  pr: "Pull requests",
  build: "Builds",
  repo: "Repos",
  other: "Other links",
};

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
          <p className="mt-4 whitespace-pre-wrap border-t border-line pt-3.5 text-muted">
            {subject.description}
          </p>
        )}

        {!subject.parentId && (
          <p className="mt-4 border-t border-line pt-3.5 text-[13px] text-faint">
            Showing tasks tagged with this subject and with any of its parts.
          </p>
        )}
      </header>

      <section className="mb-10">
        <SectionLabel>Open tasks</SectionLabel>
        {open.length ? (
          <Rows>
            {open.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </Rows>
        ) : (
          <Empty>Nothing open for this subject.</Empty>
        )}
      </section>

      {closed.length > 0 && (
        <section className="mb-10">
          <SectionLabel>Finished</SectionLabel>
          <Rows>
            {closed.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </Rows>
        </section>
      )}

      {allRefs.length > 0 && (
        <section>
          <SectionLabel hint="Every link ever recorded against this subject, gathered from all its tasks and entries.">
            All references
          </SectionLabel>
          <div className="space-y-5">
            {[...refsByKind.entries()].map(([kind, list]) => (
              <div key={kind} className="rounded-xs border border-line p-4">
                <Label>
                  {REF_GROUP[kind]} ({list.length})
                </Label>
                <div className="space-y-2">
                  {list.map((r) => (
                    <div key={r.id} className="truncate">
                      <ExtLink href={r.url} title={r.url}>
                        {r.label ?? r.externalKey ?? r.url}
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
