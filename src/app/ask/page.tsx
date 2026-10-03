import { AiCompose } from "@/components/ai-compose";
import { AiSummary } from "@/components/ai-summary";
import { Meta, PageTitle, SectionLabel } from "@/components/ui";
import { summarise } from "@/app/ai-actions";
import { aiConfigured } from "@/lib/ai";

const PERIODS = [
  { days: 1, label: "day", title: "Today" },
  { days: 7, label: "week", title: "This week" },
  { days: 30, label: "month", title: "This month" },
];

export default function AskPage() {
  if (!aiConfigured()) {
    return (
      <>
        <PageTitle>Claude</PageTitle>
        <p className="rounded-xs border border-dashed border-line px-4 py-7 text-center text-muted">
          Set <span className="text-body">ANTHROPIC_API_KEY</span> in
          <span className="text-body"> .env.local</span> and restart to turn this
          on.
          <br />
          <Meta className="mt-2 block">
            Get a key from console.anthropic.com. Nothing else here needs it.
          </Meta>
        </p>
      </>
    );
  }

  return (
    <>
      <PageTitle sub="Summaries are written from your own entries, nothing else. Claude is told never to add anything the log does not say.">
        Claude
      </PageTitle>

      <SectionLabel hint="Written on demand, not on page load — each one is a real request.">
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
              return summarise({ type: "period", days: p.days, label: p.label });
            }}
          />
        ))}
      </div>

      <SectionLabel hint="For when you would rather describe the work than fill in forms.">
        Set up new work from a note
      </SectionLabel>
      <AiCompose />
    </>
  );
}
