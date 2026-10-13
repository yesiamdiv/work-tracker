"use client";

import { useState, useTransition } from "react";

import { removeAttachment } from "@/app/drive-actions";
import { Meta } from "@/components/ui";
import { humanSize } from "@/lib/drive-upload";

/** What a row needs — narrower than the table, so the feed's shape fits too. */
export type ShownAttachment = {
  id: string;
  name: string;
  mime: string | null;
  size: number | null;
  driveFileId: string;
  webViewLink: string | null;
};

/** Opens Drive's viewer. */
function viewUrl(a: ShownAttachment): string {
  return a.webViewLink ?? `https://drive.google.com/file/d/${a.driveFileId}/view`;
}

/**
 * Downloads the bytes directly rather than opening the viewer.
 *
 * Drive's view link is useless for a .pem or an .apk — it shows a preview
 * pane with no obvious way out — so both are offered.
 */
function downloadUrl(a: ShownAttachment): string {
  return `https://drive.google.com/uc?export=download&id=${a.driveFileId}`;
}

export function AttachmentList({
  items,
  canRemove = true,
}: {
  items: ShownAttachment[];
  canRemove?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!items.length) return null;

  return (
    <div className="mt-2.5">
      <Meta className="mb-1.5 block text-muted">
        {items.length} file{items.length > 1 ? "s" : ""}
      </Meta>

      <ul className="divide-y divide-line overflow-hidden rounded-xs border border-line">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-body" title={a.name}>
              {a.name}
            </span>
            {a.size != null && (
              <Meta className="shrink-0">{humanSize(a.size)}</Meta>
            )}

            <a
              href={viewUrl(a)}
              target="_blank"
              rel="noreferrer"
              className="extlink shrink-0 text-[13px] text-muted hover:text-text"
            >
              Open
            </a>
            <a
              href={downloadUrl(a)}
              target="_blank"
              rel="noreferrer"
              className="extlink shrink-0 text-[13px] text-muted hover:text-text"
            >
              Download
            </a>

            {canRemove &&
              (removing === a.id ? (
                <span className="flex shrink-0 items-center gap-2.5">
                  <button
                    type="button"
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
                    type="button"
                    onClick={() => setRemoving(null)}
                    className="text-[12.5px] text-faint hover:text-muted"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setRemoving(a.id)}
                  className="shrink-0 text-[12.5px] text-faint transition-colors hover:text-text"
                >
                  Remove
                </button>
              ))}
          </li>
        ))}
      </ul>

      {error && <Meta className="mt-1.5 block text-body">{error}</Meta>}
    </div>
  );
}
