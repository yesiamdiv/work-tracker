"use server";

import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { withRetry } from "@/db/retry";
import { events, refs, subjects, taskSubjects, tasks } from "@/db/schema";
import { aiErrorMessage, askJson, askText } from "@/lib/ai";
import { KIND_LABEL } from "@/lib/capture";
import { getSession } from "@/lib/session";
import { subjectFilterIds } from "@/lib/subjects";

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  return session.email;
}

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Every action returns rather than throws, so the UI can show the reason. */
async function guard<T>(run: () => Promise<T>): Promise<AiResult<T>> {
  try {
    await requireUser();
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error: aiErrorMessage(error) };
  }
}

/* ------------------------------------------------------------- summaries --- */

export type SummaryScope =
  | { type: "task"; id: string }
  | { type: "subject"; id: string }
  | { type: "period"; days: number; label: string };

/**
 * Renders the entries as plain text for the model.
 *
 * Deliberately verbose about dates, kinds and ticket keys: those are exactly
 * what a summary needs to cite, and the model cannot cite what it never saw.
 */
async function gather(scope: SummaryScope) {
  return withRetry("ai.gather", async () => {
    const where = [];
    let heading = "";

    if (scope.type === "task") {
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, scope.id))
        .limit(1);
      if (!task) throw new Error("Task not found");
      heading = `Task: ${task.title} (${task.type.replace(/_/g, " ")}, status ${task.status})`;
      where.push(eq(events.taskId, scope.id));
    } else if (scope.type === "subject") {
      const [subject] = await db
        .select()
        .from(subjects)
        .where(eq(subjects.id, scope.id))
        .limit(1);
      if (!subject) throw new Error("Subject not found");
      heading = `Subject: ${subject.name} (${subject.kind.replace(/_/g, " ")})`;
      const ids = await subjectFilterIds(scope.id);
      const taskIds = await db
        .selectDistinct({ id: taskSubjects.taskId })
        .from(taskSubjects)
        .where(inArray(taskSubjects.subjectId, ids));
      if (!taskIds.length) return { heading, lines: [] as string[] };
      where.push(
        inArray(
          events.taskId,
          taskIds.map((t) => t.id),
        ),
      );
    } else {
      heading = `Everything logged in the ${scope.label}`;
      where.push(
        gte(events.occurredAt, new Date(Date.now() - scope.days * 86_400_000)),
      );
    }

    const rows = await db
      .select({
        body: events.body,
        kind: events.kind,
        outcome: events.outcome,
        occurredAt: events.occurredAt,
        taskTitle: tasks.title,
      })
      .from(events)
      .innerJoin(tasks, eq(tasks.id, events.taskId))
      .where(and(...where))
      .orderBy(asc(events.occurredAt))
      .limit(400);

    const keys = await db
      .selectDistinct({ key: refs.externalKey, url: refs.url })
      .from(refs)
      .limit(100);

    const lines = rows.map((r) => {
      const date = r.occurredAt.toISOString().slice(0, 10);
      const outcome = r.outcome ? `/${r.outcome}` : "";
      const task = scope.type === "task" ? "" : ` [${r.taskTitle}]`;
      return `${date} (${KIND_LABEL[r.kind]}${outcome})${task}: ${r.body}`;
    });

    const tickets = keys.map((k) => k.key).filter(Boolean);
    if (tickets.length) {
      lines.push(`\nTicket keys referenced: ${tickets.join(", ")}`);
    }

    return { heading, lines };
  });
}

const SUMMARY_SYSTEM = `You summarise a QA engineer's own log of their work, for them to re-read later.

Rules:
- Be specific. Name the builds, devices, ticket keys and numbers that appear in the entries.
- Never invent anything. If the log does not say it, do not say it.
- Lead with what broke or is outstanding; finish with what is settled.
- Short bullets, no preamble, no heading, no sign-off. Six bullets at most.
- Plain text. No markdown bold, no emoji.
- If there is nothing of substance, say so in one line.`;

export async function summarise(scope: SummaryScope): Promise<AiResult<string>> {
  return guard(async () => {
    const { heading, lines } = await gather(scope);
    if (!lines.length) return "Nothing logged for this yet.";

    return askText({
      system: SUMMARY_SYSTEM,
      user: `${heading}\n\nEntries, oldest first:\n\n${lines.join("\n")}`,
      tier: "standard",
      effort: "medium",
    });
  });
}

/** Caches a task's summary on the row, so re-reading it costs nothing. */
export async function summariseTask(taskId: string): Promise<AiResult<string>> {
  const result = await summarise({ type: "task", id: taskId });
  if (result.ok) {
    await db
      .update(tasks)
      .set({ summary: result.data, summaryAt: new Date() })
      .where(eq(tasks.id, taskId));
  }
  return result;
}

export async function summariseSubject(
  subjectId: string,
): Promise<AiResult<string>> {
  const result = await summarise({ type: "subject", id: subjectId });
  if (result.ok) {
    await db
      .update(subjects)
      .set({ stateSummary: result.data, stateSummaryAt: new Date() })
      .where(eq(subjects.id, subjectId));
  }
  return result;
}

/* --------------------------------------------------------------- improve --- */

