"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { captureEvent, inboxTask } from "@/app/actions";
import { KIND_LABEL, parseCapture } from "@/lib/capture";
import { FileStaging, type Staged } from "@/components/file-staging";
import { ImproveButton } from "@/components/improve-button";
import { TaskPicker } from "@/components/task-picker";
import { Label, Meta } from "@/components/ui";
import { filesFromClipboard, uploadFilesToEvent } from "@/lib/drive-upload";
import { cn } from "@/lib/utils";

export type CaptureTarget = { id: string; title: string };

/**
 * One box, always focused. Type what happened, press enter.
 *
 * The preview strip underneath reports what the app understood — kind, outcome,
 * tags, links found — so the shorthand never has to be remembered. Without it
 * the markers are invisible magic, which is how the first version read.
 */
export function CaptureBox({
  targets,
  defaultTargetId,
}: {
  targets: CaptureTarget[];
  defaultTargetId?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [targetId, setTargetId] = useState(defaultTargetId ?? targets[0]?.id);
  // A task created from inside the picker, so it is selectable before the
  // server round-trip that will put it in `targets`.
  const [extra, setExtra] = useState<CaptureTarget[]>([]);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const parsed = text.trim() ? parseCapture(text) : null;

  // De-duplicated, because a refresh will eventually deliver the new task in
  // `targets` as well.
  const options = [
    ...extra.filter((e) => !targets.some((t) => t.id === e.id)),
    ...targets,
  ];

  function submit() {
    const body = text.trim();
    if (!body || pending) return;
    setUploadError(null);
    start(async () => {
      const id = targetId ?? (await inboxTask());
      const event = await captureEvent({ taskId: id, text: body });

      // Files can only be attached once the entry exists, so they go second.
      // The entry is already saved by this point: an upload failure must never
      // cost you the text.
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
      ref.current?.focus();
      router.refresh();
    });
  }

  return (
    <section className="mb-10">
      <Label>Log an entry</Label>

      <textarea
        ref={ref}
        rows={3}
        value={text}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        onPaste={(e) => {
          const files = filesFromClipboard(e.nativeEvent);
          if (files.length) {
            e.preventDefault();
            setStaged((list) => [...list, ...files.map((file) => ({ file }))]);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) {
            e.preventDefault();
            setStaged((list) => [...list, ...files.map((file) => ({ file }))]);
          }
        }}
        placeholder={
          "What happened? Paste ticket or sheet links straight into the text, and screenshots too."
        }
        className={cn(
          "w-full rounded-xs border border-line bg-raised px-4 py-3 text-body",
          "transition-colors focus:border-line-strong",
          pending && "opacity-50",
        )}
      />

      {/* Which task this lands on — a labelled control, not a bare word. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Meta className="text-muted">Add to</Meta>
        <TaskPicker
          tasks={options}
          value={targetId}
          onChange={setTargetId}
          onCreated={(t) => setExtra((x) => [t, ...x])}
        />

        <FileStaging
          staged={staged}
          disabled={pending}
          onAdd={(files) =>
            setStaged((list) => [...list, ...files.map((file) => ({ file }))])
          }
          onRemove={(i) => setStaged((list) => list.filter((_, j) => j !== i))}
        />

        <ImproveButton text={text} onAccept={setText} />

        <span className="ml-auto">
          {pending ? (
            <Meta className="text-muted">Saving…</Meta>
          ) : saved ? (
            <Meta className="text-muted">Saved</Meta>
          ) : (
            <Meta>Enter to save · Shift+Enter for a new line</Meta>
          )}
        </span>
      </div>

      {/* What the app understood. Only shown once there is something to report. */}
      {uploadError && (
        <p className="mt-2.5">
          <Meta className="text-body">{uploadError}</Meta>
        </p>
      )}

      {parsed && (
        <div className="mt-3 rounded-xs border border-line px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Meta className="text-muted">
              Reading this as: <span className="text-body">{KIND_LABEL[parsed.kind]}</span>
              {parsed.outcome && (
                <>
                  {" · "}
                  <span className="text-body">{parsed.outcome}</span>
                </>
              )}
            </Meta>
            {parsed.refs.length > 0 && (
              <Meta className="text-muted">
                {parsed.refs.length} link{parsed.refs.length > 1 ? "s" : ""} found:{" "}
                <span className="text-body">
                  {parsed.refs.map((r) => r.kind).join(", ")}
                </span>
              </Meta>
            )}
            {parsed.tags.length > 0 && (
              <Meta className="text-muted">
                tags <span className="text-body">{parsed.tags.map((t) => `#${t}`).join(" ")}</span>
              </Meta>
            )}
          </div>
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] text-faint hover:text-muted">
          Shorthand you can use
        </summary>
        <div className="mt-2.5 space-y-1.5 border-l border-line pl-3.5 text-[13px] text-muted">
          <p>
            <span className="text-body">!bug</span> · found a bug &nbsp;
            <span className="text-body">!pass</span>{" "}
            <span className="text-body">!fail</span>{" "}
            <span className="text-body">!flaky</span> · a test run and how it went
          </p>
          <p>
            <span className="text-body">!blocked</span>{" "}
            <span className="text-body">!decision</span>{" "}
            <span className="text-body">!meeting</span>{" "}
            <span className="text-body">!q</span>{" "}
            <span className="text-body">!handoff</span>{" "}
            <span className="text-body">!done</span>
          </p>
          <p>
            <span className="text-body">#anything</span> adds a tag. Any URL you paste
            is detected and saved as a reference automatically.
          </p>
        </div>
      </details>
    </section>
  );
}
