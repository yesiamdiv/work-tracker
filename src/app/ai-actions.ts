"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { withRetry } from "@/db/retry";
import { answers, events, refs, subjects, tasks } from "@/db/schema";
import { asUuid, feed, type FeedEntry, type FeedFilters } from "@/db/feed";
import {
  aiErrorMessage,
  askAnswer,
  askJson,
  askText,
  getAiConfig,
  modelFrom,
} from "@/lib/ai";
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
    // Name the provider where we can, but never let that lookup mask the
    // original failure.
    const spec = await getAiConfig()
      .then((c) => c.active.spec)
      .catch(() => undefined);
    return { ok: false, error: aiErrorMessage(error, spec) };
  }
}

/* ------------------------------------------------------------- summaries --- */

export type SummaryScope =
  | { type: "task"; id: string }
  | { type: "subject"; id: string }
  | { type: "period"; days: number; label: string };

const SUMMARY_SYSTEM = `You summarise a QA engineer's own log of their work, for them to re-read later.

Rules:
- Be specific. Name the builds, devices, ticket keys and numbers that appear in the entries.
- Never invent anything. If the log does not say it, do not say it.
- Lead with what broke or is outstanding; finish with what is settled.
- Short bullets, no preamble, no heading, no sign-off. Six bullets at most.
- Plain text. No markdown bold, no emoji.
- If there is nothing of substance, say so in one line.`;

