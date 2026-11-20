"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Meta } from "@/components/ui";
import { cn } from "@/lib/utils";

export type PickerOption = {
  id: string;
  label: string;
  /** Shown dimmed and sorted last — a finished task, say. */
  muted?: boolean;
};

/**
 * Several of something, chosen by name.
 *
 * A `<select multiple>` would have been fewer lines, but it is close to
 * unusable: ctrl-clicking is a secret, and on a phone it renders as a stubby
 * scroll box that loses the selection on a mistouch. This is a search field
 * and a list of checkboxes, which is the same thing said plainly — and it has
 * to be searchable regardless, because the task list is already long enough
 * that scanning it is slower than typing three letters of it.
 */
export function MultiPicker({
  options,
  value,
  onChange,
  anyLabel,
  noun,
  disabled,
}: {
  options: PickerOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** What "nothing selected" means here — "Any subject". */
  anyLabel: string;
  /** For the count, pluralised by adding an s. */
  noun: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const byId = useMemo(
    () => new Map(options.map((o) => [o.id, o])),
    [options],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    // Selected first, so what you have chosen never scrolls out of reach.
    const chosen = hit.filter((o) => value.includes(o.id));
    const rest = hit.filter((o) => !value.includes(o.id));
    return [...chosen, ...rest];
  }, [options, query, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) field.current?.focus();
    else setQuery("");
  }, [open]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  // One choice reads better by name than as "1 subject".
  const summary =
    value.length === 0
      ? anyLabel
      : value.length === 1
        ? (byId.get(value[0])?.label ?? `1 ${noun}`)
        : `${value.length} ${noun}s`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full max-w-full items-center gap-2 rounded-xs border bg-raised px-2.5 py-2 text-left text-[13px]",
          "transition-colors active:border-line-strong active:bg-raised-hi disabled:cursor-not-allowed disabled:opacity-40",
          "hover:border-line-strong",
          value.length ? "border-line-strong text-text" : "border-line text-body",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <span aria-hidden className="shrink-0 text-faint">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1.5 w-[min(22rem,calc(100vw-3rem))] rounded-xs border border-line-strong bg-bg">
          <div className="border-b border-line p-2">
            <input
              ref={field}
              aria-label={`Search ${noun}s`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${noun}s`}
              className="w-full rounded-xs border border-line bg-raised px-2.5 py-1.5 text-[13px] transition-colors focus:border-line-strong"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 && (
              <p className="px-3 py-2 text-[13px] text-faint">Nothing matches.</p>
            )}
            {matches.map((o) => {
              const on = value.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  aria-pressed={on}
                  className={cn(
                    "rowlink flex w-full items-start gap-2.5 px-3 py-2 text-left text-[13px]",
                    on ? "text-text" : o.muted ? "text-faint" : "text-body",
                  )}
                >
                  {/*
                    Drawn rather than a real checkbox: a native one cannot be
                    coloured to match hairlines, and this row is the control
                    anyway, so the box is only ever a readout.
                  */}
                  <span
                    aria-hidden
                    className={cn(
                      "mt-[3px] grid size-3.5 shrink-0 place-items-center rounded-[2px] border text-[10px] leading-none",
                      on ? "border-line-strong bg-raised-hi text-text" : "border-line",
                    )}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">{o.label}</span>
                  {o.muted && <Meta className="shrink-0">done</Meta>}
                </button>
              );
            })}
          </div>

          {value.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
              <Meta>
                {value.length} of {options.length}
              </Meta>
              <button type="button" onClick={() => onChange([])} className="qbtn">
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
