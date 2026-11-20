/**
 * Checks the filters against the real database.
 *
 * There is no test framework here, and the filter layer is the one part of
 * this app where being quietly wrong is invisible: a time-of-day window off by
 * a timezone still returns entries, just not the right ones. So the properties
 * that must hold are asserted rather than eyeballed.
 *
 *   npm run check:filters
 */
import { feed } from "@/db/feed";
import { parseFilters, rangeBounds, toFeedFilters } from "@/lib/filters";
import {
  APP_TZ,
  dayEnd,
  dayKey,
  dayStart,
  shiftDay,
  weekStart,
  zonedParts,
  zonedTime,
} from "@/lib/time";

const fails: string[] = [];
let checks = 0;

function ok(cond: boolean, what: string, detail = "") {
  checks++;
  if (!cond) fails.push(`${what}${detail ? ` — ${detail}` : ""}`);
}

function eq(got: unknown, want: unknown, what: string) {
  ok(got === want, what, `got ${String(got)}, wanted ${String(want)}`);
}

/** A window small enough that feed()'s 200-row ceiling cannot confound set algebra. */
const WINDOW = { from: "2026-10-01", to: "2026-10-31" };

async function get(sp: Record<string, string>) {
  const f = parseFilters({ ...WINDOW, ...sp });
  const { entries } = await feed(toFeedFilters(f, { limit: 200 }));
  return entries;
}

async function main() {
  /* ---------------------------------------------------------------- zone --- */

  eq(
    dayStart("2026-11-20", "Asia/Kolkata")?.toISOString(),
    "2026-11-19T18:30:00.000Z",
    "IST day starts 05:30 before UTC midnight",
  );
  eq(
    dayEnd("2026-11-20", "Asia/Kolkata")?.toISOString(),
    "2026-11-20T18:29:59.999Z",
    "a day ends on its last millisecond, not two seconds into the next",
  );
  eq(
    dayKey(new Date("2026-11-20T18:45:00Z"), "Asia/Kolkata"),
    "2026-11-21",
    "an entry past 18:30 UTC belongs to the next IST day",
  );
  eq(zonedParts(new Date("2026-11-20T03:30:00Z"), "Asia/Kolkata").hour, 9, "03:30Z is 09:00 IST");
  eq(zonedParts(new Date("2026-11-20T03:30:00Z"), "Asia/Kolkata").isoDow, 5, "2026-11-20 is a Friday");

  // The two-pass offset correction has to survive zones that observe DST.
  for (const tz of ["America/New_York", "Europe/London", "Australia/Sydney", "Asia/Kolkata"]) {
    for (const [y, m, d] of [[2026, 3, 8], [2026, 7, 1], [2026, 10, 25], [2026, 11, 20]] as const) {
      const back = zonedParts(zonedTime(y, m, d, 9, 30, 0, 0, tz), tz);
      ok(
        back.hour === 9 && back.minute === 30 && back.day === d && back.month === m,
        `${tz} ${y}-${m}-${d} 09:30 round-trips`,
        JSON.stringify(back),
      );
    }
  }

  eq(shiftDay("2026-03-01", -1), "2026-02-28", "day arithmetic crosses a month");
  eq(shiftDay("2026-01-01", -1), "2025-12-31", "day arithmetic crosses a year");
  eq(weekStart("2026-11-20"), "2026-11-16", "the week starts on Monday");

  /* ------------------------------------------------------------- parsing --- */

  const junk = parseFilters({
    from: "garbage",
    to: "2026-13-45",
    t0: "99:99",
    t1: "7pm",
    dow: "9,0,abc",
    kind: "nonsense",
    outcome: "maybe",
    subject: "notauuid",
    task: "also-not",
  });
  eq(junk.fromDay, undefined, "a malformed date is dropped");
  eq(junk.toDay, undefined, "an impossible date is dropped");
  eq(junk.clockFrom, undefined, "an impossible time is dropped");
  eq(junk.clockTo, undefined, "a non-24h time is dropped");
  eq(junk.daysOfWeek.length, 0, "out-of-range weekdays are dropped");
  eq(junk.kinds.length, 0, "an unknown kind is dropped");
  eq(junk.outcomes.length, 0, "an unknown outcome is dropped");
  eq(junk.subjectIds.length, 0, "a non-uuid subject is dropped");
  eq(junk.taskIds.length, 0, "a non-uuid task is dropped");

  eq(parseFilters({ dow: "1,2,3,4,5,6,7" }).daysOfWeek.length, 0, "all seven weekdays means no filter");
  eq(parseFilters({ days: "30" }).range, "30d", "the old days= parameter still resolves");
  eq(
    parseFilters({ range: "thismonth", from: "2026-10-01" }).range,
    undefined,
    "an exact date overrides a named range",
  );
  ok(
    rangeBounds(parseFilters({ range: "today" })).to !== undefined,
    "a single-day range is bounded at both ends",
  );

  /* ------------------------------------------------------------- algebra --- */

  const all = await get({});
  ok(all.length > 0 && all.length < 200, "the sample window is non-empty and under the ceiling", `${all.length}`);

  const wd = await get({ dow: "1,2,3,4,5" });
  const we = await get({ dow: "6,7" });
  eq(wd.length + we.length, all.length, "weekdays and weekends partition the window");
  eq(wd.filter((e) => zonedParts(e.occurredAt).isoDow > 5).length, 0, "no weekend entry in the weekday filter");
  eq(we.filter((e) => zonedParts(e.occurredAt).isoDow < 6).length, 0, "no weekday entry in the weekend filter");

  // Four disjoint six-hour buckets must cover the window exactly.
  let summed = 0;
  for (let h = 0; h < 24; h += 6) {
    const lo = `${String(h).padStart(2, "0")}:00`;
    const hi = `${String(h + 5).padStart(2, "0")}:59`;
    const got = await get({ t0: lo, t1: hi });
    summed += got.length;
    eq(
      got.filter((e) => {
        const hh = zonedParts(e.occurredAt).hour;
        return hh < h || hh > h + 5;
      }).length,
      0,
      `the ${lo}-${hi} window holds only entries from it`,
    );
  }
  eq(summed, all.length, "the six-hour buckets cover the window exactly");

  // A window written backwards wraps midnight, and is the complement of its inverse.
  const night = await get({ t0: "22:00", t1: "05:59" });
  const day = await get({ t0: "06:00", t1: "21:59" });
  eq(night.length + day.length, all.length, "a wrapping window complements its inverse");
  eq(
    night.filter((e) => {
      const h = zonedParts(e.occurredAt).hour;
      return h < 22 && h >= 6;
    }).length,
    0,
    "the overnight window holds nothing from the daytime",
  );

  // Several of one filter is a union; different filters intersect.
  const dayOnly = await get({ from: "2026-10-28", to: "2026-10-28" });
  eq(
    dayOnly.filter((e) => dayKey(e.occurredAt) !== "2026-10-28").length,
    0,
    "a single-day range holds only that day",
  );
  const noteOrBug = await get({ kind: "note,bug_found" });
  const note = await get({ kind: "note" });
  const bug = await get({ kind: "bug_found" });
  eq(noteOrBug.length, note.length + bug.length, "two kinds union rather than intersect");
  ok(
    noteOrBug.length <= all.length,
    "a union of kinds is still inside the window",
    `${noteOrBug.length} vs ${all.length}`,
  );

  /* -------------------------------------------------------------- report --- */

  console.log(`zone ${APP_TZ} · ${checks} checks`);
  if (fails.length) {
    console.log(`\n${fails.length} FAILED:`);
    for (const f of fails) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("all passed");
}

main();
