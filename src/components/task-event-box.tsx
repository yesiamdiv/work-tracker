"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { captureEvent } from "@/app/actions";
import { KIND_LABEL, parseCapture } from "@/lib/capture";
import { FileStaging, type Staged } from "@/components/file-staging";
import { ImproveButton } from "@/components/improve-button";
import { Button, Label, Meta } from "@/components/ui";
import { filesFromClipboard, uploadFilesToEvent } from "@/lib/drive-upload";
import { cn } from "@/lib/utils";

/** Add an entry to this task. */
export function TaskEventBox({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const stage = (files: File[]) =>
    setStaged((list) => [...list, ...files.map((file) => ({ file }))]);

  const parsed = text.trim() ? parseCapture(text) : null;

  function submit() {
    const body = text.trim();
    if (!body || pending) return;
    setUploadError(null);
    start(async () => {
      const event = await captureEvent({ taskId, text: body });

      // Attachments need an entry to hang off, so they go second. The entry is
      // already saved: a failed upload must never cost you the text.
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
          setUploadError(
            `Entry saved, but ${result.failures.length} file${result.failures.length > 1 ? "s" : ""} did not upload: ${result.failures[0].error}`,
          );
          router.refresh();
          return;
        }
      }

      setText("");
      setStaged([]);
      ref.current?.focus();
      router.refresh();
    });
  }

  return (
    <section className="mt-9 border-t border-line pt-7">
      <Label>Add an entry</Label>
      <textarea
        ref={ref}
        rows={3}
        value={text}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
        /* Enter inserts a newline; "Save entry" is the only way to commit. */
        onKeyDown={(e) => {
          if (e.key === "Escape") setText("");
        }}
        onPaste={(e) => {
          const files = filesFromClipboard(e.nativeEvent);
          if (files.length) {
            e.preventDefault();
            stage(files);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) {
            e.preventDefault();
            stage(files);
          }
        }}
        placeholder="What happened? Paste ticket links or screenshots straight in."
        className={cn(
          "w-full rounded-xs border border-line bg-raised px-4 py-3 text-body",
          "transition-colors focus:border-line-strong",
          pending && "opacity-50",
        )}
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={submit} disabled={pending || !text.trim()}>
          {pending ? "Saving…" : "Save entry"}
        </Button>
        {parsed && (
          <Meta className="text-muted">
            Reading this as{" "}
            <span className="text-body">{KIND_LABEL[parsed.kind]}</span>
            {parsed.outcome && (
              <>
                {" · "}
                <span className="text-body">{parsed.outcome}</span>
              </>
            )}
            {parsed.refs.length > 0 && (
              <>
                {" · "}
                <span className="text-body">
                  {parsed.refs.length} link{parsed.refs.length > 1 ? "s" : ""}
                </span>
              </>
            )}
          </Meta>
        )}
        <FileStaging
          staged={staged}
          disabled={pending}
          onAdd={stage}
          onRemove={(i) => setStaged((list) => list.filter((_, j) => j !== i))}
        />
        <ImproveButton text={text} onAccept={setText} />

      </div>

      {uploadError && (
        <p className="mt-2.5">
          <Meta className="text-body">{uploadError}</Meta>
        </p>
      )}
    </section>
  );
}
