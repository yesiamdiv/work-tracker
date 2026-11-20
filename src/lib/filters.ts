import type { FeedFilters } from "@/db/feed";
import type { eventKind, eventOutcome } from "@/db/schema";
import { KIND_LABEL } from "@/lib/capture";
import {
  APP_TZ,
  dayEnd,
  dayStart,
  dayText,
  DOW_LABEL,
  monthStart,
  parseClock,
  parseDayKey,
  shiftDay,
  todayKey,
  weekStart,
} from "@/lib/time";

/**
 * The filters, in one place.
 *
 * They were parsed three times over — once in the Stream page, once in the
 * assistant's page and once more in its server actions — and the three had
 * already drifted: only one of them validated the enums, and none of them
 * could express more than a single subject or a range rounded to whole days
 * from this instant.
 *
 * Everything about a filter now lives here: its name in the URL, how it is
 * read, how it is written back, what it narrows to, and how it reads in
 * English. The pieces are deliberately free of database access so the filter
 * bar can import them too.
 */

type Kind = (typeof eventKind.enumValues)[number];
type Outcome = (typeof eventOutcome.enumValues)[number];

/*
 * The enum values at runtime, without importing the schema.
 *
 * The filter bar is a client component, and the schema module pulls Drizzle's
 * whole pg-core with it — so the types come across as types, which compile
 * away, and the values are listed here.
 *
 * KIND_VALUES cannot drift: KIND_LABEL is typed as covering every kind, so its
 * keys are exactly the enum. OUTCOMES is written out, and the two assignments
 * below fail to compile if the database enum ever gains or loses a value.
 */
export const KIND_VALUES = Object.keys(KIND_LABEL) as Kind[];

export const OUTCOMES = ["pass", "fail", "partial", "inconclusive"] as const;

const _outcomesAreValid: readonly Outcome[] = OUTCOMES;
const _outcomesAreComplete: readonly (typeof OUTCOMES)[number][] = [] as Outcome[];
void _outcomesAreValid;
void _outcomesAreComplete;

/** Raw, as it arrives from the address bar. */
export type FilterParams = {
  q?: string;
  /** Comma-separated uuids. */
  subject?: string;
  task?: string;
  /** Comma-separated enum values. */
  kind?: string;
  outcome?: string;
  refs?: string;
  /** A named or rolling range; see {@link RANGES}. */
  range?: string;
  /** Absolute days, `YYYY-MM-DD`, inclusive both ends. */
  from?: string;
  to?: string;
  /** A window on the wall clock, `HH:MM`. */
  t0?: string;
  t1?: string;
  /** ISO weekdays, comma-separated, 1 = Monday. */
  dow?: string;
  /** Superseded by `range`, still read so old links keep working. */
  days?: string;
  page?: string;
};

export type Filters = {
  q?: string;
  subjectIds: string[];
  taskIds: string[];
  kinds: Kind[];
  outcomes: Outcome[];
  withRefs: boolean;
  /** One of {@link RANGES}, unless an absolute range is set. */
  range?: string;
  fromDay?: string;
  toDay?: string;
  clockFrom?: string;
  clockTo?: string;
  daysOfWeek: number[];
  page: number;
};

/**
 * The ranges worth a single click.
 *
 * Named rather than a number of days because the calendar-aligned ones cannot
 * be said in days at all — "this month" is 20 days long today and 31 next
 * week. They stay relative, so a bookmarked link still means this week when
 * it is opened next week; an absolute `from`/`to` is for pinning a range down.
 */
export const RANGES: { v: string; label: string }[] = [
  { v: "today", label: "Today" },
  { v: "yesterday", label: "Yesterday" },
  { v: "7d", label: "Last 7 days" },
  { v: "30d", label: "Last 30 days" },
  { v: "90d", label: "Last 90 days" },
  { v: "thisweek", label: "This week" },
  { v: "lastweek", label: "Last week" },
  { v: "thismonth", label: "This month" },
  { v: "lastmonth", label: "Last month" },
  { v: "365d", label: "Last year" },
];

const RANGE_LABEL = new Map(RANGES.map((r) => [r.v, r.label]));

