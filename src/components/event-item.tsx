"use client";

import { useState } from "react";

import { deleteEvent } from "@/app/actions";
import { AttachFiles } from "@/components/attach-files";
import { AttachmentList } from "@/components/attachment-list";
import { DeleteControl } from "@/components/delete-control";
import { EntryBody, EntryMeta } from "@/components/entry-meta";
import { EventEditor } from "@/components/event-editor";
import { ExtLink, Meta } from "@/components/ui";
import type { Attachment, Event, Ref } from "@/db/schema";
import { refLabel, refWord } from "@/lib/ref-display";

/**
 * The prop is `link`, not `ref` — React reserves `ref` and refuses to pass it
 * through a component boundary.
 */
function RefLink({ link }: { link: Ref }) {
  return (
    <ExtLink href={link.url} title={link.url}>
      {refWord(link.kind)} · {refLabel(link)}
    </ExtLink>
  );
}

export function EventItem({
  event,
  canAttach = false,
}: {
  event: Event & { refs: Ref[]; attachments?: Attachment[] };
  canAttach?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <article className="px-4 py-4">
        <EventEditor event={event} onDone={() => setEditing(false)} />
      </article>
    );
  }

  return (
    <article className="px-4 py-4">
      <EntryMeta
        occurredAt={event.occurredAt}
        kind={event.kind}
        outcome={event.outcome}
        refCount={event.refs.length}
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
              onDelete={() => deleteEvent(event.id)}
            />
          </>
        }
      />

      <EntryBody body={event.body} failed={event.outcome === "fail"}>
        {event.refs.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {event.refs.map((r) => (
              <RefLink key={r.id} link={r} />
            ))}
          </div>
        )}

        {event.attachments && event.attachments.length > 0 && (
          <AttachmentList items={event.attachments} />
        )}

        {canAttach && <AttachFiles eventId={event.id} />}
      </EntryBody>
    </article>
  );
}
