"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createTask, updateTask } from "@/app/actions";
import { SubjectChips } from "@/components/subject-chips";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
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

      <SubjectChips
        options={subjects}
        picked={picked}
        onToggle={toggle}
        onClear={() => setPicked([])}
      />

      <label className="block">
        <Label>Notes — optional</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      {error && <p className="text-muted">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending || !title.trim()}>
          {pending ? "Saving…" : initial ? "Save changes" : "Create"}
        </Button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-faint transition-colors hover:text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
