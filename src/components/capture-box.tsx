"use client";

import { useEffect, useState } from "react";

import { inboxTask } from "@/app/actions";
import { EntryFields } from "@/components/entry-fields";
import { EntryPreview } from "@/components/entry-preview";
import { FileStaging } from "@/components/file-staging";
import { ImproveButton } from "@/components/improve-button";
import {
  looksLikeExpiredSignIn,
  ReauthNotice,
} from "@/components/reauth-notice";
import { TaskPicker } from "@/components/task-picker";
import { Alert, Button, Label, Meta, Textarea } from "@/components/ui";
import { useEntryComposer } from "@/components/use-entry-composer";

export type CaptureTarget = { id: string; title: string };

/**
 * The dashboard's compose box: pick a task, or create one, then write.
 *
 * The only thing this adds over the task page's box is choosing the target —
 * everything else lives in `useEntryComposer`.
 */
export function CaptureBox({
  targets,
  defaultTargetId,
}: {
  targets: CaptureTarget[];
  defaultTargetId?: string;
}) {
  const [targetId, setTargetId] = useState(defaultTargetId ?? targets[0]?.id);

  /*
   * Follow the task picked in the sidebar.
   *
   * `useState` only reads its argument on the first render, and navigating to
   * /?task=<id> re-renders this component rather than remounting it — so the
   * dropdown kept whatever it was first given and silently wrote entries to
   * the wrong task. Syncing rather than keying on it so a half-typed entry
   * survives the click.
   */
  useEffect(() => {
    if (defaultTargetId) setTargetId(defaultTargetId);
  }, [defaultTargetId]);
  // A task created from inside the picker, selectable before the refresh that
  // will deliver it in `targets`.
  const [extra, setExtra] = useState<CaptureTarget[]>([]);

  const c = useEntryComposer({
    // No task to hand? Make one rather than refusing the capture.
    resolveTaskId: async () => targetId ?? (await inboxTask()),
  });

  useEffect(() => {
    c.textareaProps.ref.current?.focus();
    // Focusing once on mount; the ref is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = [
    ...extra.filter((e) => !targets.some((t) => t.id === e.id)),
    ...targets,
  ];

  return (
    <section className="mb-10">
      <Label>Log an entry</Label>

      <Textarea
        {...c.textareaProps}
        rows={3}
        placeholder="What happened? Paste ticket or sheet links straight into the text, and screenshots too."
      />

      <div className="mt-3">
        <EntryFields
          {...c.fields}
          note={
            c.fieldsTouched
              ? undefined
              : "These follow what you type — !bug, !pass and the rest move them. Set one by hand to override."
          }
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Meta className="text-muted">Add to</Meta>
        <TaskPicker
          tasks={options}
          value={targetId}
          onChange={setTargetId}
          onCreated={(t) => setExtra((x) => [t, ...x])}
        />

        <FileStaging
          staged={c.staged}
          disabled={c.pending}
          onAdd={c.stage}
          onRemove={c.unstage}
        />

        <ImproveButton text={c.text} onAccept={c.setText} />

        <span className="ml-auto flex items-center gap-3">
          {c.saved && !c.pending && <Meta className="text-muted">Saved</Meta>}
          <Button onClick={c.submit} busy={c.pending} disabled={!c.canSave}>
            {c.pending
              ? "Saving…"
              : c.staged.length
                ? `Save entry + ${c.staged.length} file${c.staged.length > 1 ? "s" : ""}`
                : "Save entry"}
          </Button>
        </span>
      </div>

      {c.uploadError &&
        (looksLikeExpiredSignIn(c.uploadError) ? (
          <ReauthNotice message={c.uploadError} />
        ) : (
          <Alert>{c.uploadError}</Alert>
        ))}

      <EntryPreview parsed={c.parsed} />

      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] text-faint hover:text-muted">
          Shorthand you can use
        </summary>
        <div className="mt-2.5 space-y-1.5 border-l border-line pl-3.5 text-[13px] text-muted">
          <p>
            <span className="text-body">!bug</span> · found a bug &nbsp;
            <span className="text-body">!pass</span>{" "}
            <span className="text-body">!fail</span>{" "}
            <span className="text-body">!flaky</span> · a test run and how it
            went
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
            <span className="text-body">#anything</span> adds a tag. Any URL you
            paste is detected and saved as a reference automatically.
          </p>
        </div>
      </details>
    </section>
  );
}
