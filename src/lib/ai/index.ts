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
  const { active } = await getAiConfig();
  if (!active.ready) throw new AiNotConfigured(active.spec);
  return active.spec.kind === "anthropic"
    ? claudeText(active, ask)
    : openaiText(active, ask);
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

async function claudeText(config: ProviderConfig, ask: Ask): Promise<string> {
  const message = await claudeClient(config).messages.create({
    model: modelFrom(config, ask.tier),
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
  config: ProviderConfig,
  ask: Ask,
  schema: T,
): Promise<z.infer<T>> {
  const message = await claudeClient(config).messages.parse({
    model: modelFrom(config, ask.tier),
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

function openaiClient(config: ProviderConfig): OpenAI {
  return new OpenAI({
    // Ollama needs no key but the SDK insists on a non-empty string.
    apiKey: config.apiKey ?? "local",
    baseURL: config.spec.baseUrl,
  });
}

async function openaiText(config: ProviderConfig, ask: Ask): Promise<string> {
  const spec = config.spec;
  const model = modelFrom(config, ask.tier);
  const completion = await openaiClient(config).chat.completions
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
  if (error instanceof OpenAI.APIConnectionError)
    return spec?.id === "ollama"
      ? "Could not reach Ollama. Is `ollama serve` running?"
      : `Could not reach ${who}.`;
  if (error instanceof OpenAI.APIError)
    return `${who} error ${error.status}: ${error.message}`;

  if (error instanceof Anthropic.APIConnectionError)
    return "Could not reach Anthropic. Check your connection.";
  if (error instanceof Anthropic.APIError)
    return `Anthropic error ${error.status}: ${error.message}`;

  return error instanceof Error ? error.message : "Something went wrong.";
}
