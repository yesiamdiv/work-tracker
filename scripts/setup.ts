/**
 * Seeds enough realistic data that the app has something to look at.
 *
 *   npm run setup
 *
 * Works against whichever database the app is pointed at: Neon when
 * DATABASE_URL is set, local PGlite otherwise. Idempotent — re-running leaves
 * existing data alone.
 */
import { PGlite } from "@electric-sql/pglite";
import { config } from "dotenv";
import { desc, eq } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "../src/db/schema";
import { events, refs, subjects, taskSubjects, tasks } from "../src/db/schema";

config({ path: ".env.local" });

type Db = PgliteDatabase<typeof schema>;

async function open(): Promise<{ db: Db; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;

  if (url) {
    // Neon: the schema is applied by `npm run db:push`, not from here.
    const { neon } = await import("@neondatabase/serverless");
    console.log("target: Neon");
    const db = drizzleNeon(neon(url), { schema }) as unknown as Db;
    return { db, close: async () => {} };
  }

  const client = new PGlite(process.env.PGLITE_DIR ?? "./.pglite");
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("target: local PGlite — migrations applied");
  return { db, close: () => client.close() };
}

async function main() {
  const { db, close } = await open();

  const existing = await db.select({ id: subjects.id }).from(subjects).limit(1);
  if (existing.length) {
    console.log("already seeded — nothing to do");
    await close();
    return;
  }

  // Two top-level subjects, each with children, to exercise the nesting.
  const [acme] = await db
    .insert(subjects)
    .values({
      name: "Acme Corp",
      slug: "acme-corp",
      kind: "client",
      colour: "#6b7280",
      description: "Wearables client. Firmware plus companion apps.",
    })
    .returning();

  const [acmeFw, acmeAndroid] = await db
    .insert(subjects)
    .values([
      {
        name: "Firmware 2.x",
        slug: "acme-firmware-2x",
        kind: "firmware",
        parentId: acme.id,
        colour: "#8b7355",
      },
      {
        name: "Android app",
        slug: "acme-android",
        kind: "mobile_app",
        parentId: acme.id,
        colour: "#5f7a6b",
      },
    ])
    .returning();

  const [sdk] = await db
    .insert(subjects)
    .values({
      name: "Core SDK",
      slug: "core-sdk",
      kind: "sdk",
      colour: "#7d6b80",
      description: "Shared across all clients.",
    })
    .returning();

  const [regression, automation, sdkBug] = await db
    .insert(tasks)
    .values([
      {
        title: "Regression suite — FW 2.4.1 release candidate",
        type: "regression",
        status: "in_progress",
        priority: 1,
      },
      {
        title: "Automate onboarding flow — Android",
        type: "automation",
        status: "in_progress",
      },
      {
        // Spans two subjects: the point of the many-to-many.
        title: "BLE reconnect fails after deep sleep",
        type: "investigation",
        status: "blocked",
        priority: 1,
      },
    ])
    .returning();

  await db.insert(taskSubjects).values([
    { taskId: regression.id, subjectId: acmeFw.id, isPrimary: 1 },
    { taskId: automation.id, subjectId: acmeAndroid.id, isPrimary: 1 },
    { taskId: sdkBug.id, subjectId: sdk.id, isPrimary: 1 },
    { taskId: sdkBug.id, subjectId: acmeFw.id, isPrimary: 0 },
  ]);

  const h = (n: number) => new Date(Date.now() - n * 3600_000);

  const seeded = await db
    .insert(events)
    .values([
      {
        taskId: regression.id,
        kind: "milestone",
        body: "RC build 2.4.1-rc3 flashed to 6 units, 2 each of rev B/C/D.",
        occurredAt: h(52),
      },
      {
        taskId: regression.id,
        kind: "test_run",
        outcome: "pass",
        body: "Core suite green — 184/184 on rev C.",
        occurredAt: h(49),
        meta: { suite: "core", build: "2.4.1-rc3", unit: "rev-C" },
      },
      {
        taskId: regression.id,
        kind: "test_run",
        outcome: "fail",
        body: "Power suite: 3 failures on rev B only. Sleep current 4x expected.",
        occurredAt: h(47),
        meta: { suite: "power", build: "2.4.1-rc3", unit: "rev-B" },
      },
      {
        taskId: regression.id,
        kind: "bug_found",
        body: "Raised ACME-4421 for the rev B sleep current. Attached scope traces.",
        occurredAt: h(46),
      },
      {
        taskId: regression.id,
        kind: "decision",
        body: "Agreed with hardware to treat rev B as out of scope for this release — it is not shipping to customers.",
        occurredAt: h(26),
      },
      {
        taskId: automation.id,
        kind: "note",
        body: "Page objects scaffolded for the 5 onboarding screens.",
        occurredAt: h(30),
      },
      {
        taskId: automation.id,
        kind: "test_run",
        outcome: "inconclusive",
        body: "Permission dialog step flaky — passes in isolation, fails in suite about 1 run in 4. Suspect an implicit wait.",
        occurredAt: h(5),
      },
      {
        taskId: sdkBug.id,
        kind: "bug_found",
        body: "Reconnect never fires after >30min deep sleep. Reproduced on 4 of 4 units.",
        occurredAt: h(72),
      },
      {
        taskId: sdkBug.id,
        kind: "question",
        body: "Is the SDK meant to re-arm the scan itself after a sleep wake, or is that the app's job? Spec is silent.",
        occurredAt: h(70),
      },
      {
        taskId: sdkBug.id,
        kind: "blocker",
        body: "Waiting on firmware team for a debug build with BLE stack logging.",
        occurredAt: h(20),
      },
    ])
    .returning();

  const bugEvent = seeded.find((e) => e.body.startsWith("Raised ACME-4421"))!;
  const flakyEvent = seeded.find((e) => e.body.includes("Permission dialog"))!;

  await db.insert(refs).values([
    {
      eventId: bugEvent.id,
      taskId: regression.id,
      kind: "jira",
      url: "https://acme.atlassian.net/browse/ACME-4421",
      label: "ACME-4421",
      externalKey: "ACME-4421",
    },
    {
      taskId: regression.id,
      kind: "sheet",
      url: "https://docs.google.com/spreadsheets/d/1exampleFw241TestMatrix/edit",
      label: "FW 2.4.1 test matrix",
      externalKey: "1exampleFw241TestMatrix",
    },
    {
      eventId: flakyEvent.id,
      taskId: automation.id,
      kind: "pr",
      url: "https://github.com/acme/android-e2e/pull/318",
      label: "#318",
      externalKey: "318",
    },
    {
      taskId: sdkBug.id,
      kind: "jira",
      url: "https://acme.atlassian.net/browse/SDK-882",
      label: "SDK-882",
      externalKey: "SDK-882",
    },
  ]);

  // Keep the Today ordering honest.
  for (const t of [regression, automation, sdkBug]) {
    const [latest] = await db
      .select({ at: events.occurredAt })
      .from(events)
      .where(eq(events.taskId, t.id))
      .orderBy(desc(events.occurredAt))
      .limit(1);
    if (latest) {
      await db
        .update(tasks)
        .set({ lastActivityAt: latest.at })
        .where(eq(tasks.id, t.id));
    }
  }

  console.log("seeded 3 subjects + 2 children, 3 tasks, 10 events, 4 refs");
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
