import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function dayLabel(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (isSameDay(d, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
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
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const group = groups.get(key) ?? { label: dayLabel(d), rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}
