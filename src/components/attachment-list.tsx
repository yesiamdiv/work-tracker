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

const isImage = (a: ShownAttachment) => !!a.mime?.startsWith("image/");

/** Our own authenticated proxy — Drive's thumbnail links expire. */
const bytesUrl = (a: ShownAttachment, download = false) =>
  `/api/drive/file/${a.id}${download ? "?download=1" : ""}`;

/** Drive's viewer, for anything we are not rendering ourselves. */
const driveUrl = (a: ShownAttachment) =>
  a.webViewLink ?? `https://drive.google.com/file/d/${a.driveFileId}/view`;

/**
 * Above this, download straight from Drive rather than through our proxy.
 *
 * The proxy gives a correct filename and skips Drive's interstitial, but it
 * streams the bytes through a serverless function — fine for a screenshot,
 * a timeout for a 148 MB build artefact.
 */
const PROXY_LIMIT = 25 * 1024 * 1024;

const downloadUrl = (a: ShownAttachment) =>
  a.size != null && a.size > PROXY_LIMIT
    ? `https://drive.google.com/uc?export=download&id=${a.driveFileId}`
    : bytesUrl(a, true);

export function AttachmentList({
  items,
  canRemove = true,
}: {
  items: ShownAttachment[];
  canRemove?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  if (!items.length) return null;

  const images = items.filter((a) => isImage(a) && !failed.has(a.id));
  const others = items.filter((a) => !isImage(a) || failed.has(a.id));

  function remove(id: string) {
    start(async () => {
      const result = await removeAttachment(id);
      if (!result.ok) setError(result.error);
      setRemoving(null);
    });
  }

  function RemoveControl({ id }: { id: string }) {
    if (!canRemove) return null;
    return removing === id ? (
      <span className="inline-flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => remove(id)}
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
        onClick={() => setRemoving(id)}
        className="shrink-0 text-[12.5px] text-faint transition-colors hover:text-text"
      >
        Remove
      </button>
    );
  }

  return (
    <div className="mt-2.5 space-y-2.5">
      {/* Images: shown, and clicking one opens it full size. */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <figure key={a.id} className="w-[150px]">
              <a
                href={bytesUrl(a)}
                target="_blank"
                rel="noreferrer"
                title={`${a.name} — click to open full size`}
                className="block overflow-hidden rounded-xs border border-line transition-colors hover:border-line-strong"
              >
                {/* Plain img: the source is our own route, not a known host,
                    so next/image would need it whitelisted for no gain. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bytesUrl(a)}
                  alt={a.name}
                  loading="lazy"
                  className="block h-[94px] w-full bg-raised object-cover"
                  onError={() =>
                    setFailed((s) => new Set(s).add(a.id))
                  }
                />
              </a>
              <figcaption className="mt-1 flex items-center gap-2">
                <Meta className="min-w-0 flex-1 truncate" title={a.name}>
                  {a.name}
                </Meta>
                <a
                  href={downloadUrl(a)}
                  className="extlink shrink-0 text-[12.5px] text-faint hover:text-text"
                >
                  Save
                </a>
                <RemoveControl id={a.id} />
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {/* Everything else: a row with both ways of getting at it. */}
      {others.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xs border border-line">
          {others.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
            >
              <span
                className="min-w-0 flex-1 truncate text-[13px] text-body"
                title={a.name}
              >
                {a.name}
              </span>
              {a.size != null && <Meta className="shrink-0">{humanSize(a.size)}</Meta>}

              <a
                href={driveUrl(a)}
                target="_blank"
                rel="noreferrer"
                className="extlink shrink-0 text-[13px] text-muted hover:text-text"
              >
                Open
              </a>
              <a
                href={downloadUrl(a)}
                target={a.size != null && a.size > PROXY_LIMIT ? "_blank" : undefined}
                rel="noreferrer"
                className="extlink shrink-0 text-[13px] text-muted hover:text-text"
              >
                Download
              </a>
              <RemoveControl id={a.id} />
            </li>
          ))}
        </ul>
      )}

      {error && <Meta className="block text-body">{error}</Meta>}
    </div>
  );
}
