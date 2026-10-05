"use client";

import { useState, useTransition } from "react";

import { removeAttachment } from "@/app/drive-actions";
import { Meta } from "@/components/ui";
import type { Attachment } from "@/db/schema";

function size(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Files on an entry. Opens in Drive; removing deletes the Drive file too. */
export function AttachmentList({ items }: { items: Attachment[] }) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-2.5 space-y-1.5">
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-3">
          <a
            href={a.webViewLink ?? `https://drive.google.com/file/d/${a.driveFileId}/view`}
            target="_blank"
            rel="noreferrer"
            className="extlink min-w-0 flex-1 truncate text-[13px] text-muted"
            title={a.name}
          >
            {a.name}
            <span aria-hidden className="ml-1 text-[11px] opacity-60">
              ↗
            </span>
          </a>
          <Meta className="shrink-0">{size(a.size)}</Meta>

          {removing === a.id ? (
            <span className="flex shrink-0 items-center gap-2.5">
              <button
                onClick={() =>
                  start(async () => {
                    const r = await removeAttachment(a.id);
                    if (!r.ok) setError(r.error);
                    setRemoving(null);
                  })
                }
                disabled={pending}
                className="text-[12.5px] text-text underline decoration-line-strong underline-offset-[3px] disabled:opacity-50"
              >
                {pending ? "Removing…" : "Delete from Drive"}
              </button>
              <button
                onClick={() => setRemoving(null)}
                className="text-[12.5px] text-faint hover:text-muted"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setRemoving(a.id)}
              className="shrink-0 text-[12.5px] text-faint transition-colors hover:text-text"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {error && <Meta className="block text-body">{error}</Meta>}
    </div>
  );
}
