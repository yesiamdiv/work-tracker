"use client";

import { useTransition } from "react";

import { setTaskStatus } from "@/app/actions";
import type { tasks } from "@/db/schema";

type Status = (typeof tasks.status.enumValues)[number];

const STATUSES: Status[] = [
  "planned",
  "in_progress",
  "blocked",
  "waiting",
  "done",
  "abandoned",
];

/** A bare select. No coloured pill, no dropdown library. */
export function TaskStatus({
  taskId,
  status,
}: {
  taskId: string;
  status: Status;
}) {
  const [pending, start] = useTransition();

  return (
    <select
      aria-label="Task status"
      value={status}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await setTaskStatus(taskId, e.target.value as Status);
        })
      }
      /* Styled as a control, not prose: borderless 11px faint text read as a
         static label, so nobody realised the status could be changed here. */
      className="cursor-pointer rounded-xs border border-line bg-raised px-2 py-1 text-[13px] text-body transition-colors hover:border-line-strong focus:border-line-strong disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s} className="bg-bg">
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
