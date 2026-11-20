import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { APP_TZ, dayKey, shiftDay, todayKey } from "@/lib/time";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "4m", "3h", "2d", "5w" — short enough to sit quietly at the end of a row. */
export function ago(date: Date | string): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const secs = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (secs < 60) return "now";
  const mins = secs / 60;
  if (mins < 60) return `${Math.floor(mins)}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.floor(hrs)}h`;
  const days = hrs / 24;
  if (days < 7) return `${Math.floor(days)}d`;
  const weeks = days / 7;
  if (weeks < 52) return `${Math.floor(weeks)}w`;
  return `${Math.floor(days / 365)}y`;
}

/*
 * Every label below is rendered in the app's zone rather than the machine's.
 *
 * These run in server components, and the server is UTC — so east of
 * Greenwich the whole log was shifted: an entry made at 21:00 was stamped
 * 15:30 and filed under the following day\'s heading. The day a thing
 * happened on is the day its own clock showed.
 */
const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function dayLabel(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const key = dayKey(d);
  const today = todayKey();
  if (key === today) return "Today";
  if (key === shiftDay(today, -1)) return "Yesterday";
  return DAY_FMT.format(d);
}

export function timeLabel(date: Date | string): string {
  return TIME_FMT.format(typeof date === "string" ? new Date(date) : date);
}

/** Group rows into day buckets, newest day first, for the stream. */
export function byDay<T>(rows: T[], pick: (row: T) => Date | string) {
  const groups = new Map<string, { label: string; rows: T[] }>();
  for (const row of rows) {
    const d = new Date(pick(row) as string);
    const key = dayKey(d);
    const group = groups.get(key) ?? { label: dayLabel(d), rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}
