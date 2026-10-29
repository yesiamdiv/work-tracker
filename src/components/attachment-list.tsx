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

const extension = (name: string) => {
  const bit = name.split(".").pop();
  return bit && bit.length <= 4 && bit !== name ? bit.toLowerCase() : "file";
};

/**
 * Files on an entry: one row each, all the same shape.
 *
 * Images previously sat in a separate 150px grid, which cut their names in
 * half and gave them different controls at different sizes from everything
 * else. Now every file is a row with the same name, size and actions, and an
 * image simply shows a thumbnail in the leading slot — which opens it full
 * size, as does Open.
 */
export function AttachmentList({
  items,
  canRemove = true,
}: {
  items: ShownAttachment[];
  canRemove?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  if (!items.length) return null;

  return (
    <div className="mt-2.5">
      <Meta className="mb-1.5 block text-muted">
        {items.length} file{items.length > 1 ? "s" : ""}
      </Meta>

      <ul className="divide-y divide-line overflow-hidden rounded-xs border border-line">
        {items.map((a) => {
          const showThumb = isImage(a) && !broken.has(a.id);
          // Images open through the proxy so they display; anything else goes
          // to Drive's viewer, which can actually render it.
          const openHref = showThumb ? bytesUrl(a) : driveUrl(a);
          const big = a.size != null && a.size > PROXY_LIMIT;

          return (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              {/* Fixed leading slot keeps every name on the same line. */}
              <a
                href={openHref}
                target="_blank"
                rel="noreferrer"
                title={`Open ${a.name}`}
                className="block size-10 shrink-0 overflow-hidden rounded-xs border border-line transition-colors hover:border-line-strong"
              >
                {showThumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={bytesUrl(a)}
                    alt={a.name}
                    loading="lazy"
                    className="size-full bg-raised object-cover"
                    onError={() => setBroken((s) => new Set(s).add(a.id))}
                  />
                ) : (
                  <span className="flex size-full items-center justify-center bg-raised text-[10px] uppercase tracking-wide text-faint">
                    {extension(a.name)}
                  </span>
                )}
              </a>

              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[13px] text-body"
                  title={a.name}
                >
                  {a.name}
                </span>
                {a.size != null && (
                  <Meta className="block">{humanSize(a.size)}</Meta>
                )}
              </span>

              <a
                href={openHref}
                target="_blank"
                rel="noreferrer"
                className="extlink shrink-0 text-[13px] text-muted hover:text-text"
              >
                Open
              </a>
              <a
                href={downloadUrl(a)}
                target={big ? "_blank" : undefined}
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
                      className="qbtn-strong"
                    >
                      {pending ? "Removing…" : "Delete from Drive"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(null)}
                      className="text-[13px] text-faint hover:text-muted"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRemoving(a.id)}
                    className="shrink-0 text-[13px] text-faint transition-colors hover:text-text"
                  >
                    Remove
                  </button>
                ))}
            </li>
          );
        })}
      </ul>

      {error && <Meta className="mt-1.5 block text-body">{error}</Meta>}
    </div>
  );
}
