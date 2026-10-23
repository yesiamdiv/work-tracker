import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import type { z } from "zod";


import {
  getAiConfig,
  modelFrom,
  type ProviderConfig,
} from "./config";
import { PROVIDERS, type ProviderSpec, type Tier } from "./providers";

export * from "./providers";
export * from "./config";

export class AiNotConfigured extends Error {
  constructor(spec: ProviderSpec) {
    super(
      spec.keyEnv
        ? `${spec.label} is selected but has no API key. Add one under Settings.`
        : `${spec.label} is selected but unreachable.`,
    );
  }
}

/* ------------------------------------------------------------- the seam --- */

/**
 * How long to wait for a model before giving up.
 *
 * Vercel kills the function at sixty seconds, and a request that simply hangs
 * until then surfaces as FUNCTION_INVOCATION_TIMEOUT with no indication of
 * what went wrong. Free OpenRouter models in particular can sit in a shared
 * queue for minutes. Failing first, just under that ceiling, means the person
 * is told what happened and what to do about it.
 */
const DEFAULT_TIMEOUT_MS = 50_000;

export type Ask = {
  system: string;
  user: string;
  tier: Tier;
  /** Thoroughness. Maps to effort on Claude; ignored elsewhere. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** Override the wait — a connection test wants to fail much sooner. */
  timeoutMs?: number;
};

export type Answer = {
  text: string;
  /** The model ran out of output room; the text is real but incomplete. */
  truncated: boolean;
};

/**
 * Plain text in, text plus whether it was cut off out.
 *
 * Truncation used to throw, which discarded a perfectly good partial answer
 * and told the person to narrow their input — advice that does not help, since
 * the limit is on what the model writes, not on what it reads.
 */
export async function askAnswer(ask: Ask): Promise<Answer> {
  const { active } = await getAiConfig();
  if (!active.ready) throw new AiNotConfigured(active.spec);
  return active.spec.kind === "anthropic"
    ? claudeText(active, ask)
    : openaiText(active, ask);
}

/** For callers that cannot use a partial answer. */
export async function askText(ask: Ask): Promise<string> {
  const { text, truncated } = await askAnswer(ask);
  if (truncated) {
    throw new Error(
      "The reply was cut off before it finished. Try asking for something shorter.",
    );
  }
  return text;
}

/**
 * JSON matching a schema.
 *
 * Claude constrains the output to the schema server-side. The OpenAI-compatible
 * providers vary — some honour `response_format`, Ollama models often ignore it
 * — so there the schema goes in the prompt and the reply is validated locally,
 * with one retry. Either way the caller gets parsed, valid data or an error.
 */
export async function askJson<T extends z.ZodType>(
  ask: Ask,
  schema: T,
): Promise<z.infer<T>> {
  const { active } = await getAiConfig();
  if (!active.ready) throw new AiNotConfigured(active.spec);
  return active.spec.kind === "anthropic"
    ? claudeJson(active, ask, schema)
    : openaiJson(active, ask, schema);
}

/* ---------------------------------------------------------------- claude --- */

const claudeClient = (config: ProviderConfig) =>
  new Anthropic({ apiKey: config.apiKey ?? undefined });

/**
 * Haiku 4.5 rejects `output_config.effort`, and takes a thinking budget rather
 * than adaptive thinking — so for the cheap tier both are simply omitted.
 * Sonnet 5.5 takes effort and runs thinking adaptively.
 */
function claudeExtras(ask: Ask) {
  if (ask.tier === "cheap") return {};
  return { output_config: { effort: ask.effort ?? "medium" } } as const;
}

async function claudeText(config: ProviderConfig, ask: Ask): Promise<Answer> {
  const message = await claudeClient(config).messages.create(
    {
      model: modelFrom(config, ask.tier),
      max_tokens: ask.maxTokens ?? config.spec.limits.maxOutput,
      system: ask.system,
      ...claudeExtras(ask),
      messages: [{ role: "user", content: ask.user }],
    },
    { timeout: ask.timeoutMs ?? DEFAULT_TIMEOUT_MS },
  );

  assertUsable(message);
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Claude returned an empty response.");
  return { text, truncated: message.stop_reason === "max_tokens" };
}

