import Link from "next/link";

import type { SubjectChip } from "@/db/queries";
import { SubjectLinks } from "@/components/subject-link";
import { Chevron, Meta } from "@/components/ui";
import { ago } from "@/lib/utils";

const STATUS_WORD: Record<string, string> = {
  planned: "planned",
  in_progress: "in progress",
  blocked: "blocked",
  waiting: "waiting",
  done: "done",
  abandoned: "dropped",
};

/**
 * One task in a list.
 *
 * The whole row navigates to the task, but the subject chips are their own
 * links — so the row uses a stretched link (the title's `after:` overlay)
 * rather than wrapping everything in one `<a>`, which cannot legally contain
 * other links.
 */
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
    <div className="rowlink group relative flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <Link
          href={`/t/${task.id}`}
          className="block truncate text-[16px] text-text after:absolute after:inset-0 after:content-['']"
        >
          {task.title}
        </Link>

        <div className="relative z-10 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* What owns this task — stated either way, so "nothing" is visible. */}
          <SubjectLinks subjects={task.subjects} taskId={task.id} />

          <Meta>· {task.type.replace(/_/g, " ")}</Meta>
          {stalled && (
            <Meta className="text-muted">· {STATUS_WORD[task.status]}</Meta>
          )}
        </div>
      </div>

      <span className="shrink-0 text-right">
        <Meta className="block text-muted">
          {task.eventCount} {task.eventCount === 1 ? "entry" : "entries"}
        </Meta>
        <Meta className="block">{ago(task.lastActivityAt)} ago</Meta>
      </span>

      <Chevron />
    </div>
  );
}
