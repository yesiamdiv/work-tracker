"use client";

import Link from "next/link";
import { useState } from "react";

import { deleteEvent } from "@/app/actions";
import { DeleteControl } from "@/components/delete-control";
import { EntryBody, EntryMeta } from "@/components/entry-meta";
import { EventEditor } from "@/components/event-editor";
import { SubjectLink } from "@/components/subject-link";
import type { FeedEntry } from "@/db/feed";

/**
 * One entry in the dashboard or stream feed, editable in place.
 *
 * Differs from the task page's row in exactly one way: it names the task the
 * entry belongs to, because the feed spans every task. Everything else comes
 * from the shared pieces.
 */
export function FeedRow({
  entry,
  showTask,
}: {
  entry: FeedEntry;
  showTask: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <article className="px-4 py-3.5">
        <EventEditor
          event={{
            id: entry.id,
            body: entry.body,
            kind: entry.kind,
            outcome: entry.outcome,
            occurredAt: new Date(entry.occurredAt),
          }}
          onDone={() => setEditing(false)}
        />
      </article>
    );
  }

  return (
    <article className="px-4 py-3.5">
      <EntryMeta
        occurredAt={entry.occurredAt}
        kind={entry.kind}
        outcome={entry.outcome}
        refCount={entry.refCount}
        actions={
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[13px] text-faint transition-colors hover:text-text"
            >
              Edit
            </button>
            <DeleteControl
              what="this entry"
              onDelete={() => deleteEvent(entry.id)}
            />
          </>
        }
      />

      <EntryBody body={entry.body} failed={entry.outcome === "fail"} />

      {showTask && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/t/${entry.taskId}`}
            className="extlink text-[13px] text-muted hover:text-text"
          >
            {entry.taskTitle}
          </Link>
          {entry.subjects.map((s) => (
            <SubjectLink key={s.slug} subject={s} outlined={false} />
          ))}
        </div>
      )}
    </article>
  );
}
