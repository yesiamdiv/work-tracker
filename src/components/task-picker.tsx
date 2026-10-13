"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTask } from "@/app/actions";
import { Meta } from "@/components/ui";
import { cn } from "@/lib/utils";

export type PickerTask = { id: string; title: string };

/**
 * Picks the task an entry lands on — searchable, and able to create one.
 *
 * Replaces a plain `<select>`, which could only ever offer tasks that already
 * existed. That made the first task of all unreachable from the one screen you
 * start on, which is the wrong way round: the capture box is the thing you
 * reach for, so starting new work has to be possible from inside it.
 */
export function TaskPicker({
  tasks,
  value,
  onChange,
  onCreated,
}: {
  tasks: PickerTask[];
  value?: string;
  onChange: (id: string) => void;
  onCreated?: (task: PickerTask) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const selected = tasks.find((t) => t.id === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [tasks, query]);

  // Offer to create whenever the typed text isn't already a task's exact title.
  const canCreate =
    query.trim().length >= 3 &&
    !tasks.some((t) => t.title.toLowerCase() === query.trim().toLowerCase());

  const rows = canCreate ? matches.length + 1 : matches.length;

  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function create() {
    const title = query.trim();
    if (!title || pending) return;
    setError(null);
    start(async () => {
      try {
        const task = await createTask({ title });
        onCreated?.({ id: task.id, title: task.title });
        onChange(task.id);
        setOpen(false);
        setQuery("");
        // So the sidebar and the feed pick it up.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create the task");
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      // Enter picks an existing task — choosing one writes nothing. Creating a
      // task does, so that stays a deliberate click.
      e.preventDefault();
      if (matches[cursor]) choose(matches[cursor].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex max-w-[22rem] items-center gap-2 rounded-xs border border-line bg-raised px-2.5 py-1.5",
          "text-[13px] text-body transition-colors hover:border-line-strong",
        )}
      >
        <span className="truncate">
          {selected ? selected.title : tasks.length ? "Choose a task" : "Inbox"}
        </span>
        <span aria-hidden className="shrink-0 text-faint">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1.5 w-[min(26rem,calc(100vw-3rem))] rounded-xs border border-line-strong bg-bg">
          <div className="border-b border-line p-2">
            <input
              ref={field}
              aria-label="Search tasks, or type a new task name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search tasks, or type a new name"
              className="w-full rounded-xs border border-line bg-raised px-2.5 py-2 text-[13px] text-body transition-colors focus:border-line-strong"
            />
          </div>

          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {matches.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={t.id === value}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(t.id)}
                  className={cn(
                    "block w-full truncate px-3 py-2 text-left text-[13px]",
                    i === cursor ? "bg-raised text-text" : "text-body",
                  )}
                >
                  {t.title}
                </button>
              </li>
            ))}

            {!matches.length && !canCreate && (
              <li className="px-3 py-3">
                <Meta>
                  {tasks.length
                    ? "No task matches. Type at least 3 characters to make one."
                    : "No tasks yet. Type a name to make your first one."}
                </Meta>
              </li>
            )}

            {canCreate && (
              <li className={matches.length ? "mt-1 border-t border-line pt-1" : ""}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(matches.length)}
                  onClick={create}
                  disabled={pending}
                  className={cn(
                    "block w-full px-3 py-2 text-left text-[13px] disabled:opacity-50",
                    cursor === matches.length ? "bg-raised text-text" : "text-body",
                  )}
                >
                  {pending ? "Creating…" : <>Create task &ldquo;{query.trim()}&rdquo;</>}
                </button>
              </li>
            )}
          </ul>

          {error && (
            <p className="border-t border-line px-3 py-2">
              <Meta className="text-body">{error}</Meta>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
