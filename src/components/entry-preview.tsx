import { Meta } from "@/components/ui";
import { KIND_LABEL, type ParsedCapture } from "@/lib/capture";

/**
 * Reports what the app understood from the text — kind, outcome, links, tags.
 *
 * Without it the shorthand markers are invisible magic, which is how the first
 * version read. Both compose boxes showed a version of this; they had drifted
 * to different wording and different fields.
 */
export function EntryPreview({
  parsed,
  compact = false,
}: {
  parsed: ParsedCapture | null;
  /** Inline on one line, for the tighter box on a task page. */
  compact?: boolean;
}) {
  if (!parsed) return null;

  const kind = (
    <>
      <span className="text-body">{KIND_LABEL[parsed.kind]}</span>
      {parsed.outcome && (
        <>
          {" · "}
          <span className="text-body">{parsed.outcome}</span>
        </>
      )}
    </>
  );

  if (compact) {
    return (
      <Meta className="text-muted">
        Reading this as {kind}
        {parsed.refs.length > 0 && (
          <>
            {" · "}
            <span className="text-body">
              {parsed.refs.length} link{parsed.refs.length > 1 ? "s" : ""}
            </span>
          </>
        )}
      </Meta>
    );
  }

  return (
    <div className="mt-3 rounded-xs border border-line px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Meta className="text-muted">Reading this as: {kind}</Meta>

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
            tags{" "}
            <span className="text-body">
              {parsed.tags.map((t) => `#${t}`).join(" ")}
            </span>
          </Meta>
        )}
      </div>
    </div>
  );
}
