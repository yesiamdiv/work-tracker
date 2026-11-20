import Link from "next/link";

import { savedAnswers, selectedEntries } from "@/app/ai-actions";
import { AiCompose } from "@/components/ai-compose";
import { AnswerHistory } from "@/components/answer-history";
import { AskPanel } from "@/components/ask-panel";
import { FeedList } from "@/components/feed-list";
import { FilterBar } from "@/components/filter-bar";
import { Meta, PageTitle, SectionLabel } from "@/components/ui";
import { subjectOptions, taskOptions } from "@/db/feed";
import { getAiConfig } from "@/lib/ai";
import {
  activeCount,
  describe,
  type FilterParams,
  parseFilters,
  toParams,
} from "@/lib/filters";
import { APP_TZ } from "@/lib/time";

/**
 * A big summary can take a while to generate, and Vercel kills a serverless
 * function at ten seconds by default. Sixty is the Hobby plan's maximum.
 */
export const maxDuration = 60;

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<FilterParams>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const config = await getAiConfig();
  const ready = config.active.ready;
  const active = config.active.spec;

  const others = Object.values(config.providers).filter(
    (p) => p.ready && p.spec.id !== active.id,
  );

  /*
   * The canonical form of the selection, which is what gets asked, shown and
   * saved. Passing the raw address bar through would store whatever junk was
   * in it on the answer, and that record is the only way a saved answer can be
   * reopened months later.
   */
  const params = toParams(filters);
  const query = params.toString();
  const selection = Object.fromEntries(params.entries());
  const filtered = activeCount(filters) > 0;

  const [subjects, tasks, entries, history] = await Promise.all([
    subjectOptions(),
    taskOptions(),
    ready ? selectedEntries(selection) : Promise.resolve([]),
    savedAnswers(5),
  ]);
  const matched = entries.length;
  const names = {
    subjects: new Map(subjects.map((x) => [x.id, x.label])),
    tasks: new Map(tasks.map((x) => [x.id, x.label])),
  };

  return (
    <>
      <PageTitle sub="Narrow the log to the part you mean, then ask about it. Answers come from those entries and nothing else — the model is told never to add what the log does not say.">
        Assistant
      </PageTitle>

      <p className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xs border border-line px-4 py-3">
        <Meta className="text-muted">
          Using <span className="text-body">{active.label}</span>
          {config.active.model && (
            <>
              {" · "}
              <span className="text-body">{config.active.model}</span>
            </>
          )}
        </Meta>
        <Link
          href="/settings"
          className="extlink ml-auto text-[13px] text-muted hover:text-text"
        >
          Change provider or model
        </Link>
      </p>

      {!ready ? (
        <p className="rounded-xs border border-dashed border-line px-4 py-7 text-center text-muted">
          {active.label} is selected but has no API key yet.
          <Meta className="mt-2 block">
            Add one under{" "}
            <Link
              href="/settings"
              className="extlink text-muted hover:text-text"
            >
              Settings
            </Link>
            {others.length
              ? `, or switch there to one that is ready: ${others.map((p) => p.spec.label).join(", ")}.`
              : "."}
          </Meta>
        </p>
      ) : (
        <>
          <SectionLabel hint="The same filters as the Stream page. Whatever they select is what the assistant reads — and the selection lives in the address bar, so a useful one is a link you can keep.">
            Choose what to ask about
          </SectionLabel>

          <FilterBar
            subjects={subjects}
            tasks={tasks}
            basePath="/ask"
            searchLabel="Only entries containing this text"
            tz={APP_TZ}
          />

          <SectionLabel
            hint="Opening this list costs nothing: counting the entries had already loaded them. The Stream page is a second query, which is why it is a choice rather than the default."
            right={
              <Link
                href={query ? `/stream?${query}` : "/stream"}
                target="_blank"
                rel="noopener"
                className="extlink text-[13px] text-muted hover:text-text"
              >
                Open as a page &#8599;
              </Link>
            }
          >
            What the assistant will read
          </SectionLabel>

          {/*
            What the filters actually caught.
            
            Asking a question you cannot see the input to is guesswork, and the
            entries cost nothing to show: counting them already loaded every
            one. Closed by default because a wide selection runs to hundreds of
            rows, and the point of the page is the question.
          */}
          <details className="group mb-6 rounded-xs border border-line">
            <summary className="rowlink flex list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="chev shrink-0 text-[17px] leading-none transition-transform group-open:rotate-90"
              >
                &rsaquo;
              </span>
              <span className="text-[13px] text-body">
                {matched} {matched === 1 ? "entry" : "entries"} selected
              </span>
              {/* The selection in words — the same sentence the model is told. */}
              <Meta className="min-w-0">
                {matched
                  ? filtered
                    ? `${describe(filters, names, APP_TZ)}`
                    : "the exact text the assistant reads"
                  : "nothing matches these filters"}
              </Meta>
            </summary>
            {matched > 0 && (
              <div className="border-t border-line p-4">
                <FeedList entries={entries} />
              </div>
            )}
          </details>

          <div className="mb-10">
            <AskPanel filters={selection} matched={matched} filtered={filtered} />
          </div>

          <SectionLabel
            hint="Every question and summary is kept, with the filters and model behind it."
            right={
              <Link
                href="/answers"
                className="extlink text-[13px] text-muted hover:text-text"
              >
                See all answers
              </Link>
            }
          >
            Asked recently
          </SectionLabel>
          <div className="mb-10">
            <AnswerHistory items={history} />
          </div>

          <SectionLabel hint="For when you would rather describe the work than fill in forms. Nothing is saved until you approve it.">
            Set up new work from a note
          </SectionLabel>
          <AiCompose />
        </>
      )}
    </>
  );
}
