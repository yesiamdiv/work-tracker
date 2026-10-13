"use client";

import Link from "next/link";
import { useState } from "react";

import { deleteEvent } from "@/app/actions";
import { DeleteControl } from "@/components/delete-control";
import { EventEditor } from "@/components/event-editor";
import { Dot, Meta } from "@/components/ui";
import type { FeedEntry } from "@/db/feed";
import { KIND_LABEL } from "@/lib/capture";
import { timeLabel } from "@/lib/utils";

/**
 * One entry in the dashboard or stream feed, editable in place.
 *
 * Shares `EventEditor` with the task page, but the surrounding display is its
 * own: a feed row has to name the task it belongs to, which the task page's
 * version never does. (The two displays are close enough to be worth merging —
 * noted for the component-reuse pass.)
 */
export function FeedRow({
  entry,
  showTask,
}: {
  entry: FeedEntry;
  showTask: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const failed = entry.outcome === "fail";

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
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Meta className="text-muted">{timeLabel(entry.occurredAt)}</Meta>
        <span aria-hidden className="h-3 w-px bg-line" />
        <Meta className="text-muted">{KIND_LABEL[entry.kind]}</Meta>
        {entry.outcome && (
          <>
            <span aria-hidden className="h-3 w-px bg-line" />
            <Meta className={failed ? "text-text" : "text-muted"}>
              {entry.outcome}
            </Meta>
          </>
        )}
        {entry.refCount > 0 && (
          <>
            <span aria-hidden className="h-3 w-px bg-line" />
            <Meta>
              {entry.refCount} link{entry.refCount > 1 ? "s" : ""}
            </Meta>
          </>
        )}

        <span className="ml-auto flex items-center gap-3">
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
        </span>
      </div>

      <div className={failed ? "border-l border-line-strong pl-3" : ""}>
        <p className="whitespace-pre-wrap break-words text-body">{entry.body}</p>
      </div>

      {showTask && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/t/${entry.taskId}`}
            className="extlink text-[13px] text-muted hover:text-text"
          >
            {entry.taskTitle}
          </Link>
          {entry.subjects.map((s) => (
            <Link
              key={s.slug}
              href={`/s/${s.slug}`}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-faint transition-colors hover:text-text"
            >
              <Dot colour={s.colour} />
              {s.parentName ? `${s.parentName} / ${s.name}` : s.name}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
