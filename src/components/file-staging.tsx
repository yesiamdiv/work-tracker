"use client";

import { useRef } from "react";

import { Meta } from "@/components/ui";
import { humanSize } from "@/lib/drive-upload";

export type Staged = { file: File; pct?: number; error?: string };

/**
 * Files chosen while composing an entry, before it exists.
 *
 * They cannot be uploaded yet — an attachment needs an entry to hang off — so
 * they are held here and sent once the entry is saved.
 */
export function FileStaging({
  staged,
  onAdd,
  onRemove,
  disabled,
}: {
  staged: Staged[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onAdd(files);
          // Allow re-picking the same file after removing it.
          if (input.current) input.current.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        className="qbtn"
      >
        Attach files
      </button>

      {staged.length > 0 && (
        <ul className="mt-2 w-full space-y-1">
          {staged.map((s, i) => (
            <li
              key={`${s.file.name}-${i}`}
              className="flex items-center gap-3 rounded-xs border border-line px-2.5 py-1.5"
            >
              <Meta className="min-w-0 flex-1 truncate text-body">
                {s.file.name}
              </Meta>
              <Meta className="shrink-0">{humanSize(s.file.size)}</Meta>

              {s.error ? (
                <Meta className="shrink-0 text-body" title={s.error}>
                  failed
                </Meta>
              ) : s.pct === undefined ? (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  disabled={disabled}
                  aria-label={`Remove ${s.file.name}`}
                  className="shrink-0 text-[13px] text-faint transition-colors hover:text-text disabled:opacity-50"
                >
                  ×
                </button>
              ) : (
                <Meta className="w-10 shrink-0 text-right">
                  {s.pct === 100 ? "done" : `${s.pct}%`}
                </Meta>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
