import Link from "next/link";

import { Dot, Meta } from "@/components/ui";
import { cn } from "@/lib/utils";

export type LinkableSubject = {
  id?: string;
  name: string;
  slug: string;
  colour: string;
  parentName?: string | null;
};

/** "Parent / Child" where there is a parent, so a part is never ambiguous. */
export function subjectName(s: LinkableSubject): string {
  return s.parentName ? `${s.parentName} / ${s.name}` : s.name;
}

/**
 * A subject as a chip linking to it.
 *
 * `outlined` suits a list row where it has to read as a thing you can click;
 * plain suits a dense footer where a dot and a name are enough.
 */
export function SubjectLink({
  subject,
  outlined = true,
}: {
  subject: LinkableSubject;
  outlined?: boolean;
}) {
  const label = subjectName(subject);
  return (
    <Link
      href={`/s/${subject.slug}`}
      title={`Subject: ${label}`}
      className={cn(
        "inline-flex items-center gap-1.5 text-[12.5px] transition-colors",
        outlined
          ? "rounded-xs border border-line px-1.5 py-[1px] text-muted hover:border-line-strong hover:bg-raised hover:text-text"
          : "text-faint hover:text-text",
      )}
    >
      <Dot colour={subject.colour} />
      {label}
    </Link>
  );
}

/**
 * Shown when nothing owns a task. Says so outright and offers the fix — the
 * blank it replaced was indistinguishable from the subject simply not being
 * rendered, which hid the fact that no task had one.
 */
export function NoSubjectLink({ taskId }: { taskId: string }) {
  return (
    <Link
      href={`/t/${taskId}/edit`}
      title="Not linked to any subject — click to add one"
      className="rounded-xs border border-dashed border-line px-1.5 py-[1px] text-[12.5px] text-faint transition-colors hover:border-line-strong hover:text-muted"
    >
      No subject
    </Link>
  );
}

/** A task's subjects, or the fallback. Caps the list where space is tight. */
export function SubjectLinks({
  subjects,
  taskId,
  limit,
  outlined = true,
}: {
  subjects: LinkableSubject[];
  taskId: string;
  limit?: number;
  outlined?: boolean;
}) {
  if (!subjects.length) return <NoSubjectLink taskId={taskId} />;

  const shown = limit ? subjects.slice(0, limit) : subjects;
  const rest = subjects.length - shown.length;

  return (
    <>
      {shown.map((s) => (
        <SubjectLink key={s.slug} subject={s} outlined={outlined} />
      ))}
      {rest > 0 && <Meta>+{rest} more</Meta>}
    </>
  );
}
