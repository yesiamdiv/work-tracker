"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createTask } from "@/app/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import type { tasks } from "@/db/schema";

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

export function TaskForm({
  subjects,
}: {
  subjects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Type>("manual_test");
  const [picked, setPicked] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function submit() {
    if (!title.trim() || pending) return;
    start(async () => {
      const task = await createTask({
        title: title.trim(),
        type,
        subjectIds: picked,
        description: description.trim() || null,
      });
      router.push(`/t/${task.id}`);
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

      <div>
        <Label>
          Subjects — optional, and more than one is fine
        </Label>
        {subjects.length ? (
          <div className="divide-y divide-line border-y border-line">
            {subjects.map((s) => (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={`flex w-full items-center gap-2.5 py-2 text-left transition-colors hover:no-underline ${
                  picked.includes(s.id) ? "text-text" : "text-muted"
                }`}
              >
                <span className="w-3 shrink-0 text-faint">
                  {picked.includes(s.id) ? "·" : ""}
                </span>
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-faint">
            No subjects yet — that&rsquo;s fine, add them later.
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

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending || !title.trim()}>
          {pending ? "Creating" : "Create"}
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
