import Link from "next/link";

import {
  Chevron,
  Dot,
  Empty,
  Meta,
  PageTitle,
  SectionLabel,
} from "@/components/ui";
import { subjectList } from "@/db/queries";
import { nest } from "@/lib/subjects";
import { ago } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof subjectList>>[number];

function kindLabel(kind: string) {
  return kind.replace(/_/g, " ");
}

/** A top-level subject. */
function ParentRow({ row, childCount }: { row: Row; childCount: number }) {
  return (
    <Link
      href={`/s/${row.slug}`}
      className="rowlink flex items-center gap-3 px-4 py-3.5"
    >
      <Dot colour={row.colour} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] text-text">{row.name}</span>
        <span className="mt-0.5 block">
          <Meta>
            {kindLabel(row.kind)}
            {childCount > 0 &&
              ` · ${childCount} part${childCount === 1 ? "" : "s"}`}
          </Meta>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Meta className="block text-muted">
          {row.openTasks} open
        </Meta>
        <Meta className="block">
          {row.lastActivityAt ? `${ago(row.lastActivityAt)} ago` : "no activity"}
        </Meta>
      </span>
      <Chevron />
    </Link>
  );
}

/**
 * A child subject. Indented, but also explicitly captioned "part of X" —
 * indentation alone does not say what the relationship is.
 */
function ChildRow({ row, parentName }: { row: Row; parentName: string }) {
  return (
    <Link
      href={`/s/${row.slug}`}
      className="rowlink flex items-center gap-3 py-3 pl-4 pr-4"
    >
      {/* The rule carries the eye from the parent down to its parts. */}
      <span aria-hidden className="ml-1 h-6 w-4 shrink-0 border-l border-b border-line" />
      <Dot colour={row.colour} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body">{row.name}</span>
        <span className="mt-0.5 block">
          <Meta>
            {kindLabel(row.kind)} · part of {parentName}
          </Meta>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Meta className="block text-muted">{row.openTasks} open</Meta>
        <Meta className="block">
          {row.lastActivityAt ? `${ago(row.lastActivityAt)} ago` : "no activity"}
        </Meta>
      </span>
      <Chevron />
    </Link>
  );
}

export default async function SubjectsPage() {
  const rows = await subjectList();
  const tree = nest(rows);

  return (
    <>
      <PageTitle sub="The things your work is about — a client, an SDK, a firmware line, an app. Tag a task with one so you can find it again later.">
        Subjects
      </PageTitle>

      <SectionLabel
        hint="A subject can have parts under it. Opening a subject shows its own tasks and all its parts' tasks together."
        right={
          <Link
            href="/subjects/new"
            className="extlink text-[13px] text-muted hover:text-text"
          >
            New subject
          </Link>
        }
      >
        All subjects
      </SectionLabel>

      {tree.length ? (
        <div className="space-y-3">
          {tree.map(({ subject, children }) => (
            <div
              key={subject.id}
              className="overflow-hidden rounded-xs border border-line"
            >
              <ParentRow row={subject} childCount={children.length} />
              {children.length > 0 && (
                <div className="border-t border-line bg-black">
                  {children.map((c) => (
                    <ChildRow key={c.id} row={c} parentName={subject.name} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty>No subjects yet.</Empty>
      )}
    </>
  );
}
