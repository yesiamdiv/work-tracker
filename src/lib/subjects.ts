import { eq, or } from "drizzle-orm";

import { db } from "@/db";
import { withRetry } from "@/db/retry";
import { subjects } from "@/db/schema";

/**
 * A subject id expanded to itself plus its children.
 *
 * Filtering by a parent must include everything beneath it: filter "ClientX"
 * and you get ClientX firmware and ClientX Android app too, without needing to
 * know those children exist. Depth is capped at two, so one query suffices —
 * no recursive CTE.
 *
 * Every subject-filtered query goes through this.
 */
export async function subjectFilterIds(subjectId: string): Promise<string[]> {
  const rows = await withRetry("subjectFilterIds", () =>
    db
      .select({ id: subjects.id })
      .from(subjects)
      .where(or(eq(subjects.id, subjectId), eq(subjects.parentId, subjectId))),
  );

  // A parent with no children still filters on itself.
  return rows.length ? rows.map((r) => r.id) : [subjectId];
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "subject"
  );
}

/** Parents first, each followed by its children — the shape the list renders. */
export function nest<T extends { id: string; parentId: string | null }>(
  rows: T[],
): { subject: T; children: T[] }[] {
  const byParent = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }
  return rows
    .filter((r) => !r.parentId)
    .map((subject) => ({ subject, children: byParent.get(subject.id) ?? [] }));
}