export async function summarise(scope: SummaryScope): Promise<AiResult<string>> {
  // Every scope is expressible as a filter, so summaries and questions share
  // one gathering path — and the per-entry metadata with it.
  const filters: AskFilters =
    scope.type === "task"
      ? { task: scope.id }
      : scope.type === "subject"
        ? { subject: scope.id }
        : { days: String(scope.days) };

  const result = await askAboutEntries({ filters });
  return result.ok ? { ok: true, data: result.data.answer } : result;
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

/* ------------------------------------------------- ask about a selection --- */

/**
 * The filters as they arrive from the URL — strings, so the whole thing
 * crosses the server-action boundary without needing Dates rehydrated.
 */
export type AskFilters = {
  q?: string;
  subject?: string;
  kind?: string;
  outcome?: string;
  refs?: string;
  days?: string;
  task?: string;
};

/**
 * How much of the log goes in front of the model.
 *
 * There is no "no limit" available: every provider has a context window, and
 * going past it is a hard 400 rather than a graceful trim. So the ceiling comes
 * from whichever provider is in use — 600,000 characters on Gemini or Claude,
 * 180,000 on DeepSeek, whose window is the smallest offered — rather than one
 * number that is wrong for all of them.
 *
 * Measured in characters rather than entries because one real entry here is
 * 13,000 characters: fifty of those would blow any window while fifty
 * one-liners would barely fill a page.
 */
async function inputBudget(): Promise<number> {
  const { active } = await getAiConfig();
  return active.spec.limits.inputChars;
}

function toFeedFilters(f: AskFilters): FeedFilters {
  const days = Number(f.days ?? 0) || 0;
  return {
    q: f.q,
    subjectId: asUuid(f.subject),
    taskId: asUuid(f.task),
    kind: events.kind.enumValues.includes(f.kind as never)
      ? (f.kind as FeedFilters["kind"])
      : undefined,
    outcome: events.outcome.enumValues.includes(f.outcome as never)
      ? (f.outcome as FeedFilters["outcome"])
      : undefined,
    withRefs: f.refs === "1",
    from: days ? new Date(Date.now() - days * 86_400_000) : undefined,
    limit: 200,
  };
}

/** Says in words what the filters select, so the model knows the scope. */
async function describeFilters(f: AskFilters): Promise<string> {
  const parts: string[] = [];
  if (f.q) parts.push(`matching "${f.q}"`);
  const subjectId = asUuid(f.subject);
  if (subjectId) {
    const [s] = await db
      .select({ name: subjects.name })
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);
    if (s) parts.push(`about ${s.name} (including its parts)`);
  }
  const taskId = asUuid(f.task);
  if (taskId) {
    const [t] = await db
      .select({ title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (t) parts.push(`on the task "${t.title}"`);
  }
  if (f.kind) parts.push(`of kind ${f.kind.replace(/_/g, " ")}`);
  if (f.outcome) parts.push(`with outcome ${f.outcome}`);
  if (f.refs === "1") parts.push("that carry a link");
  if (f.days) parts.push(`from the last ${f.days} days`);
  return parts.length ? `Entries ${parts.join(", ")}` : "All entries";
}

/**
 * One entry, as the model sees it.
 *
 * Carries the metadata, not just the prose: the date, which task and subject
 * it belongs to, the kind and outcome, the ticket keys pulled out of its links,
 * and the names of any files. Sending the body alone meant a question like
 * "which tickets did I raise" had only whatever happened to be typed in the
 * text, and the model had no idea subjects existed at all.
 */
function formatEntry(e: FeedEntry): string {
  const when = e.occurredAt.toISOString().slice(0, 16).replace("T", " ");
  const head = [
    when,
    `kind: ${KIND_LABEL[e.kind]}`,
    e.outcome ? `outcome: ${e.outcome}` : null,
    `task: ${e.taskTitle}`,
    e.subjects.length
      ? `subject: ${e.subjects
          .map((s) => (s.parentName ? `${s.parentName} / ${s.name}` : s.name))
          .join(", ")}`
      : null,
    e.refs.length
      ? `links: ${e.refs
          .map((r) => r.externalKey ?? r.label ?? `${r.kind} ${r.url}`)
          .join(", ")}`
      : null,
    e.attachments.length
      ? `files: ${e.attachments.map((a) => a.name).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `${head}\n${e.body}`;
}

/**
 * @param cap characters to fit, or `null` for everything regardless of size —
 *   used when exporting, where the destination is some other model whose
 *   window we know nothing about and should not pre-emptively trim for.
 */
async function gatherFiltered(f: AskFilters, cap?: number | null) {
  const [{ entries }, budget] = await Promise.all([
    feed(toFeedFilters(f)),
    cap === undefined ? inputBudget() : Promise.resolve(cap ?? Infinity),
  ]);

  const maxChars = cap === null ? Infinity : budget;

  // Oldest first: a narrative, and an answer about what changed, both read
  // forwards even though the page shows newest first.
  const ordered = [...entries].reverse();

  const lines: string[] = [];
  let chars = 0;
  let dropped = 0;

  for (const e of ordered) {
    const line = formatEntry(e);
    if (chars + line.length > maxChars) {
      dropped++;
      continue;
    }
    chars += line.length;
    lines.push(line);
  }

  return { lines, used: lines.length, dropped, total: entries.length };
}

const ASK_SYSTEM = `You answer questions about a QA engineer's own work log. The entries below are the whole of what you know.

Rules:
- Answer only from the entries. If they do not say, reply that the log does not record it.
- Be specific: name the dates, builds, devices, ticket keys and numbers that appear.
- Quote the engineer's own wording for anything technical rather than paraphrasing it.
- Cite the date of an entry you rely on, like (12 Oct).
- Never invent a ticket, a result or a cause.
- Answer in a few sentences or short bullets. No preamble, no sign-off.
- Plain text. No markdown bold, no emoji.`;

/**
 * Answers a question about whatever the filters select, or summarises it when
 * no question is given.
 *
 * This is the "ask across history" feature, scoped by explicit filters rather
 * than by embedding search — the person picks the set, so there is nothing to
 * retrieve and no vector index to keep current.
 */
export async function askAboutEntries(input: {
  filters: AskFilters;
  question?: string;
}): Promise<
  AiResult<{
    answer: string;
    used: number;
    dropped: number;
    truncated: boolean;
  }>
> {
  return guard(async () => {
    const { lines, used, dropped, total } = await gatherFiltered(input.filters);

    if (!lines.length) {
      throw new Error(
        total
          ? "Those entries are too long to send in one go. Narrow the filters."
          : "No entries match those filters.",
      );
    }

    const scope = await describeFilters(input.filters);
    const question = input.question?.trim();

    const config = await getAiConfig();
    const { text, truncated } = await askAnswer({
      system: question ? ASK_SYSTEM : SUMMARY_SYSTEM,
      user: question
        ? `${scope} — ${used} entries, oldest first.\n\n${lines.join("\n\n")}\n\n---\nQuestion: ${question}`
        : `${scope} — ${used} entries, oldest first.\n\n${lines.join("\n\n")}`,
      tier: "standard",
      effort: question ? "high" : "medium",
    });

    // Kept so an answer worked out once can be read again, with the filters
    // and the model that produced it — which is what makes it trustworthy
    // months later.
    await db.insert(answers).values({
      question: question ?? null,
      answer: text,
      filters: Object.fromEntries(
        Object.entries(input.filters).filter(([, v]) => v),
      ) as Record<string, string>,
      scope,
      provider: config.activeId,
      model: modelFrom(config.active, "standard"),
      entriesRead: used,
      truncated: truncated ? 1 : 0,
    });
    // The answer is already saved; a cache refresh failing must not lose it.
    try {
      revalidatePath("/ask");
      revalidatePath("/answers");
    } catch {
      // Not fatal — the next navigation picks it up.
    }

    return { answer: text, used, dropped, truncated };
  });
}

/**
 * The exact prompt, as a file, without sending it anywhere.
 *
 * When the configured model fails — times out, runs out of output budget,
 * reasons itself into silence — the work of assembling the question is still
 * done and should not be lost with it. This hands over the whole thing to
 * paste into any other assistant.
 *
 * Deliberately not subject to the provider's input budget: the destination is
 * some other model whose context window we know nothing about, so trimming on
 * its behalf would be guessing. Everything selected goes in.
 */
export async function exportPrompt(input: {
  filters: AskFilters;
  question?: string;
}): Promise<AiResult<{ filename: string; content: string; entries: number }>> {
  return guard(async () => {
    const { lines, used, total } = await gatherFiltered(input.filters, null);
    if (!lines.length) throw new Error("No entries match those filters.");

    const scope = await describeFilters(input.filters);
    const question = input.question?.trim();
    const config = await getAiConfig();

    const system = question ? ASK_SYSTEM : SUMMARY_SYSTEM;
    const body = `${scope} — ${used} entries, oldest first.\n\n${lines.join("\n\n")}`;

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const content = [
      "# Work Tracker — exported prompt",
      "",
      `Exported: ${new Date().toISOString()}`,
      `Selection: ${scope}`,
      `Entries included: ${used}${total > used ? ` of ${total}` : ""}`,
      `Configured model: ${config.activeId} / ${modelFrom(config.active, "standard")}`,
      "",
      "Paste the three sections below into any assistant. The system prompt is",
      "the instruction this app would have used; the entries are the data; the",
      "question is what was asked of them.",
      "",
      "---",
      "",
      "## System prompt",
      "",
      system,
      "",
      "---",
      "",
      "## Entries",
      "",
      body,
      "",
      "---",
      "",
      "## Question",
      "",
      question ?? "(no question — a summary of the entries above was requested)",
      "",
    ].join("\n");

    return {
      filename: `work-tracker-prompt-${stamp}.md`,
      content,
      entries: used,
    };
  });
}

/** How many entries the filters currently select, for the page to show. */
export async function countFiltered(filters: AskFilters): Promise<number> {
  const { entries } = await feed(toFeedFilters(filters));
  return entries.length;
}

/* ------------------------------------------------------- saved answers --- */

export async function savedAnswers(limit = 20) {
  return withRetry("savedAnswers", () =>
    db
      .select()
      .from(answers)
      .orderBy(desc(answers.createdAt))
      .limit(limit),
  );
}

export async function deleteAnswer(id: string): Promise<AiResult<null>> {
  return guard(async () => {
    await db.delete(answers).where(eq(answers.id, id));
    revalidatePath("/ask");
    return null;
  });
}
