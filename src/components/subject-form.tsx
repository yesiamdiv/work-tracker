"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createSubject } from "@/app/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import type { subjects } from "@/db/schema";

type Kind = (typeof subjects.kind.enumValues)[number];

const KINDS: Kind[] = [
  "client",
  "sdk",
  "firmware",
  "hardware",
  "mobile_app",
  "web_app",
  "feature",
  "integration",
  "internal",
];

/** A restrained set — these only ever render as a 5px dot. */
const COLOURS = [
  "#6b6b6b",
  "#8b7355",
  "#5f7a6b",
  "#6b7280",
  "#7d6b80",
  "#8a6f6f",
];

export function SubjectForm({
  parents,
}: {
  parents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("client");
  const [parentId, setParentId] = useState("");
  const [colour, setColour] = useState(COLOURS[0]);
  const [description, setDescription] = useState("");

  function submit() {
    if (!name.trim() || pending) return;
    setError(null);
    start(async () => {
      try {
        await createSubject({
          name: name.trim(),
          kind,
          parentId: parentId || null,
          colour,
          description: description.trim() || null,
        });
        router.push("/subjects");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create subject");
      }
    });
  }

  return (
    <div className="max-w-md space-y-7">
      <label className="block">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ClientX, or ClientX firmware 2.x"
          autoFocus
        />
      </label>

      <label className="block">
        <Label>Kind</Label>
        <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {KINDS.map((k) => (
            <option key={k} value={k} className="bg-bg">
              {k.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </label>

      <label className="block">
        <Label>Parent — optional, two levels only</Label>
        <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="" className="bg-bg">
            None — top level
          </option>
          {parents.map((p) => (
            <option key={p.id} value={p.id} className="bg-bg">
              {p.name}
            </option>
          ))}
        </Select>
      </label>

      <div>
        <Label>Dot</Label>
        <div className="flex gap-2.5">
          {COLOURS.map((c) => (
            <button
              key={c}
              onClick={() => setColour(c)}
              aria-label={c}
              className={`size-5 rounded-full border transition-colors ${
                colour === c ? "border-line-strong" : "border-transparent"
              }`}
            >
              <span
                className="block size-[5px] translate-x-[7px] rounded-full opacity-70"
                style={{ background: c }}
              />
            </button>
          ))}
        </div>
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
        <Button onClick={submit} disabled={pending || !name.trim()}>
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
