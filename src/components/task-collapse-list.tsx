"use client";

import { useState } from "react";

import { TaskRow } from "@/components/task-row";
import { Empty, Meta } from "@/components/ui";
import type { SubjectChip } from "@/db/queries";

const VISIBLE = 5;

export type ListTask = {
  id: string;
  title: string;
  type: string;
  status: string;
  eventCount: number;
  lastActivityAt: Date | string;
  subjects: SubjectChip[];
};

/**
 * A subject's tasks: open ones first, the rest hidden behind a count.
 *
 * Expanding reveals them in place rather than navigating, because the question
 * being asked is "what else is there" — and an answer that costs a page load
 * does not get asked.
 */
export function TaskCollapseList({
  tasks,
  empty = "No tasks yet.",
}: {
  tasks: ListTask[];
  empty?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!tasks.length) return <Empty>{empty}</Empty>;

  const closed = (t: ListTask) =>
    t.status === "done" || t.status === "abandoned";

  // Open first, then finished — within each, the order given (recency).
  const ordered = [...tasks.filter((t) => !closed(t)), ...tasks.filter(closed)];
  const shown = expanded ? ordered : ordered.slice(0, VISIBLE);
  const hidden = ordered.length - shown.length;

  const openCount = ordered.filter((t) => !closed(t)).length;
  const doneCount = ordered.length - openCount;

  return (
    <>
      <p className="mb-2">
        <Meta>
          {openCount} open
          {doneCount > 0 && ` · ${doneCount} finished`}
          {` · ${ordered.length} in total`}
        </Meta>
      </p>

      <div className="divide-y divide-line overflow-hidden rounded-xs border border-line">
        {shown.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>

      {(hidden > 0 || expanded) && (
        <div className="mt-2.5 flex items-center gap-4">
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="qbtn"
            >
              Show {hidden} more task{hidden > 1 ? "s" : ""}
            </button>
          )}
          {expanded && ordered.length > VISIBLE && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-[13px] text-faint transition-colors hover:text-text"
            >
              Show fewer
            </button>
          )}
        </div>
      )}
    </>
  );
}
