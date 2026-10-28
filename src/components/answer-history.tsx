"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { deleteAnswer } from "@/app/ai-actions";
import { Clamp } from "@/components/clamp";
import { Empty, Meta } from "@/components/ui";
import type { Answer } from "@/db/schema";
import { dayLabel, timeLabel } from "@/lib/utils";

/** Rebuilds the link that reproduces the selection an answer was drawn from. */
function filterLink(filters: Answer["filters"]): string | null {
  if (!filters || !Object.keys(filters).length) return "/ask";
  const qs = new URLSearchParams(filters).toString();
  return qs ? `/ask?${qs}` : "/ask";
}

/**
 * Previously asked questions and their answers.
 *
 * Kept because an answer worked out once is one you will want again, and
 * because knowing which filters and which model produced it is what makes it
 * worth trusting later. Long answers are capped like entries are.
 */
export function AnswerHistory({ items }: { items: Answer[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!items.length) {
    return <Empty>Nothing asked yet. Answers are kept here once you do.</Empty>;
  }

  return (
    <div className="space-y-3">
      {items.map((a) => {
        const link = filterLink(a.filters);
        return (
          <article key={a.id} className="rounded-xs border border-line p-4">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Meta className="text-muted">
                {dayLabel(a.createdAt)} {timeLabel(a.createdAt)}
              </Meta>
              <Meta>
                · {a.entriesRead ?? 0} entries · {a.provider}
                {a.model ? ` · ${a.model}` : ""}
              </Meta>
              {a.truncated === 1 && (
                <Meta className="text-body">· answer was cut off</Meta>
              )}
              <span className="ml-auto flex items-center gap-3">
                {link && (
                  <Link
                    href={link}
                    className="extlink text-[13px] text-muted hover:text-text"
                  >
                    Reopen this selection
                  </Link>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await deleteAnswer(a.id);
                      router.refresh();
                    })
                  }
                  className="text-[13px] text-faint transition-colors hover:text-text disabled:opacity-50"
                >
                  Delete
                </button>
              </span>
            </div>

            <p className="text-[15px] text-text">
              {a.question ?? "Summary of the selection"}
            </p>
            {a.scope && <Meta className="mt-0.5 block">{a.scope}</Meta>}

            <div className="mt-2.5 border-t border-line pt-2.5">
              <Clamp maxHeight={150} moreLabel="Show the whole answer">
                <p className="whitespace-pre-wrap break-words text-body">{a.answer}</p>
              </Clamp>
            </div>
          </article>
        );
      })}
    </div>
  );
}
