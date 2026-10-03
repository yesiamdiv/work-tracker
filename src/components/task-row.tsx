import Link from "next/link";

import type { SubjectChip } from "@/db/queries";
import { Chevron, Dot, Meta } from "@/components/ui";
import { ago } from "@/lib/utils";

const STATUS_WORD: Record<string, string> = {
  planned: "planned",
  in_progress: "in progress",
  blocked: "blocked",
  waiting: "waiting",
  done: "done",
  abandoned: "dropped",
};

export function TaskRow({
  task,
}: {
  task: {
    id: string;
    title: string;
    type: string;
    status: string;
    eventCount: number;
    lastActivityAt: Date | string;
    subjects: SubjectChip[];
  };
}) {
  const stalled = task.status === "blocked" || task.status === "waiting";

  return (
    <Link href={`/t/${task.id}`} className="rowlink flex items-center gap-3 px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] text-text">{task.title}</span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {task.subjects.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <Dot colour={s.colour} />
              <Meta className="text-muted">
                {s.parentName ? `${s.parentName} / ${s.name}` : s.name}
              </Meta>
            </span>
          ))}
          <Meta>· {task.type.replace(/_/g, " ")}</Meta>
          {stalled && <Meta className="text-muted">· {STATUS_WORD[task.status]}</Meta>}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <Meta className="block text-muted">
          {task.eventCount} {task.eventCount === 1 ? "entry" : "entries"}
        </Meta>
        <Meta className="block">{ago(task.lastActivityAt)} ago</Meta>
      </span>

      <Chevron />
    </Link>
  );
}
