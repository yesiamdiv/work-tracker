import Anthropic from "@anthropic-ai/sdk";

/**
 * The Claude client, and the one place the model choice lives.
 *
 * Opus 5.5 has thinking always on, so there is no `thinking` parameter to set —
 * depth is controlled with `output_config.effort`. Its effort default is
 * `medium`, so anything that wants more is explicit about it.
 */

export const MODEL = "claude-opus-5-5";

export class AiNotConfigured extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set — add it to .env.local (console.anthropic.com) and restart.",
    );
  }
}

let client: Anthropic | null = null;

export function ai(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfigured();
  client ??= new Anthropic();
  return client;
}

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

/** Turns the SDK's typed errors into something worth showing a person. */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof AiNotConfigured) return error.message;
  if (error instanceof Anthropic.AuthenticationError)
    return "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.local.";
  if (error instanceof Anthropic.RateLimitError)
    return "Rate limited by Anthropic. Try again in a moment.";
  if (error instanceof Anthropic.BadRequestError) {
    // Arrives as a 400 rather than a payment-specific status, and the raw body
    // is a wall of JSON — worth naming, since it is the likeliest first failure.
    if (/credit balance is too low/i.test(error.message)) {
      return "Your Anthropic account is out of credit. Add some under Plans & Billing at console.anthropic.com, then try again.";
    }
    return `Anthropic rejected the request: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError)
    return "Could not reach Anthropic. Check your connection.";
  if (error instanceof Anthropic.APIError)
    return `Anthropic error ${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Pulls the plain text out of a response, ignoring thinking blocks. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Checks a response actually produced an answer.
 *
 * `stop_reason: "refusal"` arrives as HTTP 200, so the content has to be
 * checked rather than assumed — and `max_tokens` means a truncated answer we
 * should not present as complete.
 */
export function assertUsable(message: Anthropic.Message): void {
  if (message.stop_reason === "refusal") {
    const why = message.stop_details?.explanation ?? "no reason given";
    throw new Error(`Claude declined to answer this one (${why}).`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The answer was cut short. Try a narrower range.");
  }
}
