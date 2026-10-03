import Link from "next/link";

import { Dot, Meta } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Weekly entry counts as a sparkline. Monochrome, 1px bars, quiet weeks drawn
 * as stubs rather than skipped — a gap you can see is information.
 */
export function Spark({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const max = Math.max(1, ...data);
  const w = 3;
  const gap = 1;
  const h = 14;

  return (
    <svg
      viewBox={`0 0 ${data.length * (w + gap)} ${h}`}
      className={cn("h-[14px]", className)}
      style={{ width: data.length * (w + gap) }}
      preserveAspectRatio="none"
      aria-hidden
    >
      {data.map((n, i) => {
        const barH = n === 0 ? 1 : Math.max(2, (n / max) * h);
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={h - barH}
            width={w}
            height={barH}
            fill={n === 0 ? "#2a2a2a" : "#9a9a9a"}
          />
        );
      })}
    </svg>
  );
}

export type TreeRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  colour: string;
  parentId: string | null;
  openTasks: number;
  lastActivityAt: string | null;
};

function Line({
  row,
  selected,
  child,
  spark,
}: {
  row: TreeRow;
  selected: boolean;
  child?: boolean;
  spark?: number[];
}) {
  return (
    <Link
      href={`/subjects?s=${row.slug}`}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "rowlink flex items-center gap-2.5 border-l-2 py-2 pr-3",
        child ? "pl-7" : "pl-3",
        selected
          ? "border-l-accent bg-raised"
          : "border-l-transparent",
      )}
    >
      <Dot colour={row.colour} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate",
            selected ? "text-text" : child ? "text-muted" : "text-body",
          )}
        >
          {row.name}
        </span>
      </span>
      {spark && <Spark data={spark} className="shrink-0 opacity-80" />}
      <Meta className="w-5 shrink-0 text-right">{row.openTasks || ""}</Meta>
    </Link>
  );
}

/**
 * Names only — no kinds, no counts beyond the open tally, no timestamps. The
 * whole point of the left column is that the full set is scannable at once;
 * detail belongs in the panel beside it.
 */
export function SubjectTree({
  tree,
  selectedSlug,
  sparks,
}: {
  tree: { subject: TreeRow; children: TreeRow[] }[];
  selectedSlug?: string;
  sparks: Map<string, number[]>;
}) {
  return (
    <nav aria-label="Subjects" className="rounded-xs border border-line py-1">
      {tree.map(({ subject, children }) => (
        <div key={subject.id}>
          <Line
            row={subject}
            selected={subject.slug === selectedSlug}
            spark={sparks.get(subject.id)}
          />
          {children.map((c) => (
            <Line
              key={c.id}
              row={c}
              child
              selected={c.slug === selectedSlug}
              spark={sparks.get(c.id)}
            />
          ))}
        </div>
      ))}
      {!tree.length && (
        <p className="px-3 py-5 text-center text-[13px] text-muted">
          No subjects yet.
        </p>
      )}
    </nav>
  );
}