async function claudeJson<T extends z.ZodType>(
  config: ProviderConfig,
  ask: Ask,
  schema: T,
): Promise<z.infer<T>> {
  const message = await claudeClient(config).messages.parse({
    model: modelFrom(config, ask.tier),
    max_tokens: ask.maxTokens ?? config.spec.limits.maxOutput,
    system: ask.system,
    output_config: {
      effort: ask.effort ?? "medium",
      format: zodOutputFormat(schema),
    },
    messages: [{ role: "user", content: ask.user }],
  });

  assertUsable(message);
  if (!message.parsed_output) throw new Error("Could not read a result back.");
  return message.parsed_output as z.infer<T>;
}

/**
 * A refusal arrives as HTTP 200, so `stop_reason` has to be checked rather than
 * assumed; `max_tokens` means a truncated answer we must not present as whole.
 */
function assertUsable(message: Anthropic.Message): void {
  if (message.stop_reason === "refusal") {
    throw new Error(
      `Claude declined this one (${message.stop_details?.explanation ?? "no reason given"}).`,
    );
  }
}

/* ------------------------------------------------- openai-compatible ------ */

/**
 * OpenRouter's control over how much a model thinks before answering.
 *
 * Some models there reason by default and cannot be stopped — "Reasoning is
 * mandatory for this endpoint" — and left alone one spent 27,785 characters
 * thinking, used its entire 8,000-token budget, and returned no answer at all
 * after 59.9 seconds. Vercel kills the function at sixty.
 *
 * `effort: "low"` bounds the thinking and `exclude: true` keeps it out of the
 * response. The same question then answered in 35.5 seconds, using 4,731
 * tokens, with 1,719 characters of actual answer.
 *
 * Only OpenRouter accepts this, and not every model there does — a model that
 * rejects it gets the request retried without it.
 */
const REASONING = { effort: "low", exclude: true } as const;

function rejectsReasoning(error: unknown): boolean {
  if (!(error instanceof OpenAI.BadRequestError)) return false;
  return /reasoning|unsupported parameter|unrecognized/i.test(error.message);
}

function openaiClient(config: ProviderConfig): OpenAI {
  return new OpenAI({
    // Ollama needs no key but the SDK insists on a non-empty string.
    apiKey: config.apiKey ?? "local",
    baseURL: config.spec.baseUrl,
  });
}

async function openaiText(config: ProviderConfig, ask: Ask): Promise<Answer> {
  const spec = config.spec;
  const model = modelFrom(config, ask.tier);

  const send = (withReasoning: boolean) =>
    openaiClient(config).chat.completions.create(
      {
        model,
        max_tokens: ask.maxTokens ?? spec.limits.maxOutput,
        ...(withReasoning && spec.reasoningControl
          ? ({ reasoning: REASONING } as Record<string, unknown>)
          : {}),
        messages: [
          { role: "system", content: ask.system },
          { role: "user", content: ask.user },
        ],
      },
      { timeout: ask.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    );

  const completion = await send(true).catch(async (error: unknown) => {
    if (spec.reasoningControl && rejectsReasoning(error)) {
      return send(false);
    }
    throw missingModel(spec, model, error);
  });

  const choice = completion.choices[0];
  const text = choice?.message?.content?.trim();

  if (!text) {
    /*
     * Reasoning models return their thinking in a non-standard `reasoning`
     * field and leave `content` null. One that runs out of output budget mid-
     * thought therefore answers with nothing at all — which looked like an
     * empty response and gave no hint that the model was the problem.
     */
    const reasoning = (
      choice?.message as { reasoning?: string } | undefined
    )?.reasoning;

    if (reasoning && choice?.finish_reason === "length") {
      throw new Error(
        `${spec.label} ran "${model}" out of output budget while it was still thinking, so it never began the answer. That model reasons before replying — pick one that does not, or raise its output limit.`,
      );
    }
    if (reasoning) {
      throw new Error(
        `"${model}" returned only its internal reasoning and no answer. Try a different model under Settings.`,
      );
    }
    if (choice?.finish_reason === "length") {
      throw new Error(
        `${spec.label} stopped at its output limit before writing anything. Ask for something shorter.`,
      );
    }
    throw new Error(`${spec.label} returned an empty response.`);
  }

  return { text, truncated: choice?.finish_reason === "length" };
}

async function openaiJson<T extends z.ZodType>(
  config: ProviderConfig,
  ask: Ask,
  schema: T,
): Promise<z.infer<T>> {
  const spec = config.spec;
  const instruction =
    `${ask.system}\n\nReply with JSON only — no prose, no markdown fence. ` +
    `It must match this shape exactly:\n${describeShape(schema)}`;

  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const user =
      attempt === 0
        ? ask.user
        : `${ask.user}\n\nYour previous reply was not valid: ${lastError}\nReturn JSON only.`;

    let raw: string;
    try {
      raw = await openaiJsonCall(config, ask, instruction, user);
    } catch (error) {
      // Some providers 400 on response_format; retry without it before giving up.
      if (attempt === 0 && isResponseFormatError(error)) {
        raw = await openaiJsonCall(config, ask, instruction, user, false);
      } else {
        throw error;
      }
    }

    const parsed = schema.safeParse(tryParse(raw));
    if (parsed.success) return parsed.data as z.infer<T>;
    lastError = parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
  }

  throw new Error(
    `${spec.label} could not produce the required shape (${lastError}). ` +
      `Claude or a larger model handles this better.`,
  );
}

