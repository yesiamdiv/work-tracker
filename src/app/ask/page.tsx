import { summarise } from "@/app/ai-actions";
import Link from "next/link";

import { AiCompose } from "@/components/ai-compose";
import { AiSummary } from "@/components/ai-summary";
import { Meta, PageTitle, SectionLabel } from "@/components/ui";
import { getAiConfig } from "@/lib/ai";

const PERIODS = [
  { days: 1, label: "day", title: "Today" },
  { days: 7, label: "week", title: "This week" },
  { days: 30, label: "month", title: "This month" },
];

export default async function AskPage() {
  const config = await getAiConfig();
  const ready = config.active.ready;
  const active = config.active.spec;
  const others = Object.values(config.providers).filter(
    (p) => p.ready && p.spec.id !== active.id,
  );

  return (
    <>
      <PageTitle sub="Summaries are written from your own entries and nothing else — the model is told never to add anything the log does not say.">
        Assistant
      </PageTitle>

      {/* The detail lives on the settings page; here just say what is answering. */}
      <p className="mb-9 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xs border border-line px-4 py-3">
        <Meta className="text-muted">
          Using <span className="text-body">{active.label}</span>
          {config.active.model && (
            <> · <span className="text-body">{config.active.model}</span></>
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
          <SectionLabel hint="Written on demand, not on page load — each one is a real request that costs money.">
            Summarise a period
          </SectionLabel>

          <div className="mb-10 space-y-3">
            {PERIODS.map((p) => (
              <AiSummary
                key={p.days}
                title={p.title}
                cta="Summarise"
                run={async () => {
                  "use server";
                  return summarise({
                    type: "period",
                    days: p.days,
                    label: p.label,
                  });
                }}
              />
            ))}
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
