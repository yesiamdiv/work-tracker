"use client";

import { EntryFields } from "@/components/entry-fields";
import { EntryPreview } from "@/components/entry-preview";
import { FileStaging } from "@/components/file-staging";
import { ImproveButton } from "@/components/improve-button";
import {
  looksLikeExpiredSignIn,
  ReauthNotice,
} from "@/components/reauth-notice";
import { Alert, Button, Label, Meta, Textarea } from "@/components/ui";
import { useEntryComposer } from "@/components/use-entry-composer";

/** Adds an entry to a task whose identity is already known. */
export function TaskEventBox({ taskId }: { taskId: string }) {
  const c = useEntryComposer({ resolveTaskId: async () => taskId });

  return (
    <section className="mt-9 border-t border-line pt-7">
      <Label>Add an entry</Label>

      <Textarea
        {...c.textareaProps}
        rows={3}
        placeholder="What happened? Paste ticket links or screenshots straight in."
      />

      <div className="mt-3">
        <EntryFields {...c.fields} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={c.submit} disabled={!c.canSave}>
          {c.pending
            ? "Saving…"
            : c.staged.length
              ? `Save entry + ${c.staged.length} file${c.staged.length > 1 ? "s" : ""}`
              : "Save entry"}
        </Button>

        <FileStaging
          staged={c.staged}
          disabled={c.pending}
          onAdd={c.stage}
          onRemove={c.unstage}
        />

        <ImproveButton text={c.text} onAccept={c.setText} />

        <EntryPreview parsed={c.parsed} compact />
      </div>

      {c.uploadError &&
        (looksLikeExpiredSignIn(c.uploadError) ? (
          <ReauthNotice message={c.uploadError} />
        ) : (
          <Alert>{c.uploadError}</Alert>
        ))}
    </section>
  );
}
