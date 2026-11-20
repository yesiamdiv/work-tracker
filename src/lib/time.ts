/**
 * One timezone for the whole app.
 *
 * Every date in the database is a `timestamptz`, which is right — but the
 * server renders in UTC, and until now so did every label. For anyone east of
 * Greenwich that quietly moved the evening into tomorrow: an entry logged at
 * 21:00 in Delhi was filed under the next day and stamped 15:30.
 *
 * It matters much more now that the filters can ask for a time of day. "Between
 * 09:00 and 18:00" is a question about a wall clock, and a wall clock only
 * exists in a zone, so the zone has to be stated rather than inherited from
 * whichever machine happens to be running.
 */
/*
 * Read from a NEXT_PUBLIC_ variable so that the one name works on both sides.
 *
 * A server-only variable is inlined as undefined in the browser bundle, so a
 * client component would quietly fall back to the default and label the same
 * instant differently from the server that queried it. One name, one zone,
 * everywhere.
 */
export const APP_TZ =
  process.env.NEXT_PUBLIC_APP_TIMEZONE?.trim() || "Asia/Kolkata";

/**
 * How far `tz` is ahead of UTC at this instant, in milliseconds.
 *
 * Found by formatting the instant in the zone and reading the clock back: the
 * difference between what the zone's wall clock says and what UTC says is the
 * offset, and it is the only way to get this without shipping a tz database.
 */
function offsetMs(at: Date, tz: string): number {
  /*
   * Read the clock back on a whole second.
   *
   * `formatToParts` has no milliseconds, so comparing a sub-second instant
   * against its own second-precision readback folded the stray milliseconds
   * into the offset: the last millisecond of a day came out two seconds into
   * the next one. Flooring both sides keeps the offset a clean multiple of a
   * minute and leaves the caller's milliseconds untouched.
   */
  const floor = Math.floor(at.getTime() / 1000) * 1000;
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const { type, value } of f.formatToParts(new Date(floor))) {
    if (type !== "literal") p[type] = Number(value);
  }
  // `hour12: false` renders midnight as 24 in some engines.
  const wall = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour === 24 ? 0 : p.hour,
    p.minute,
    p.second,
  );
  return wall - floor;
}

/**
 * The instant at which a wall-clock time in `tz` occurs.
 *
 * Two passes, because the offset has to be looked up at some instant and the
 * instant is what we are solving for: the first guess lands within an hour, and
 * the second corrects it. Only a time that falls inside a DST transition can
 * still be ambiguous, and the default zone has no DST at all.
 */
export function zonedTime(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0,
  ms = 0,
  tz: string = APP_TZ,
): Date {
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss, ms);
  let at = new Date(wall - offsetMs(new Date(wall), tz));
  at = new Date(wall - offsetMs(at, tz));
  return at;
}

/** The wall-clock parts of an instant, in `tz`. */
export function zonedParts(at: Date | string, tz: string = APP_TZ) {
  const d = typeof at === "string" ? new Date(at) : at;
  const shifted = new Date(d.getTime() + offsetMs(d, tz));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    /** 1 = Monday … 7 = Sunday, matching Postgres `isodow`. */
    isoDow: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(),
  };
}

/** "2026-11-20" in `tz` — the key a day groups under, and what a date input wants. */
export function dayKey(at: Date | string, tz: string = APP_TZ): string {
  const p = zonedParts(at, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Today's date in `tz`, for defaulting and bounding a date input. */
export function todayKey(tz: string = APP_TZ): string {
  return dayKey(new Date(), tz);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/** A `YYYY-MM-DD` from the URL, or undefined if it is not one. */
export function parseDayKey(v: string | undefined | null) {
  const m = v?.trim().match(DATE_RE);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return { year, month, day };
}

/** An `HH:MM` from the URL, normalised, or undefined. */
export function parseClock(v: string | undefined | null) {
  const m = v?.trim().match(TIME_RE);
  if (!m) return undefined;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return undefined;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Start of that day in `tz`, as an instant. */
export function dayStart(key: string, tz: string = APP_TZ): Date | undefined {
  const p = parseDayKey(key);
  return p ? zonedTime(p.year, p.month, p.day, 0, 0, 0, 0, tz) : undefined;
}

/**
 * End of that day in `tz`, as an instant — the last millisecond, not the next
 * midnight, so the bound can be inclusive and read as the day the user typed.
 */
export function dayEnd(key: string, tz: string = APP_TZ): Date | undefined {
  const p = parseDayKey(key);
  return p ? zonedTime(p.year, p.month, p.day, 23, 59, 59, 999, tz) : undefined;
}

/** Move a `YYYY-MM-DD` by whole days, staying on calendar days. */
export function shiftDay(key: string, by: number, tz: string = APP_TZ): string {
  const p = parseDayKey(key);
  if (!p) return key;
  // Noon, so adding days cannot be undone by a DST shift of an hour.
  const at = zonedTime(p.year, p.month, p.day, 12, 0, 0, 0, tz);
  return dayKey(new Date(at.getTime() + by * 86_400_000), tz);
}

/** The Monday of the week a day falls in. */
export function weekStart(key: string, tz: string = APP_TZ): string {
  const p = parseDayKey(key);
  if (!p) return key;
  const at = zonedTime(p.year, p.month, p.day, 12, 0, 0, 0, tz);
  return shiftDay(key, -(zonedParts(at, tz).isoDow - 1), tz);
}

/** The first of the month a day falls in. */
export function monthStart(key: string): string {
  const p = parseDayKey(key);
  return p ? `${p.year}-${String(p.month).padStart(2, "0")}-01` : key;
}

/** A date for reading, "20 Nov 2026", in the app's zone. */
export function dayText(key: string, tz: string = APP_TZ): string {
  const at = dayStart(key, tz);
  if (!at) return key;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(at);
}

export const DOW_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
