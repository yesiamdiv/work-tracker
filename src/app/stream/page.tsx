import Link from "next/link";

import { FeedList } from "@/components/feed-list";
import { FilterBar } from "@/components/filter-bar";
import { Meta, PageTitle } from "@/components/ui";
import { feed, subjectOptions, taskOptions } from "@/db/feed";
import {
  activeCount,
  describe,
  type FilterParams,
  parseFilters,
  toFeedFilters,
  toParams,
} from "@/lib/filters";
import { APP_TZ } from "@/lib/time";

const PAGE = 50;

export default async function StreamPage({
  searchParams,
}: {
  searchParams: Promise<FilterParams>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [result, subjects, tasks] = await Promise.all([
    feed(toFeedFilters(filters, { limit: PAGE, offset: filters.page * PAGE })),
    subjectOptions(),
    taskOptions(),
  ]);

  const count = activeCount(filters);
  const names = {
    subjects: new Map(subjects.map((s) => [s.id, s.label])),
    tasks: new Map(tasks.map((t) => [t.id, t.label])),
  };

  // Paging keeps the filters; the parser is the only thing that knows them all.
  const qs = (p: number) => {
    const u = toParams(filters);
    if (p > 0) u.set("page", String(p));
    const s = u.toString();
    return s ? `/stream?${s}` : "/stream";
  };

  return (
    <>
      <PageTitle sub="Everything you have ever logged, in one list. Narrow it down, then bookmark the result — the filters live in the address bar.">
        Search &amp; filter
      </PageTitle>

      <FilterBar subjects={subjects} tasks={tasks} tz={APP_TZ} />

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <Meta className="text-muted">
          {result.entries.length === 0
            ? "No matches"
            : `${filters.page * PAGE + 1}–${filters.page * PAGE + result.entries.length}${
                result.hasMore ? "" : " of these"
              }`}
          {count ? ` · ${count} filter${count === 1 ? "" : "s"}` : ""}
        </Meta>
      </div>

      {/* The selection said in words, which is the only readable check that the
          filters compose the way you meant. */}
      {count > 0 && (
        <p className="mb-4 text-[13px] text-faint">{describe(filters, names, APP_TZ)}.</p>
      )}

      <FeedList
        entries={result.entries}
        empty={
          count > 0
            ? "Nothing matches those filters. Try widening them."
            : "Nothing logged yet."
        }
      />

      {(filters.page > 0 || result.hasMore) && (
        <div className="mt-6 flex items-center gap-5">
          {filters.page > 0 && (
            <Link
              href={qs(filters.page - 1)}
              className="extlink text-[13px] text-muted hover:text-text"
            >
              ← Newer
            </Link>
          )}
          {result.hasMore && (
            <Link
              href={qs(filters.page + 1)}
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
