import Link from "next/link";

import { FeedList } from "@/components/feed-list";
import { StreamFilters } from "@/components/stream-filters";
import { Meta, PageTitle } from "@/components/ui";
import { feed, subjectOptions, type FeedFilters } from "@/db/feed";
import { events } from "@/db/schema";

const PAGE = 50;

type Params = {
  q?: string;
  subject?: string;
  kind?: string;
  outcome?: string;
  refs?: string;
  days?: string;
  task?: string;
  page?: string;
};

/** Only accept values the enums actually contain — these arrive from the URL. */
function asKind(v?: string) {
  return events.kind.enumValues.includes(v as never)
    ? (v as FeedFilters["kind"])
    : undefined;
}
function asOutcome(v?: string) {
  return events.outcome.enumValues.includes(v as never)
    ? (v as FeedFilters["outcome"])
    : undefined;
}

export default async function StreamPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const days = Number(sp.days ?? 0) || 0;

  const filters: FeedFilters = {
    q: sp.q,
    subjectId: sp.subject || undefined,
    taskId: sp.task || undefined,
    kind: asKind(sp.kind),
    outcome: asOutcome(sp.outcome),
    withRefs: sp.refs === "1",
    from: days ? new Date(Date.now() - days * 86_400_000) : undefined,
    limit: PAGE,
    offset: page * PAGE,
  };

  const [result, subjects] = await Promise.all([feed(filters), subjectOptions()]);

  const active =
    !!sp.q ||
    !!sp.subject ||
    !!sp.kind ||
    !!sp.outcome ||
    sp.refs === "1" ||
    !!days ||
    !!sp.task;

  // Preserve the filters when paging.
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== "page") u.set(k, String(v));
    }
    if (p > 0) u.set("page", String(p));
    const s = u.toString();
    return s ? `/stream?${s}` : "/stream";
  };

  return (
    <>
      <PageTitle sub="Everything you have ever logged, in one list. Narrow it down, then bookmark the result — the filters live in the address bar.">
        Search &amp; filter
      </PageTitle>

      <StreamFilters subjects={subjects} />

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <Meta className="text-muted">
          {result.entries.length === 0
            ? "No matches"
            : `${page * PAGE + 1}–${page * PAGE + result.entries.length}${
                result.hasMore ? "" : " of these"
              }`}
          {active ? " · filtered" : ""}
        </Meta>
        {active && (
          <Link
            href="/stream"
            className="extlink text-[13px] text-muted hover:text-text"
          >
            Clear all filters
          </Link>
        )}
      </div>

      <FeedList
        entries={result.entries}
        empty={
          active
            ? "Nothing matches those filters. Try widening them."
            : "Nothing logged yet."
        }
      />

      {(page > 0 || result.hasMore) && (
        <div className="mt-6 flex items-center gap-5">
          {page > 0 && (
            <Link
              href={qs(page - 1)}
              className="extlink text-[13px] text-muted hover:text-text"
            >
              ← Newer
            </Link>
          )}
          {result.hasMore && (
            <Link
              href={qs(page + 1)}
              className="extlink text-[13px] text-muted hover:text-text"
            >
              Older →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
