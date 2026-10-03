"use client";

import { useRef, useState, useTransition } from "react";

import { captureEvent } from "@/app/actions";
import { KIND_LABEL, parseCapture } from "@/lib/capture";
import { ImproveButton } from "@/components/improve-button";
import { Button, Label, Meta } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Add an entry to this task. */
export function TaskEventBox({ taskId }: { taskId: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  const parsed = text.trim() ? parseCapture(text) : null;

  function submit() {
    const body = text.trim();
    if (!body || pending) return;
    start(async () => {
      await captureEvent({ taskId, text: body });
      setText("");
      ref.current?.focus();
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
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="What happened? Paste ticket or sheet links straight into the text."
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
        <ImproveButton text={text} onAccept={setText} />
        <Meta className="ml-auto">Enter to save</Meta>
      </div>
    </section>
  );
}
