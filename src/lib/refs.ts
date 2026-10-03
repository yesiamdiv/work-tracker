import type { refKind } from "@/db/schema";

type RefKind = (typeof refKind.enumValues)[number];

export type DetectedRef = {
  kind: RefKind;
  url: string;
  label: string | null;
  externalKey: string | null;
};

/** ABC-1234 — the Jira key shape. Uppercase project, dash, digits. */
const JIRA_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/;

const URL_RE = /https?:\/\/[^\s<>()"']+/g;

/**
 * Work out what a pasted URL actually is, so the user never picks from a
 * dropdown. Falls back to "other" rather than guessing wrongly.
 */
export function classifyUrl(raw: string): DetectedRef {
  const url = raw.replace(/[.,;:]+$/, "");
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname;
  } catch {
    return { kind: "other", url, label: null, externalKey: null };
  }

  // Jira: *.atlassian.net/browse/ABC-123, and self-hosted /browse/ABC-123.
  if (host.endsWith("atlassian.net") || path.includes("/browse/")) {
    const key = path.match(JIRA_KEY)?.[1] ?? null;
    // Jira Cloud also puts the key in ?selectedIssue= on board URLs.
    const fromQuery = url.match(JIRA_KEY)?.[1] ?? null;
    const external = key ?? fromQuery;
    if (host.endsWith("atlassian.net") && path.startsWith("/wiki")) {
      return { kind: "confluence", url, label: null, externalKey: null };
    }
    return { kind: "jira", url, label: external, externalKey: external };
  }

  if (host === "docs.google.com") {
    if (path.startsWith("/spreadsheets"))
      return { kind: "sheet", url, label: null, externalKey: docId(path) };
    if (path.startsWith("/presentation"))
      return { kind: "slide", url, label: null, externalKey: docId(path) };
    if (path.startsWith("/document"))
      return { kind: "doc", url, label: null, externalKey: docId(path) };
  }

  if (host === "drive.google.com")
    return { kind: "doc", url, label: null, externalKey: null };

  if (host === "github.com" || host === "gitlab.com") {
    const pr = path.match(/\/(?:pull|merge_requests)\/(\d+)/);
    if (pr) return { kind: "pr", url, label: `#${pr[1]}`, externalKey: pr[1] };
    return { kind: "repo", url, label: null, externalKey: null };
  }

  if (/jenkins|circleci|github\.com\/.+\/actions|bitrise|teamcity/.test(url))
    return { kind: "build", url, label: null, externalKey: null };

  if (host.includes("confluence"))
    return { kind: "confluence", url, label: null, externalKey: null };

  return { kind: "other", url, label: host, externalKey: null };
}

function docId(path: string): string | null {
  return path.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1] ?? null;
}

/** Every URL in a block of text, classified and de-duplicated. */
export function extractRefs(text: string): DetectedRef[] {
  const seen = new Set<string>();
  const out: DetectedRef[] = [];
  for (const m of text.match(URL_RE) ?? []) {
    const ref = classifyUrl(m);
    if (seen.has(ref.url)) continue;
    seen.add(ref.url);
    out.push(ref);
  }
  return out;
}

/**
 * Bare Jira keys typed in prose ("blocked on QA-88"), so you get the ticket
 * cross-reference without pasting a URL. Only used when a base URL is known.
 */
export function extractBareJiraKeys(text: string): string[] {
  const withoutUrls = text.replace(URL_RE, " ");
  const keys = new Set<string>();
  for (const m of withoutUrls.matchAll(new RegExp(JIRA_KEY, "g"))) {
    keys.add(m[1]);
  }
  return [...keys];
}
