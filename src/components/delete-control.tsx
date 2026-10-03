"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Meta } from "@/components/ui";

/**
 * Two-step delete: the first click asks, the second does it.
 *
 * No modal dialog — a confirm step inline keeps the thing being deleted visible
 * while you decide. `impact` spells out what else goes, because the cascades
 * here are not obvious from the button.
 */
export function DeleteControl({
  onDelete,
  loadImpact,
  what,
  redirectTo,
  label = "Delete",
}: {
  onDelete: () => Promise<void>;
  loadImpact?: () => Promise<string | null>;
  what: string;
  redirectTo?: string;
  label?: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [impact, setImpact] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function ask() {
    setAsking(true);
    setError(null);
    if (loadImpact) {
      start(async () => {
        try {
          setImpact(await loadImpact());
        } catch {
          setImpact(null);
        }
      });
    }
  }

  function confirm() {
    start(async () => {
      try {
        await onDelete();
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete");
        setAsking(false);
      }
    });
  }

  if (!asking) {
    return (
      <button
        onClick={ask}
        className="text-[13px] text-faint transition-colors hover:text-text"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <Meta className="text-body">
        Delete {what}?{impact ? ` ${impact}` : ""}
      </Meta>
      <button
        onClick={confirm}
        disabled={pending}
        className="text-[13px] text-text underline decoration-line-strong underline-offset-[3px] transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        onClick={() => setAsking(false)}
        disabled={pending}
        className="text-[13px] text-faint transition-colors hover:text-muted"
      >
        Cancel
      </button>
      {error && <Meta className="text-body">{error}</Meta>}
    </span>
  );
}