async function openaiJsonCall(
  config: ProviderConfig,
  ask: Ask,
  system: string,
  user: string,
  withFormat = true,
): Promise<string> {
  const spec = config.spec;
  const model = modelFrom(config, ask.tier);
  const completion = await openaiClient(config)
    .chat.completions.create(
      {
        model,
        max_tokens: ask.maxTokens ?? spec.limits.maxOutput,
        ...(withFormat
          ? { response_format: { type: "json_object" as const } }
          : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      { timeout: ask.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    )
    .catch((error: unknown) => {
      throw missingModel(spec, model, error);
    });
  return completion.choices[0]?.message?.content ?? "";
}

/** A 404 from these providers means "no such model", which deserves saying. */
function missingModel(spec: ProviderSpec, model: string, error: unknown): unknown {
  if (error instanceof OpenAI.NotFoundError) {
    const hint =
      spec.id === "ollama"
        ? `Run \`ollama pull ${model}\`, or set AI_MODEL to one you already have.`
        : "Set AI_MODEL to a model this provider offers.";
    return new Error(`${spec.label} has no model "${model}". ${hint}`);
  }
  return error;
}

function isResponseFormatError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /response_format|json_object|not supported/i.test(message);
}

/** Models fence JSON despite being told not to; strip it before parsing. */
function tryParse(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last resort: the outermost object in a reply that wrapped it in prose.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** A readable sketch of the schema for providers that can't be handed one. */
function describeShape(schema: z.ZodType): string {
  try {
    const { z } = require("zod") as typeof import("zod");
    return JSON.stringify(z.toJSONSchema(schema), null, 1);
  } catch {
    return "(see the field names described above)";
  }
}

/* ---------------------------------------------------------------- errors --- */

/**
 * `spec` names the provider in the message where it is known. The caller
 * supplies it rather than this reading the active one, because reading the
 * active provider now needs a database round trip and an error path should not
 * depend on the database being reachable.
 */
export function aiErrorMessage(
  error: unknown,
  spec?: ProviderSpec,
): string {
  const who = spec?.label ?? "The provider";

  if (error instanceof AiNotConfigured) return error.message;

  if (error instanceof Anthropic.AuthenticationError)
    return "Anthropic rejected the API key. Check it under Settings.";
  if (error instanceof Anthropic.RateLimitError)
    return "Rate limited. Try again in a moment.";
  if (error instanceof Anthropic.BadRequestError) {
    if (/credit balance is too low/i.test(error.message))
      return "Your Anthropic account is out of credit. Add some at console.anthropic.com, or pick another provider under Settings.";
    return `Anthropic rejected the request: ${error.message}`;
  }

  if (error instanceof OpenAI.AuthenticationError)
    return `${who} rejected the API key. Check it under Settings.`;
  if (error instanceof OpenAI.RateLimitError)
    return `${who} rate limited the request, or the account is out of credit.`;
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return `${who} did not answer in time. Free models often queue for minutes — try a faster one under Settings, or narrow the selection.`;
  if (error instanceof OpenAI.APIConnectionError)
    return spec?.id === "ollama"
      ? "Could not reach Ollama. Is `ollama serve` running?"
      : `Could not reach ${who}.`;
  if (error instanceof OpenAI.APIError)
    return `${who} error ${error.status}: ${error.message}`;

  if (error instanceof Anthropic.APIConnectionTimeoutError)
    return "Claude did not answer in time. Try a narrower selection.";
  if (error instanceof Anthropic.APIConnectionError)
    return "Could not reach Anthropic. Check your connection.";
  if (error instanceof Anthropic.APIError)
    return `Anthropic error ${error.status}: ${error.message}`;

  return error instanceof Error ? error.message : "Something went wrong.";
}
