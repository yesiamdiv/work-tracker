import { SubjectForm } from "@/components/subject-form";
import { SectionLabel } from "@/components/ui";
import { subjectList } from "@/db/queries";

export default async function NewSubjectPage() {
  const rows = await subjectList();
  // Only top-level subjects may be parents — the depth cap, surfaced in the UI.
  const parents = rows
    .filter((r) => !r.parentId)
    .map((r) => ({ id: r.id, name: r.name }));

  return (
    <>
      <SectionLabel>New subject</SectionLabel>
      <SubjectForm parents={parents} />
    </>
  );
}
