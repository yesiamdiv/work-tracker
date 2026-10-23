import Link from "next/link";

import { savedAnswers } from "@/app/ai-actions";
import { AnswerHistory } from "@/components/answer-history";
import { Meta, PageTitle, SectionLabel } from "@/components/ui";

/**
 * Everything ever asked of the assistant.
 *
 * Its own page rather than a section on /ask, which already carries the
 * provider line, the filters, the ask box and prompt-to-create — a list you
 * want to go back and search through does not belong at the bottom of that.
 */
export default async function AnswersPage() {
  const items = await savedAnswers(200);

  const questions = items.filter((a) => a.question).length;
  const summaries = items.length - questions;

  return (
    <>
      <PageTitle sub="Every question and summary, with the filters and the model behind each one. Reopening a selection rebuilds the filters it was drawn from, so an answer can be re-derived rather than only re-read.">
        Answers
      </PageTitle>

      <SectionLabel
        right={
          <Link
            href="/ask"
            className="extlink text-[13px] text-muted hover:text-text"
          >
            Ask something new
          </Link>
        }
      >
        {items.length
          ? `${items.length} kept`
          : "Nothing asked yet"}
      </SectionLabel>

      {items.length > 0 && (
        <p className="mb-3">
          <Meta>
            {questions} question{questions === 1 ? "" : "s"} · {summaries}{" "}
            summar{summaries === 1 ? "y" : "ies"}
          </Meta>
        </p>
      )}

      <AnswerHistory items={items} />
    </>
  );
}
