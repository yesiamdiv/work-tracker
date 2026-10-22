"use client";

import { useState, useTransition } from "react";

import { askAboutEntries, type AskFilters } from "@/app/ai-actions";
import { Alert, Button, Label, Meta, Textarea } from "@/components/ui";

const EXAMPLES = [
  "What is still outstanding?",
  "Which bugs did I raise, and were any fixed?",
  "What did I conclude about the BLE reconnect problem?",
  "List every ticket mentioned, with what happened to it.",
];

/**
 * Asks a question about whatever the filters have selected, or summarises it.
 *
 * The filters do the retrieval, which is why this needs no vector index: the
 * person narrows the log to the part they mean, and the whole of that part
 * goes to the model.
 */
export function AskPanel({
  filters,
  matched,
  filtered,
}: {
  filters: AskFilters;
  matched: number;
  /** Whether any filter is set, as opposed to the whole log. */
  filtered: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(withQuestion: boolean) {
    if (pending) return;
    if (withQuestion && !question.trim()) return;
    setError(null);
    setAnswer(null);
    setNote(null);

    start(async () => {
      const result = await askAboutEntries({
        filters,
        question: withQuestion ? question : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAnswer(result.data.answer);
      setNote(
        result.data.dropped
          ? `Read ${result.data.used} entries. ${result.data.dropped} were left out — too much text for one request, so narrow the filters for a complete answer.`
          : `Read all ${result.data.used} entries in the selection.`,
      );
    });
  }

  return (
    <section className="rounded-xs border border-line p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <Label>Ask about these entries</Label>
        <Meta className={matched ? "text-muted" : "text-body"}>
          {matched} {matched === 1 ? "entry" : "entries"} selected
          {!filtered && " — the whole log"}
        </Meta>
      </div>

      <Textarea
        rows={2}
        value={question}
        disabled={pending || !matched}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="What do you want to know about them?"
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          onClick={() => run(true)}
          disabled={pending || !matched || !question.trim()}
        >
          {pending ? "Reading…" : "Ask"}
        </Button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending || !matched}
          className="text-[13px] text-muted underline decoration-line underline-offset-[3px] transition-colors hover:text-text disabled:opacity-40"
        >
          Or just summarise them
        </button>
        {!matched && <Meta>Nothing matches the filters above.</Meta>}
      </div>

      {!answer && !pending && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setQuestion(e)}
              className="rounded-xs border border-line px-2 py-1 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:bg-raised hover:text-text"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      {answer && (
        <div className="mt-4 border-t border-line pt-3.5">
          <p className="whitespace-pre-wrap text-body">{answer}</p>
          {note && <Meta className="mt-3 block">{note}</Meta>}
        </div>
      )}
    </section>
  );
}
