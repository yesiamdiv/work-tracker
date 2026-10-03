import { deleteEvent } from "@/app/actions";
import { DeleteControl } from "@/components/delete-control";
import type { Event, Ref } from "@/db/schema";
import { KIND_LABEL } from "@/lib/capture";
import { ExtLink, Meta } from "@/components/ui";
import { timeLabel } from "@/lib/utils";

/** How each reference kind is announced, so a chip says what it actually is. */
const REF_WORD: Record<string, string> = {
  jira: "Ticket",
  sheet: "Sheet",
  doc: "Doc",
  slide: "Slides",
  confluence: "Confluence",
  pr: "PR",
  build: "Build",
  repo: "Repo",
  other: "Link",
};

/**
 * The prop is `link`, not `ref` — React reserves `ref` and refuses to pass it
 * through a component boundary.
 */
function RefLink({ link }: { link: Ref }) {
  let host = link.url;
  try {
    host = new URL(link.url).hostname.replace(/^www\./, "");
  } catch {
    // Keep the raw string if it will not parse.
  }
  const label = link.label ?? link.externalKey ?? host;
  return (
    <ExtLink href={link.url} title={link.url}>
      {REF_WORD[link.kind] ?? "Link"} · {label}
    </ExtLink>
  );
}

export function EventItem({ event }: { event: Event & { refs: Ref[] } }) {
  const failed = event.outcome === "fail";

  return (
    <article className="px-4 py-4">
      {/* Time, kind and outcome stated on their own line, not trailing the body. */}
      <div className="mb-2 flex items-center gap-2.5">
        <Meta className="text-muted">{timeLabel(event.occurredAt)}</Meta>
        <span aria-hidden className="h-3 w-px bg-line" />
        <Meta className="text-muted">{KIND_LABEL[event.kind]}</Meta>
        {event.outcome && (
          <>
            <span aria-hidden className="h-3 w-px bg-line" />
            <Meta className={failed ? "text-text" : "text-muted"}>
              {event.outcome}
            </Meta>
          </>
        )}
        <span className="ml-auto">
          <DeleteControl
            what="this entry"
            onDelete={async () => {
              "use server";
              await deleteEvent(event.id);
            }}
          />
        </span>
      </div>

      {/* A failure is marked by a rule down the side, not a colour. */}
      <div className={failed ? "border-l border-line-strong pl-3" : ""}>
        <p className="whitespace-pre-wrap break-words text-body">{event.body}</p>

        {event.refs.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {event.refs.map((r) => (
              <RefLink key={r.id} link={r} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