/** Shifts worth having on a wall clock, for the common working shapes. */
export const CLOCK_PRESETS: { label: string; t0: string; t1: string }[] = [
  { label: "Morning", t0: "06:00", t1: "12:00" },
  { label: "Afternoon", t0: "12:00", t1: "17:00" },
  { label: "Evening", t0: "17:00", t1: "22:00" },
  { label: "Overnight", t0: "22:00", t1: "06:00" },
  { label: "Office hours", t0: "09:30", t1: "18:30" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Split a comma-separated parameter, keeping only what passes `ok`. */
function list(v: string | undefined, ok: (s: string) => boolean): string[] {
  if (!v) return [];
  return [
    ...new Set(
      v
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && ok(s)),
    ),
  ];
}

/** Read the address bar. Anything unrecognised is dropped, never thrown. */
export function parseFilters(sp: FilterParams): Filters {
  const kinds = list(sp.kind, (s) =>
    KIND_VALUES.includes(s as Kind),
  ) as Filters["kinds"];
  const outcomes = list(sp.outcome, (s) =>
    OUTCOMES.includes(s as (typeof OUTCOMES)[number]),
  ) as Filters["outcomes"];

  const fromDay = parseDayKey(sp.from) ? sp.from!.trim() : undefined;
  const toDay = parseDayKey(sp.to) ? sp.to!.trim() : undefined;

  // An absolute range is more specific, so it wins over a named one. `days=N`
  // is the old parameter, kept so existing links and bookmarks still resolve.
  let range: string | undefined;
  if (!fromDay && !toDay) {
    if (sp.range && RANGE_LABEL.has(sp.range)) range = sp.range;
    else {
      // `days=30` becomes the rolling range `30d`, which resolves the same way.
      const n = Number(sp.days ?? 0) || 0;
      if (n > 0) range = `${n}d`;
    }
  }

  const dow = list(sp.dow, (s) => /^[1-7]$/.test(s))
    .map(Number)
    .sort();

  return {
    q: sp.q?.trim() || undefined,
    subjectIds: list(sp.subject, (s) => UUID.test(s)),
    taskIds: list(sp.task, (s) => UUID.test(s)),
    kinds,
    outcomes,
    withRefs: sp.refs === "1",
    range,
    fromDay,
    toDay,
    clockFrom: parseClock(sp.t0),
    clockTo: parseClock(sp.t1),
    daysOfWeek: dow.length === 7 ? [] : dow,
    page: Math.max(0, Number(sp.page ?? 0) || 0),
  };
}

/**
 * The two instants a range covers.
 *
 * Resolved in {@link APP_TZ} and aligned to calendar days, because "the last
 * 7 days" asked on a Friday afternoon means seven days, not the 168 hours
 * ending now — which would cut Friday a week ago in half.
 */
export function rangeBounds(
  f: Filters,
  tz: string = APP_TZ,
): { from?: Date; to?: Date } {
  if (f.fromDay || f.toDay) {
    return {
      from: f.fromDay ? dayStart(f.fromDay, tz) : undefined,
      to: f.toDay ? dayEnd(f.toDay, tz) : undefined,
    };
  }
  if (!f.range) return {};

  const today = todayKey(tz);
  const rolling = f.range.match(/^(\d+)d$/);
  if (rolling) {
    const n = Math.max(1, Number(rolling[1]));
    return { from: dayStart(shiftDay(today, -(n - 1), tz), tz) };
  }
  switch (f.range) {
    case "today":
      return { from: dayStart(today, tz), to: dayEnd(today, tz) };
    case "yesterday": {
      const y = shiftDay(today, -1, tz);
      return { from: dayStart(y, tz), to: dayEnd(y, tz) };
    }
    case "thisweek":
      return { from: dayStart(weekStart(today, tz), tz) };
    case "lastweek": {
      const start = shiftDay(weekStart(today, tz), -7, tz);
      return { from: dayStart(start, tz), to: dayEnd(shiftDay(start, 6, tz), tz) };
    }
    case "thismonth":
      return { from: dayStart(monthStart(today), tz) };
    case "lastmonth": {
      const end = shiftDay(monthStart(today), -1, tz);
      return { from: dayStart(monthStart(end), tz), to: dayEnd(end, tz) };
    }
    default:
      return {};
  }
}

/** What the database should be asked for. */
export function toFeedFilters(
  f: Filters,
  extra: { limit?: number; offset?: number } = {},
): FeedFilters {
  const { from, to } = rangeBounds(f);
  return {
    q: f.q,
    subjectIds: f.subjectIds,
    taskIds: f.taskIds,
    kinds: f.kinds,
    outcomes: f.outcomes,
    withRefs: f.withRefs,
    from,
    to,
    clockFrom: f.clockFrom,
    clockTo: f.clockTo,
    daysOfWeek: f.daysOfWeek,
    ...extra,
  };
}

/** Back to a query string, dropping everything at its default. */
export function toParams(f: Filters): URLSearchParams {
  const u = new URLSearchParams();
  if (f.q) u.set("q", f.q);
  if (f.subjectIds.length) u.set("subject", f.subjectIds.join(","));
  if (f.taskIds.length) u.set("task", f.taskIds.join(","));
  if (f.kinds.length) u.set("kind", f.kinds.join(","));
  if (f.outcomes.length) u.set("outcome", f.outcomes.join(","));
  if (f.withRefs) u.set("refs", "1");
  if (f.range) u.set("range", f.range);
  if (f.fromDay) u.set("from", f.fromDay);
  if (f.toDay) u.set("to", f.toDay);
  if (f.clockFrom) u.set("t0", f.clockFrom);
  if (f.clockTo) u.set("t1", f.clockTo);
  if (f.daysOfWeek.length) u.set("dow", f.daysOfWeek.join(","));
  return u;
}

/** How many filters are narrowing the view — the number on the badge. */
export function activeCount(f: Filters): number {
  return (
    (f.q ? 1 : 0) +
    f.subjectIds.length +
    f.taskIds.length +
    f.kinds.length +
    f.outcomes.length +
    (f.withRefs ? 1 : 0) +
    (f.range || f.fromDay || f.toDay ? 1 : 0) +
    (f.clockFrom || f.clockTo ? 1 : 0) +
    (f.daysOfWeek.length ? 1 : 0)
  );
}

export function isActive(f: Filters): boolean {
  return activeCount(f) > 0;
}

/** The date part, in English. */
export function rangeText(f: Filters, tz: string = APP_TZ): string | null {
  if (f.fromDay && f.toDay)
    return f.fromDay === f.toDay
      ? dayText(f.fromDay, tz)
      : `${dayText(f.fromDay, tz)} – ${dayText(f.toDay, tz)}`;
  if (f.fromDay) return `from ${dayText(f.fromDay, tz)}`;
  if (f.toDay) return `up to ${dayText(f.toDay, tz)}`;
  if (f.range) return RANGE_LABEL.get(f.range) ?? `last ${f.range.replace("d", " days")}`;
  return null;
}

/** The wall-clock part, in English. */
export function clockText(f: Filters): string | null {
  if (f.clockFrom && f.clockTo) {
    const wraps = f.clockFrom > f.clockTo;
    return `${f.clockFrom}–${f.clockTo}${wraps ? " (over midnight)" : ""}`;
  }
  if (f.clockFrom) return `from ${f.clockFrom}`;
  if (f.clockTo) return `until ${f.clockTo}`;
  return null;
}

export function dowText(f: Filters): string | null {
  if (!f.daysOfWeek.length) return null;
  const names = f.daysOfWeek.map((d) => DOW_LABEL[d - 1]);
  if (names.length === 5 && f.daysOfWeek.join() === "1,2,3,4,5") return "weekdays";
  if (names.length === 2 && f.daysOfWeek.join() === "6,7") return "weekends";
  return names.join(", ");
}

/**
 * The whole selection in words, without touching the database.
 *
 * Subject and task names need a lookup, so the caller passes whatever it has
 * already loaded for its dropdowns; anything unnamed is simply left out rather
 * than printed as a uuid.
 */
export function describe(
  f: Filters,
  names: { subjects?: Map<string, string>; tasks?: Map<string, string> } = {},
  tz: string = APP_TZ,
): string {
  const parts: string[] = [];
  if (f.q) parts.push(`matching "${f.q}"`);

  const subs = f.subjectIds.map((id) => names.subjects?.get(id)).filter(Boolean);
  if (subs.length)
    parts.push(`about ${subs.join(" or ")} (including their parts)`);

  const ts = f.taskIds.map((id) => names.tasks?.get(id)).filter(Boolean);
  if (ts.length)
    parts.push(`on the task${ts.length > 1 ? "s" : ""} ${ts.map((t) => `"${t}"`).join(" or ")}`);

  if (f.kinds.length)
    parts.push(`of kind ${f.kinds.map((k) => KIND_LABEL[k]).join(" or ")}`);
  if (f.outcomes.length) parts.push(`with outcome ${f.outcomes.join(" or ")}`);
  if (f.withRefs) parts.push("that carry a link");

  const range = rangeText(f, tz);
  if (range) parts.push(/^(from|up to)/.test(range) ? range : `within ${range}`);

  const clock = clockText(f);
  if (clock) parts.push(`between ${clock} local time`);

  const dow = dowText(f);
  if (dow) parts.push(`on ${dow}`);

  return parts.length ? `Entries ${parts.join(", ")}` : "All entries";
}
