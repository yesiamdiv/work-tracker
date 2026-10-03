"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Label, Meta } from "@/components/ui";
import { KIND_LABEL } from "@/lib/capture";

const KINDS = Object.entries(KIND_LABEL);
const OUTCOMES = ["pass", "fail", "partial", "inconclusive"];
const RANGES = [
  { v: "", label: "Any time" },
  { v: "7", label: "Last 7 days" },
  { v: "30", label: "Last 30 days" },
  { v: "90", label: "Last 90 days" },
  { v: "365", label: "Last year" },
];

/**
 * Filters write to the URL rather than to local state, so any narrowed view is
 * a link you can bookmark or share with yourself later.
 */
export function StreamFilters({
  subjects,
}: {
  subjects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  // Keep the box in step when the URL changes under us (back button, Clear all).
  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  function apply(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const s = next.toString();
    router.push(s ? `/stream?${s}` : "/stream");
  }

  const selectCls =
    "cursor-pointer rounded-xs border border-line bg-raised px-2.5 py-2 text-[13px] text-body transition-colors hover:border-line-strong focus:border-line-strong";

  return (
    <div className="mb-7 rounded-xs border border-line p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q });
        }}
      >
        <Label>Search the text of your entries</Label>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. reconnect, sleep current, ACME-4421"
            className="w-full rounded-xs border border-line bg-raised px-3 py-2.5 text-body transition-colors focus:border-line-strong"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xs border border-line px-4 text-body transition-colors hover:border-line-strong hover:bg-raised hover:text-text"
          >
            Search
          </button>
        </div>
      </form>

      <div className="mt-4 border-t border-line pt-4">
        <Label>Narrow it down</Label>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Subject"
            value={params.get("subject") ?? ""}
            onChange={(e) => apply({ subject: e.target.value })}
            className={selectCls}
          >
            <option value="" className="bg-bg">
              Any subject
            </option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id} className="bg-bg">
                {s.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Entry kind"
            value={params.get("kind") ?? ""}
            onChange={(e) => apply({ kind: e.target.value })}
            className={selectCls}
          >
            <option value="" className="bg-bg">
              Any kind
            </option>
            {KINDS.map(([v, label]) => (
              <option key={v} value={v} className="bg-bg">
                {label}
              </option>
            ))}
          </select>

          <select
            aria-label="Outcome"
            value={params.get("outcome") ?? ""}
            onChange={(e) => apply({ outcome: e.target.value })}
            className={selectCls}
          >
            <option value="" className="bg-bg">
              Any outcome
            </option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o} className="bg-bg">
                {o}
              </option>
            ))}
          </select>

          <select
            aria-label="Time range"
            value={params.get("days") ?? ""}
            onChange={(e) => apply({ days: e.target.value })}
            className={selectCls}
          >
            {RANGES.map((r) => (
              <option key={r.v} value={r.v} className="bg-bg">
                {r.label}
              </option>
            ))}
          </select>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xs border border-line px-2.5 py-2">
            <input
              type="checkbox"
              checked={params.get("refs") === "1"}
              onChange={(e) => apply({ refs: e.target.checked ? "1" : "" })}
              className="size-3.5 accent-neutral-400"
            />
            <Meta className="text-body">Has a link</Meta>
          </label>
        </div>
      </div>
    </div>
  );
}
