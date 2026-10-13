"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { captureEvent } from "@/app/actions";
import type { Staged } from "@/components/file-staging";
import { parseCapture, type ParsedCapture } from "@/lib/capture";
import { filesFromClipboard, uploadFilesToEvent } from "@/lib/drive-upload";

/**
 * Everything the two compose boxes shared: the text, the staged files, the
 * parse preview, and the save-then-upload sequence.
 *
 * They differed in one respect only — the dashboard box chooses which task to
 * write to, the task page's box already knows — so that is the single argument
 * here, and the rest is no longer written twice.
 */
export function useEntryComposer({
  resolveTaskId,
  onSaved,
}: {
  /** Which task this entry belongs to. May create one (the Inbox fallback). */
  resolveTaskId: () => Promise<string>;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const textarea = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const parsed: ParsedCapture | null = text.trim() ? parseCapture(text) : null;

  const stage = (files: File[]) =>
    setStaged((list) => [...list, ...files.map((file) => ({ file }))]);

  const unstage = (index: number) =>
    setStaged((list) => list.filter((_, i) => i !== index));

  function submit() {
    const body = text.trim();
    if (!body || pending) return;
    setUploadError(null);

    start(async () => {
      const taskId = await resolveTaskId();
      const event = await captureEvent({ taskId, text: body });

      /*
       * Attachments need an entry to hang off, so they go second. The entry is
       * committed by this point on purpose: a failed upload reports itself
       * without ever costing you the text.
       */
      if (event && staged.length) {
        const result = await uploadFilesToEvent(
          event.id,
          staged.map((s) => s.file),
          ({ index, pct }) =>
            setStaged((list) =>
              list.map((s, i) => (i === index ? { ...s, pct } : s)),
            ),
        );

        if (result.failures.length) {
          const n = result.failures.length;
          setUploadError(
            `Entry saved, but ${n} file${n > 1 ? "s" : ""} did not upload: ${result.failures[0].error}`,
          );
          setStaged((list) =>
            list.map((s) => ({
              ...s,
              error: result.failures.find((f) => f.name === s.file.name)?.error,
            })),
          );
          router.refresh();
          return;
        }
      }

      setText("");
      setStaged([]);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      textarea.current?.focus();
      router.refresh();
      onSaved?.();
    });
  }

  /**
   * Spread onto the textarea. Enter inserts a newline — saving is the button
   * alone, because an entry is a real record and a stray Enter mid-thought
   * should never commit one. Pasting or dropping files stages them.
   */
  const textareaProps = {
    ref: textarea,
    value: text,
    disabled: pending,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      setText(e.target.value),
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") setText("");
    },
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = filesFromClipboard(e.nativeEvent);
      if (files.length) {
        e.preventDefault();
        stage(files);
      }
    },
    onDragOver: (e: React.DragEvent<HTMLTextAreaElement>) => e.preventDefault(),
    onDrop: (e: React.DragEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) {
        e.preventDefault();
        stage(files);
      }
    },
  };

  return {
    text,
    setText,
    parsed,
    staged,
    stage,
    unstage,
    pending,
    saved,
    uploadError,
    submit,
    textareaProps,
    canSave: !!text.trim() && !pending,
  };
}
