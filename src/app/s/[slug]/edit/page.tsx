import Link from "next/link";
import { notFound } from "next/navigation";

import { SubjectForm } from "@/components/subject-form";
import { Meta, SectionLabel } from "@/components/ui";
import { subjectBySlug, subjectList } from "@/db/queries";

export default async function EditSubjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [subject, rows] = await Promise.all([
    subjectBySlug(slug),
    subjectList(),
  ]);
  if (!subject) notFound();

  // Only top-level subjects may be parents — the two-level cap, in the UI.
  const parents = rows
    .filter((r) => !r.parentId && r.id !== subject.id)
    .map((r) => ({ id: r.id, name: r.name }));

  const hasChildren = rows.some((r) => r.parentId === subject.id);

  return (
    <>
      <p className="mb-5">
        <Link
          href={`/s/${slug}`}
          className="extlink text-[13px] text-faint hover:text-muted"
        >
          ← Back to the subject
        </Link>
      </p>

      <SectionLabel
        hint={
          hasChildren
            ? "This subject has parts under it, so it cannot itself be moved under another — that would be three levels."
            : undefined
        }
      >
        Edit subject
      </SectionLabel>

      <SubjectForm
        parents={hasChildren ? [] : parents}
        initial={{
          id: subject.id,
          name: subject.name,
          kind: subject.kind,
          parentId: subject.parentId,
          colour: subject.colour,
          description: subject.description,
        }}
      />

      <p className="mt-7 max-w-md">
        <Meta>
          The web address stays <span className="text-body">/s/{slug}</span>{" "}
          after a rename, so existing links keep working.
        </Meta>
      </p>
    </>
  );
}