const IMPROVE_SYSTEM = `You tighten one line of a QA engineer's work log.

Rules:
- Keep every fact, number, device name, build number and ticket key exactly as written.
- Keep any URLs byte-for-byte. Do not reformat or shorten them.
- Make it specific and readable. Prefer the active voice. Cut filler.
- Fix spelling and grammar.
- Do not add information, speculation or advice.
- Do not add a heading, quotes or commentary. Return only the rewritten entry.
- Keep it about the same length. Never longer than twice the original.`;

/** Returns the rewrite; the caller shows it as a before/after, never auto-applies. */
export async function improveEntry(text: string): Promise<AiResult<string>> {
  return guard(async () => {
    const original = text.trim();
    if (original.length < 3) throw new Error("Nothing to improve yet.");

    // The cheap tier: rewriting one line needs no reasoning depth.
    const improved = await askText({
      system: IMPROVE_SYSTEM,
      user: original,
      tier: "cheap",
      maxTokens: 2000,
    });
    if (!improved) throw new Error("Got an empty rewrite back.");
    return improved;
  });
}

/* --------------------------------------------------------------- propose --- */

const ProposalSchema = z.object({
  subject: z
    .object({
      name: z.string(),
      kind: z.enum(subjects.kind.enumValues),
      parentName: z
        .string()
        .nullable()
        .describe("An existing top-level subject to nest under, or null."),
      reuseExisting: z
        .boolean()
        .describe("True when an existing subject already covers this."),
    })
    .nullable()
    .describe("A subject to create, or null if an existing one fits."),
  task: z.object({
    title: z.string(),
    type: z.enum(tasks.type.enumValues),
    subjectNames: z
      .array(z.string())
      .describe("Subjects this task is about, existing or newly proposed."),
  }),
  entries: z
    .array(
      z.object({
        body: z.string(),
        kind: z.enum(events.kind.enumValues),
        outcome: z.enum(events.outcome.enumValues).nullable(),
      }),
    )
    .describe("Entries drawn only from the prompt. Empty if it describes none."),
  notes: z.string().describe("One line on anything assumed or left out."),
});

export type Proposal = z.infer<typeof ProposalSchema>;

const PROPOSE_SYSTEM = `You turn a QA engineer's rough note into a structured proposal: one task, the subject it concerns, and any entries the note already describes.

Rules:
- Use only what the note says. Never invent test results, tickets or outcomes.
- Prefer an existing subject over inventing one. Only propose a new subject when none of the existing ones fit.
- Subjects nest two levels at most, so parentName must be an existing TOP-LEVEL subject or null.
- Entries are things that already happened. If the note only describes work to be done, return no entries.
- Keep the engineer's own wording and their ticket keys.
- Task titles are concrete: "Regression suite for FW 2.4.1", not "Testing".`;

export async function proposeFromPrompt(
  prompt: string,
): Promise<AiResult<Proposal>> {
  return guard(async () => {
    const text = prompt.trim();
    if (text.length < 10) throw new Error("Give it a sentence or two to work with.");

    const existing = await withRetry("ai.subjects", () =>
      db
        .select({
          name: subjects.name,
          kind: subjects.kind,
          parentId: subjects.parentId,
        })
        .from(subjects)
        .orderBy(subjects.name),
    );

    const roster = existing.length
      ? existing
          .map(
            (s) =>
              `- ${s.name} (${s.kind.replace(/_/g, " ")}${s.parentId ? ", a part of another subject" : ", top level"})`,
          )
          .join("\n")
      : "(none yet)";

    return askJson(
      {
        system: PROPOSE_SYSTEM,
        user: `Existing subjects:\n${roster}\n\nThe note:\n${text}`,
        tier: "standard",
        effort: "high",
      },
      ProposalSchema,
    );
  });
}

/**
 * Writes an approved proposal. Nothing reaches the database until the person
 * has seen it and said yes — an AI quietly inventing subjects would poison the
 * record this app exists to keep.
 */
export async function acceptProposal(
  proposal: Proposal,
): Promise<AiResult<{ taskId: string }>> {
  return guard(async () => {
    const { createSubject, createTask, captureEvent } = await import(
      "@/app/actions"
    );

    const byName = new Map(
      (
        await db
          .select({ id: subjects.id, name: subjects.name })
          .from(subjects)
      ).map((s) => [s.name.toLowerCase(), s.id]),
    );

    if (proposal.subject && !proposal.subject.reuseExisting) {
      const existing = byName.get(proposal.subject.name.toLowerCase());
      if (!existing) {
        const parentId = proposal.subject.parentName
          ? (byName.get(proposal.subject.parentName.toLowerCase()) ?? null)
          : null;
        const created = await createSubject({
          name: proposal.subject.name,
          kind: proposal.subject.kind,
          parentId,
        });
        byName.set(created.name.toLowerCase(), created.id);
      }
    }

    const subjectIds = proposal.task.subjectNames
      .map((n) => byName.get(n.toLowerCase()))
      .filter((id): id is string => !!id);

    const task = await createTask({
      title: proposal.task.title,
      type: proposal.task.type,
      subjectIds,
    });

    // Sequential, because each capture bumps the task's lastActivityAt.
    // kind/outcome are passed through: the proposal already classified these,
    // and re-deriving them from the text would silently discard that.
    for (const entry of proposal.entries) {
      await captureEvent({
        taskId: task.id,
        text: entry.body,
        kind: entry.kind,
        outcome: entry.outcome,
      });
    }

    return { taskId: task.id };
  });
}
