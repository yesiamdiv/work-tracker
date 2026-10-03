"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { captureEvent, inboxTask } from "@/app/actions";
import { KIND_LABEL, parseCapture } from "@/lib/capture";
import { ImproveButton } from "@/components/improve-button";
import { Label, Meta } from "@/components/ui";
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
  const [text, setText] = useState("");
  const [targetId, setTargetId] = useState(defaultTargetId ?? targets[0]?.id);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const parsed = text.trim() ? parseCapture(text) : null;

  function submit() {
    const body = text.trim();
    if (!body || pending) return;
    start(async () => {
      const id = targetId ?? (await inboxTask());
      await captureEvent({ taskId: id, text: body });
      setText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      ref.current?.focus();
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
        placeholder={"What happened? Paste any ticket or sheet links straight into the text."}
        className={cn(
          "w-full rounded-xs border border-line bg-raised px-4 py-3 text-body",
          "transition-colors focus:border-line-strong",
          pending && "opacity-50",
        )}
      />

      {/* Which task this lands on — a labelled control, not a bare word. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Meta className="text-muted">Add to</Meta>
        <select
          value={targetId ?? ""}
          onChange={(e) => setTargetId(e.target.value)}
          className="max-w-[20rem] cursor-pointer truncate rounded-xs border border-line bg-raised px-2.5 py-1.5 text-[13px] text-body transition-colors hover:border-line-strong"
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id} className="bg-bg">
              {t.title}
            </option>
          ))}
          {!targets.length && (
            <option value="" className="bg-bg">
              Inbox
            </option>
          )}
        </select>

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
