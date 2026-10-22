import Link from "next/link";

import { countFiltered, savedAnswers, type AskFilters } from "@/app/ai-actions";
import { AiCompose } from "@/components/ai-compose";
import { AnswerHistory } from "@/components/answer-history";
import { AskPanel } from "@/components/ask-panel";
import { StreamFilters } from "@/components/stream-filters";
import { Meta, PageTitle, SectionLabel } from "@/components/ui";
import { subjectOptions } from "@/db/feed";
import { getAiConfig } from "@/lib/ai";

/** Quick ranges, which are just the date filter pre-set. */
const PRESETS = [
  { label: "Today", days: "1" },
  { label: "Last 7 days", days: "7" },
  { label: "Last 30 days", days: "30" },
  { label: "Last 90 days", days: "90" },
];

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<AskFilters>;
}) {
  const filters = await searchParams;
  const config = await getAiConfig();
  const ready = config.active.ready;
  const active = config.active.spec;

  const others = Object.values(config.providers).filter(
    (p) => p.ready && p.spec.id !== active.id,
  );

  const [subjects, matched, history] = await Promise.all([
    subjectOptions(),
    ready ? countFiltered(filters) : Promise.resolve(0),
    savedAnswers(),
  ]);

  const filtered = Object.entries(filters).some(
    ([k, v]) => v && k !== "page",
  );

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
            <Link href="/settings" className="extlink text-muted hover:text-text">
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

          {/* Presets are just the date filter, which is the one people reach for. */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Link
                key={p.days}
                href={`/ask?days=${p.days}`}
                className={`rounded-xs border px-2.5 py-1 text-[13px] transition-colors ${
                  filters.days === p.days
                    ? "border-accent bg-raised text-text"
                    : "border-line text-muted hover:border-line-strong hover:bg-raised hover:text-text"
                }`}
              >
                {p.label}
              </Link>
            ))}
            {filtered && (
              <Link
                href="/ask"
                className="extlink ml-1 text-[13px] text-faint hover:text-text"
              >
                Clear all
              </Link>
            )}
          </div>

          <StreamFilters
            subjects={subjects}
            basePath="/ask"
            searchLabel="Only entries containing this text"
          />

          <div className="mb-10">
            <AskPanel filters={filters} matched={matched} filtered={filtered} />
          </div>

          <SectionLabel hint="Every question and summary is kept, with the filters and model behind it.">
            Asked before
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
