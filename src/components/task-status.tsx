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
      value={status}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await setTaskStatus(taskId, e.target.value as Status);
        })
      }
      className="-ml-1 cursor-pointer border-none bg-transparent px-1 text-[11px] text-faint transition-colors hover:text-muted disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s} className="bg-bg">
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
