"use client";

import { useState, useTransition } from "react";

import { improveEntry } from "@/app/ai-actions";
import { Meta } from "@/components/ui";

/**
 * Offers a tightened rewrite of what's been typed.
 *
 * Always shown as a before-and-after with an explicit Use it — a box that
 * silently rewrites what you typed is a box you stop trusting, and trust in
 * the capture box is the whole app.
 */
export function ImproveButton({
  text,
  onAccept,
}: {
  text: string;
  onAccept: (improved: string) => void;
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ready = text.trim().length > 10;

  function go() {
    setError(null);
    setSuggestion(null);
    start(async () => {
      const result = await improveEntry(text);
      if (result.ok) setSuggestion(result.data);
      else setError(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={pending || !ready}
        title={ready ? undefined : "Type a bit more first"}
        className="qbtn"
      >
        {pending ? "Improving…" : "Improve wording"}
      </button>

      {error && <Meta className="text-body">{error}</Meta>}

      {suggestion && (
        <div className="mt-3 w-full rounded-xs border border-line p-3.5">
          <Meta className="mb-1.5 block text-muted">Suggested rewrite</Meta>
          <p className="whitespace-pre-wrap break-words text-body">{suggestion}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                onAccept(suggestion);
                setSuggestion(null);
              }}
              className="qbtn-strong"
            >
              Use it
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="text-[13px] text-faint transition-colors hover:text-muted"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}
    </>
  );
}
