"use client";

import { useState, useTransition } from "react";

import type { AiResult } from "@/app/ai-actions";
import { Button, Label, Meta } from "@/components/ui";

/**
 * Asks for a summary on demand and shows it in place.
 *
 * Never generated on page load: it costs money and takes seconds, and a
 * summary nobody asked for is a summary nobody reads.
 */
export function AiSummary({
  run,
  cached,
  cachedAt,
  title = "Summary",
  cta = "Summarise",
}: {
  run: () => Promise<AiResult<string>>;
  cached?: string | null;
  cachedAt?: Date | string | null;
  title?: string;
  cta?: string;
}) {
  const [text, setText] = useState<string | null>(cached ?? null);
  const [stale, setStale] = useState(!!cached);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go() {
    setError(null);
    start(async () => {
      const result = await run();
      if (result.ok) {
        setText(result.data);
        setStale(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className="rounded-xs border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Label>{title}</Label>
        <button
          onClick={go}
          disabled={pending}
          className="text-[13px] text-muted underline decoration-line underline-offset-[3px] transition-colors hover:text-text disabled:opacity-50"
        >
          {pending ? "Thinking…" : text ? "Redo" : cta}
        </button>
      </div>

      {text ? (
        <>
          <div className="mt-1 space-y-1.5 whitespace-pre-wrap text-body">
            {text}
          </div>
          <Meta className="mt-3 block">
            {stale && cachedAt
              ? `Written ${new Date(cachedAt).toLocaleString("en-GB")} — redo to refresh`
              : "Written just now by Claude from your entries"}
          </Meta>
        </>
      ) : (
        !pending && (
          <Meta className="mt-1 block">
            {error ?? "Not generated yet."}
          </Meta>
        )
      )}

      {error && text && <Meta className="mt-2 block text-body">{error}</Meta>}
    </section>
  );
}
