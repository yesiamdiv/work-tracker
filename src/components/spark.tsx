import { cn } from "@/lib/utils";

/**
 * A bare bar chart — counts per period, no axes, no legend.
 *
 * Quiet periods are drawn as dim stubs rather than skipped: a gap you can see
 * is information, a gap that is missing is just confusing.
 *
 * One implementation; the stat tiles and the subject tree had their own.
 */
export function Spark({
  data,
  height = 14,
  barWidth = 3,
  gap = 1,
  fullWidth = false,
  className,
  label,
}: {
  data: number[];
  height?: number;
  barWidth?: number;
  gap?: number;
  /** Stretch to the container instead of sizing to the bars. */
  fullWidth?: boolean;
  className?: string;
  label?: string;
}) {
  const max = Math.max(1, ...data);
  const width = data.length * (barWidth + gap);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn(fullWidth && "w-full", className)}
      style={{ height, ...(fullWidth ? {} : { width }) }}
      preserveAspectRatio="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {data.map((n, i) => {
        const barHeight = n === 0 ? 1 : Math.max(2, (n / max) * height);
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            fill={n === 0 ? "#2a2a2a" : "#9a9a9a"}
          />
        );
      })}
    </svg>
  );
}
