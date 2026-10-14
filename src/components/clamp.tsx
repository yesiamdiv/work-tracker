"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Hides anything past a fixed height, with a control to open it.
 *
 * The toggle only appears when the content genuinely overflows, which has to
 * be measured rather than guessed from the character count — a single pasted
 * log line can wrap to ten rows while a short paragraph with newlines does
 * not. Measured again on resize, since the wrap point moves with the column.
 *
 * Starts capped and lifts the cap once measurement shows the content fits.
 * The other way round — render in full, then collapse — makes a 500-line entry
 * flash at full height on every page load, which is the exact case this
 * exists for.
 */
export function Clamp({
  children,
  maxHeight = 180,
  className,
  moreLabel = "Show more",
  lessLabel = "Show less",
}: {
  children: React.ReactNode;
  /** Collapsed height in pixels. */
  maxHeight?: number;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // `null` until measured: capped on the way in, so nothing flashes open.
  const [overflows, setOverflows] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    /*
     * `scrollHeight` reports the full content height even through
     * `overflow: hidden`, so nothing needs un-capping to measure it. Mutating
     * the element's own style here would feed the ResizeObserver below and
     * risk looping.
     *
     * The few pixels of tolerance stop rounding from producing a toggle that
     * reveals nothing.
     */
    const measure = () => setOverflows(el.scrollHeight > maxHeight + 4);

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxHeight, children]);

  const collapsed = overflows !== false && !open;

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={box}
          style={collapsed ? { maxHeight } : undefined}
          className={collapsed ? "overflow-hidden" : undefined}
        >
          {children}
        </div>

        {/* Fades the cut edge, so it reads as "continues" not "ends here". */}
        {collapsed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg"
          />
        )}
      </div>

      {overflows === true && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            "mt-1.5 text-[13px] text-muted underline decoration-line underline-offset-[3px]",
            "transition-colors hover:text-text",
          )}
        >
          {open ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
}
