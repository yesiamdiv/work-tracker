import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import type { z } from "zod";

import {
  activeProvider,
  modelFor,
  providerReady,
  type ProviderSpec,
  type Tier,
} from "./providers";

export * from "./providers";

export class AiNotConfigured extends Error {
  constructor(spec: ProviderSpec) {
    super(
      spec.keyEnv
        ? `${spec.label} is selected but ${spec.keyEnv} is not set. Add it to .env.local and restart.`
        : `${spec.label} is selected but unreachable.`,
    );
  }
}

/* ------------------------------------------------------------- the seam --- */

export type Ask = {
  system: string;
  user: string;
  tier: Tier;
  /** Thoroughness. Maps to effort on Claude; ignored elsewhere. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
};

/** Plain text in, plain text out — all three features need only this. */
export async function askText(ask: Ask): Promise<string> {
  const spec = activeProvider();
  if (!providerReady(spec)) throw new AiNotConfigured(spec);
  return spec.kind === "anthropic" ? claudeText(spec, ask) : openaiText(spec, ask);
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
  const spec = activeProvider();
  if (!providerReady(spec)) throw new AiNotConfigured(spec);
  return spec.kind === "anthropic"
    ? claudeJson(spec, ask, schema)
    : openaiJson(spec, ask, schema);
}

/* ---------------------------------------------------------------- claude --- */

let anthropic: Anthropic | null = null;
const claudeClient = () => (anthropic ??= new Anthropic());

/**
 * Haiku 4.5 rejects `output_config.effort`, and takes a thinking budget rather
 * than adaptive thinking — so for the cheap tier both are simply omitted.
 * Sonnet 5.5 takes effort and runs thinking adaptively.
 */
function claudeExtras(ask: Ask) {
  if (ask.tier === "cheap") return {};
  return { output_config: { effort: ask.effort ?? "medium" } } as const;
}

async function claudeText(spec: ProviderSpec, ask: Ask): Promise<string> {
  const message = await claudeClient().messages.create({
    model: modelFor(ask.tier, spec),
    max_tokens: ask.maxTokens ?? 16000,
    system: ask.system,
    ...claudeExtras(ask),
    messages: [{ role: "user", content: ask.user }],
  });

  assertUsable(message);
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function claudeJson<T extends z.ZodType>(
  spec: ProviderSpec,
  ask: Ask,
  schema: T,
): Promise<z.infer<T>> {
  const message = await claudeClient().messages.parse({
    model: modelFor(ask.tier, spec),
    max_tokens: ask.maxTokens ?? 16000,
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
  if (message.stop_reason === "max_tokens") {
    throw new Error("The answer was cut short. Try a narrower range.");
  }
}

/* ------------------------------------------------- openai-compatible ------ */

const openaiClients = new Map<string, OpenAI>();

function openaiClient(spec: ProviderSpec): OpenAI {
  const cached = openaiClients.get(spec.id);
  if (cached) return cached;
  const client = new OpenAI({
    // Ollama needs no key but the SDK insists on a non-empty string.
    apiKey: spec.keyEnv ? (process.env[spec.keyEnv] ?? "") : "ollama",
    baseURL: spec.baseUrl,
  });
  openaiClients.set(spec.id, client);
  return client;
}

async function openaiText(spec: ProviderSpec, ask: Ask): Promise<string> {
  const model = modelFor(ask.tier, spec);
  const completion = await openaiClient(spec).chat.completions
    .create({
      model,
      max_tokens: ask.maxTokens ?? 4096,
      messages: [
        { role: "system", content: ask.system },
        { role: "user", content: ask.user },
      ],
    })
    .catch((error: unknown) => {
      throw missingModel(spec, model, error);
    });

  const choice = completion.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error("The answer was cut short. Try a narrower range.");
  }
  const text = choice?.message?.content?.trim();
  if (!text) throw new Error(`${spec.label} returned an empty response.`);
  return text;
}

async function openaiJson<T extends z.ZodType>(
  spec: ProviderSpec,
  ask: Ask,
  schema: T,
): Promise<z.infer<T>> {
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
      raw = await openaiJsonCall(spec, ask, instruction, user);
    } catch (error) {
      // Some providers 400 on response_format; retry without it before giving up.
      if (attempt === 0 && isResponseFormatError(error)) {
        raw = await openaiJsonCall(spec, ask, instruction, user, false);
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
  spec: ProviderSpec,
  ask: Ask,
  system: string,
  user: string,
  withFormat = true,
): Promise<string> {
  const model = modelFor(ask.tier, spec);
  const completion = await openaiClient(spec)
    .chat.completions.create({
      model,
      max_tokens: ask.maxTokens ?? 4096,
      ...(withFormat
        ? { response_format: { type: "json_object" as const } }
        : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    })
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

export function aiErrorMessage(error: unknown): string {
  if (error instanceof AiNotConfigured) return error.message;

  if (error instanceof Anthropic.AuthenticationError)
    return "Anthropic rejected the API key. Check ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.RateLimitError)
    return "Rate limited. Try again in a moment.";
  if (error instanceof Anthropic.BadRequestError) {
    if (/credit balance is too low/i.test(error.message))
      return "Your Anthropic account is out of credit. Add some under Plans & Billing at console.anthropic.com, or switch AI_PROVIDER in .env.local.";
    return `Anthropic rejected the request: ${error.message}`;
  }

  if (error instanceof OpenAI.AuthenticationError)
    return `${activeProvider().label} rejected the API key. Check ${activeProvider().keyEnv}.`;
  if (error instanceof OpenAI.RateLimitError)
    return `${activeProvider().label} rate limited the request, or the account is out of credit.`;
  if (error instanceof OpenAI.APIConnectionError) {
    const spec = activeProvider();
    return spec.id === "ollama"
      ? "Could not reach Ollama. Is `ollama serve` running?"
      : `Could not reach ${spec.label}.`;
  }
  if (error instanceof OpenAI.APIError)
    return `${activeProvider().label} error ${error.status}: ${error.message}`;

  if (error instanceof Anthropic.APIConnectionError)
    return "Could not reach Anthropic. Check your connection.";
  if (error instanceof Anthropic.APIError)
    return `Anthropic error ${error.status}: ${error.message}`;

  return error instanceof Error ? error.message : "Something went wrong.";
}
