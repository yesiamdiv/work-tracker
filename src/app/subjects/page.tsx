import Link from "next/link";

import { FeedList } from "@/components/feed-list";
import { Spark, SubjectTree, type TreeRow } from "@/components/subject-tree";
import {
  Dot,
  Empty,
  ExtLink,
  Label,
  Meta,
  PageTitle,
  SectionLabel,
} from "@/components/ui";
import { feed } from "@/db/feed";
import { subjectList, subjectRefs, subjectTasks } from "@/db/queries";
import { subjectWeeklyActivity } from "@/db/stats";
import { nest } from "@/lib/subjects";
import { ago } from "@/lib/utils";

const REF_GROUP: Record<string, string> = {
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

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s: slug } = await searchParams;

  const [rows, activity] = await Promise.all([
    subjectList(),
    subjectWeeklyActivity(12),
  ]);

  const tree = nest(rows as TreeRow[]);
  // Default to the most recently active subject, so the panel is never empty.
  const selected =
    rows.find((r) => r.slug === slug) ??
    [...rows].sort((a, b) =>
      String(b.lastActivityAt ?? "").localeCompare(String(a.lastActivityAt ?? "")),
    )[0];

  const [tasks, refs, recent] = selected
    ? await Promise.all([
        subjectTasks(selected.id),
        subjectRefs(selected.id),
        feed({ subjectId: selected.id, limit: 6 }),
      ])
    : [[], [], { entries: [], hasMore: false }];

  const open = tasks.filter(
    (t) => t.status !== "done" && t.status !== "abandoned",
  );
  const parentOf = selected?.parentId
    ? rows.find((r) => r.id === selected.parentId)
    : null;
  const children = selected
    ? rows.filter((r) => r.parentId === selected.id)
    : [];

  const refsByKind = new Map<string, typeof refs>();
  for (const r of refs) {
    const list = refsByKind.get(r.kind) ?? [];
    list.push(r);
    refsByKind.set(r.kind, list);
  }

  return (
    <>
      <PageTitle sub="The things your work is about. Pick one on the left to see where it stands — a parent includes everything beneath it.">
        Subjects
      </PageTitle>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-8">
        {/* Left: names only, the whole set scannable at once. */}
        <div className="lg:w-72 lg:shrink-0">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <Meta className="text-muted">
              {rows.length} subject{rows.length === 1 ? "" : "s"} · 12-week
              activity
            </Meta>
            <Link
              href="/subjects/new"
              className="extlink text-[13px] text-muted hover:text-text"
            >
              New
            </Link>
          </div>
          <SubjectTree
            tree={tree}
            selectedSlug={selected?.slug}
            sparks={activity.series}
          />
        </div>

        {/* Right: everything about the selected one. */}
        <div className="min-w-0 flex-1">
          {!selected ? (
            <Empty>Create a subject to get started.</Empty>
          ) : (
            <>
              <header className="rounded-xs border border-line p-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Dot colour={selected.colour} />
                  <h2 className="text-[20px] leading-tight text-text">
                    {selected.name}
                  </h2>
                  <Link
                    href={`/s/${selected.slug}`}
                    className="extlink ml-auto text-[13px] text-muted hover:text-text"
                  >
                    Open full page
                  </Link>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Meta>{selected.kind.replace(/_/g, " ")}</Meta>
                  {parentOf && (
                    <Meta>
                      · part of{" "}
                      <Link
                        href={`/subjects?s=${parentOf.slug}`}
                        className="extlink text-muted hover:text-text"
                      >
                        {parentOf.name}
                      </Link>
                    </Meta>
                  )}
                  {children.length > 0 && (
                    <Meta>
                      · {children.length} part{children.length === 1 ? "" : "s"}
                    </Meta>
                  )}
                </div>

                {/* The four numbers worth knowing, stated not implied. */}
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:grid-cols-4">
                  <div>
                    <Meta className="block text-muted">Open</Meta>
                    <span className="text-[19px] text-text tnum">
                      {open.length}
                    </span>
                  </div>
                  <div>
                    <Meta className="block text-muted">All tasks</Meta>
                    <span className="text-[19px] text-text tnum">
                      {tasks.length}
                    </span>
                  </div>
                  <div>
                    <Meta className="block text-muted">Last activity</Meta>
                    <span className="text-[19px] text-text tnum">
                      {selected.lastActivityAt
                        ? ago(selected.lastActivityAt)
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <Meta className="block text-muted">Links kept</Meta>
                    <span className="text-[19px] text-text tnum">
                      {refs.length}
                    </span>
                  </div>
                </div>

                <div className="mt-4 border-t border-line pt-3.5">
                  <Meta className="mb-1.5 block text-muted">
                    Entries per week, last 12 weeks
                  </Meta>
                  <Spark
                    data={activity.series.get(selected.id) ?? []}
                    className="!h-7 !w-full"
                  />
                </div>

                {selected.description && (
                  <p className="mt-4 whitespace-pre-wrap border-t border-line pt-3.5 text-muted">
                    {selected.description}
                  </p>
                )}
              </header>

              {children.length > 0 && (
                <section className="mt-7">
                  <SectionLabel>Parts of {selected.name}</SectionLabel>
                  <div className="divide-y divide-line rounded-xs border border-line">
                    {children.map((c) => (
                      <Link
                        key={c.id}
                        href={`/subjects?s=${c.slug}`}
                        scroll={false}
                        className="rowlink flex items-center gap-2.5 px-4 py-2.5"
                      >
                        <Dot colour={c.colour} />
                        <span className="min-w-0 flex-1 truncate text-body">
                          {c.name}
                        </span>
                        <Meta>{c.kind.replace(/_/g, " ")}</Meta>
                        <Meta className="w-14 text-right">
                          {c.openTasks} open
                        </Meta>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section className="mt-7">
                <SectionLabel
                  right={
                    <Link
                      href={`/stream?subject=${selected.id}`}
                      className="extlink text-[13px] text-muted hover:text-text"
                    >
                      All entries
                    </Link>
                  }
                >
                  Latest entries
                </SectionLabel>
                <FeedList
                  entries={recent.entries}
                  empty="Nothing logged against this subject yet."
                />
              </section>

              {open.length > 0 && (
                <section className="mt-7">
                  <SectionLabel>Open tasks</SectionLabel>
                  <div className="divide-y divide-line rounded-xs border border-line">
                    {open.map((t) => (
                      <Link
                        key={t.id}
                        href={`/t/${t.id}`}
                        className="rowlink flex items-center gap-3 px-4 py-2.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-body">
                          {t.title}
                        </span>
                        <Meta className="shrink-0">
                          {t.eventCount} · {ago(t.lastActivityAt)}
                        </Meta>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {refs.length > 0 && (
                <section className="mt-7">
                  <SectionLabel hint="Gathered from every task and entry under this subject.">
                    References
                  </SectionLabel>
                  <div className="space-y-4">
                    {[...refsByKind.entries()].map(([kind, list]) => (
                      <div
                        key={kind}
                        className="rounded-xs border border-line p-4"
                      >
                        <Label>
                          {REF_GROUP[kind] ?? kind} ({list.length})
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
          )}
        </div>
      </div>
    </>
  );
}
