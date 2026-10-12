import Link from "next/link";
import { notFound } from "next/navigation";

import { TaskForm } from "@/components/task-form";
import { SectionLabel } from "@/components/ui";
import { taskDetail } from "@/db/queries";
import { subjectList } from "@/db/queries";
import { nest } from "@/lib/subjects";

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, rows] = await Promise.all([taskDetail(id), subjectList()]);
  if (!detail) notFound();

  const options = nest(rows).flatMap(({ subject, children }) => [
    { id: subject.id, label: subject.name },
    ...children.map((c) => ({ id: c.id, label: `${subject.name} / ${c.name}` })),
  ]);

  return (
    <>
      <p className="mb-5">
        <Link
          href={`/t/${id}`}
          className="extlink text-[13px] text-faint hover:text-muted"
        >
          ← Back to the task
        </Link>
      </p>

      <SectionLabel>Edit task</SectionLabel>
      <TaskForm
        subjects={options}
        initial={{
          id: detail.task.id,
          title: detail.task.title,
          type: detail.task.type,
          status: detail.task.status,
          description: detail.task.description,
          subjectIds: detail.subjects.map((s) => s.id),
        }}
      />
    </>
  );
}
