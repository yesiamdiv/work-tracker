"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createTask, updateTask } from "@/app/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { tasks } from "@/db/schema";

type Type = (typeof tasks.type.enumValues)[number];

const TYPES: Type[] = [
  "manual_test",
  "automation",
  "qa_pass",
  "regression",
  "investigation",
  "release",
  "integration",
  "setup",
  "review",
  "other",
];

export type TaskInitial = {
  id: string;
  title: string;
  type: Type;
  status: (typeof tasks.status.enumValues)[number];
  description: string | null;
  subjectIds: string[];
};

export function TaskForm({
  subjects,
  preselect,
  initial,
}: {
  subjects: { id: string; label: string }[];
  /** Ticked on arrival — set when coming from a subject's page. */
  preselect?: string;
  /** Present when editing rather than creating. */
  initial?: TaskInitial;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<Type>(initial?.type ?? "manual_test");
  const [status, setStatus] = useState(initial?.status ?? "in_progress");
  const [picked, setPicked] = useState<string[]>(
    initial?.subjectIds ??
      (preselect && subjects.some((s) => s.id === preselect) ? [preselect] : []),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function submit() {
    if (!title.trim() || pending) return;
    setError(null);
    start(async () => {
      try {
        if (initial) {
          await updateTask({
            taskId: initial.id,
            title: title.trim(),
            type,
            status,
            subjectIds: picked,
            description: description.trim() || null,
          });
          router.push(`/t/${initial.id}`);
        } else {
          const task = await createTask({
            title: title.trim(),
            type,
            subjectIds: picked,
            description: description.trim() || null,
          });
          router.push(`/t/${task.id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <div className="max-w-md space-y-7">
      <label className="block">
        <Label>Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Regression suite for FW 2.4.1"
          autoFocus
        />
      </label>

      <label className="block">
        <Label>Type</Label>
        <Select value={type} onChange={(e) => setType(e.target.value as Type)}>
          {TYPES.map((t) => (
            <option key={t} value={t} className="bg-bg">
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </label>

      {initial && (
        <label className="block">
          <Label>Status</Label>
          <Select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as TaskInitial["status"])
            }
          >
            {tasks.status.enumValues.map((v) => (
              <option key={v} value={v} className="bg-bg">
                {v.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </label>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
          <Label>Subjects</Label>
          {picked.length > 0 && (
            <button
              type="button"
              onClick={() => setPicked([])}
              className="text-[13px] text-faint transition-colors hover:text-text"
            >
              Clear {picked.length} selected
            </button>
          )}
        </div>

        <p className="mb-2.5 text-[13px] text-faint">
          Optional, and more than one is fine. Leave them all unticked if this
          task is not about a particular subject — you can add one later.
        </p>

        {subjects.length ? (
          <div className="divide-y divide-line overflow-hidden rounded-xs border border-line">
            {subjects.map((s) => {
              const on = picked.includes(s.id);
              return (
                <label
                  key={s.id}
                  className="rowlink flex cursor-pointer items-center gap-3 px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(s.id)}
                    className="size-4 shrink-0 accent-neutral-400"
                  />
                  <span className={on ? "text-text" : "text-body"}>
                    {s.label}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xs border border-dashed border-line px-4 py-5 text-center text-muted">
            No subjects exist yet.
            <br />
            <Link
              href="/subjects/new"
              className="extlink text-[13px] text-muted hover:text-text"
            >
              Create one
            </Link>
            <span className="text-[13px] text-faint">
              {" "}
              — or carry on without, it is not required.
            </span>
          </p>
        )}
      </div>

      <label className="block">
        <Label>Notes — optional</Label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xs border border-line bg-raised px-3 py-2 text-body transition-colors focus:border-line-strong"
        />
      </label>

      {error && <p className="text-muted">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending || !title.trim()}>
          {pending ? "Saving…" : initial ? "Save changes" : "Create"}
        </Button>
        <button
          onClick={() => router.back()}
          className="text-faint transition-colors hover:text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
