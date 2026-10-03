import { cn } from "@/lib/utils";

/**
 * The whole component vocabulary.
 *
 * Rules: no weight above 500, no shadows, no coloured fills. But legibility
 * beats quiet — interactive things must look interactive, and hierarchy must be
 * stated rather than implied by indentation alone.
 */

/** The name of the page. */
export function PageTitle({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-[22px] leading-tight text-text">{children}</h1>
      {sub && <p className="mt-2 text-muted">{sub}</p>}
    </div>
  );
}

/** A heading over a list. Bigger and brighter than the old 11px version. */
export function SectionLabel({
  children,
  right,
  hint,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3 mt-2">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[13px] uppercase tracking-[0.1em] text-muted">
          {children}
        </h2>
        {right}
      </div>
      {hint && <p className="mt-1.5 text-[13px] text-faint">{hint}</p>}
    </div>
  );
}

/** The chevron that marks a row as navigable. */
export function Chevron() {
  return (
    <span aria-hidden className="chev shrink-0 text-[17px] leading-none">
      ›
    </span>
  );
}

/** 7px dot — subject identity. Bigger than before so it's actually visible. */
export function Dot({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-[7px] shrink-0 rounded-full"
      style={{ background: colour }}
    />
  );
}

export function Chip({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs border border-line px-2 py-[2px] text-[12.5px] text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Meta({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-[12.5px] text-faint tnum", className)}>
      {children}
    </span>
  );
}

export function Button({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-xs border border-line px-3.5 py-2 text-body transition-colors",
        "hover:border-line-strong hover:bg-raised hover:text-text",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xs border border-line bg-raised px-3 py-2.5 text-body",
        "transition-colors focus:border-line-strong",
        className,
      )}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "cursor-pointer rounded-xs border border-line bg-raised px-2.5 py-2 text-body",
        "transition-colors hover:border-line-strong focus:border-line-strong",
        className,
      )}
    />
  );
}

/** Field label — stated plainly, so no form control is a guess. */
export function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-2 block text-[13px] text-muted">{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xs border border-dashed border-line px-4 py-7 text-center text-muted">
      {children}
    </p>
  );
}

/** A hairline-separated list, boxed so its extent is obvious. */
export function Rows({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-line overflow-hidden rounded-xs border border-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** External link: always underlined, so it never hides inside prose. */
export function ExtLink({
  href,
  children,
  title,
  className,
}: {
  href: string;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={cn("extlink text-[13px] text-muted", className)}
    >
      {children}
      <span aria-hidden className="ml-1 text-[11px] opacity-60">
        ↗
      </span>
    </a>
  );
}
