"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FileStaging, type Staged } from "@/components/file-staging";
import { Meta } from "@/components/ui";
import { uploadFilesToEvent } from "@/lib/drive-upload";

/**
 * Adds files to an entry that already exists.
 *
 * The usual way to attach is while composing — see `FileStaging` in the
 * capture boxes. This is for afterwards, when you realise a screenshot would
 * have helped.
 */
export function AttachFiles({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    if (!staged.length || pending) return;
    setError(null);
    start(async () => {
      const result = await uploadFilesToEvent(
        eventId,
        staged.map((s) => s.file),
        ({ index, pct }) =>
          setStaged((list) =>
            list.map((s, i) => (i === index ? { ...s, pct } : s)),
          ),
      );

      if (result.failures.length) {
        setError(result.failures[0].error);
        setStaged((list) =>
          list.map((s) => ({
            ...s,
            error: result.failures.find((f) => f.name === s.file.name)?.error,
          })),
        );
      } else {
        setStaged([]);
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-4">
        <FileStaging
          staged={staged}
          disabled={pending}
          onAdd={(files) =>
            setStaged((list) => [...list, ...files.map((file) => ({ file }))])
          }
          onRemove={(i) => setStaged((list) => list.filter((_, j) => j !== i))}
        />

        {staged.length > 0 && !pending && (
          <button
            onClick={send}
            className="text-[13px] text-text underline decoration-line-strong underline-offset-[3px] hover:opacity-80"
          >
            Upload {staged.length} file{staged.length > 1 ? "s" : ""}
          </button>
        )}
        {pending && <Meta>Uploading…</Meta>}
      </div>

      {error && <Meta className="mt-1.5 block text-body">{error}</Meta>}
    </div>
  );
}
