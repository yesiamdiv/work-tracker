import { summarise } from "@/app/ai-actions";
import { AiCompose } from "@/components/ai-compose";
import { AiSummary } from "@/components/ai-summary";
import { ProviderStatus } from "@/components/provider-status";
import { Meta, PageTitle, SectionLabel } from "@/components/ui";
import { activeProvider, configuredProviders, providerReady } from "@/lib/ai";

const PERIODS = [
  { days: 1, label: "day", title: "Today" },
  { days: 7, label: "week", title: "This week" },
  { days: 30, label: "month", title: "This month" },
];

export default function AskPage() {
  const ready = providerReady();
  const active = activeProvider();
  const others = configuredProviders().filter((p) => p.id !== active.id);

  return (
    <>
      <PageTitle sub="Summaries are written from your own entries and nothing else — the model is told never to add anything the log does not say.">
        Assistant
      </PageTitle>

      <div className="mb-9">
        <ProviderStatus />
      </div>

      {!ready ? (
        <p className="rounded-xs border border-dashed border-line px-4 py-7 text-center text-muted">
          {active.label} is selected but{" "}
          <span className="text-body">{active.keyEnv}</span> is not set in{" "}
          <span className="text-body">.env.local</span>.
          <Meta className="mt-2 block">
            {others.length
              ? `Or set AI_PROVIDER to one that is ready: ${others.map((p) => p.id).join(", ")}.`
              : "Ollama needs no key — set AI_PROVIDER=ollama to run a model locally for free."}
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
