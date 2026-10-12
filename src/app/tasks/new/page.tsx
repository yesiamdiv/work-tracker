import { TaskForm } from "@/components/task-form";
import { SectionLabel } from "@/components/ui";
import { subjectList } from "@/db/queries";
import { nest } from "@/lib/subjects";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject: preselectId } = await searchParams;
  const rows = await subjectList();

  // Flatten to "Parent / Child" labels so the picker stays one list.
  const options = nest(rows).flatMap(({ subject, children }) => [
    { id: subject.id, label: subject.name },
    ...children.map((c) => ({ id: c.id, label: `${subject.name} / ${c.name}` })),
  ]);

  return (
    <>
      <SectionLabel>New task</SectionLabel>
      <TaskForm subjects={options} preselect={preselectId} />
    </>
  );
}
