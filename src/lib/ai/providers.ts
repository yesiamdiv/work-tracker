/**
 * Which model providers exist, and what it costs to use them.
 *
 * Claude is called through the Anthropic SDK. Everything else here exposes an
 * OpenAI-compatible chat-completions endpoint — including Gemini — so the other
 * five are one adapter with a different base URL and key, rather than five
 * integrations to keep working.
 *
 * Prices are US dollars per million tokens, for the cheap/standard models named
 * below, and are here only to drive the comparison in the UI. They go stale;
 * treat them as indicative.
 */

export type ProviderId =
  | "claude"
  | "openai"
  | "gemini"
  | "deepseek"
  | "openrouter"
  | "ollama";

export type Tier = "cheap" | "standard";

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  /** "anthropic" uses the Anthropic SDK; "openai" the OpenAI-compatible one. */
  kind: "anthropic" | "openai";
  /** Env var holding the key. Ollama needs none. */
  keyEnv: string | null;
  baseUrl?: string;
  models: Record<Tier, string>;
  /** Indicative $/1M tokens for the standard model, input/output. */
  price?: { in: number; out: number };
  /**
   * Roughly how many characters of log may be sent, and how many tokens the
   * model may write back.
   *
   * There is no "unlimited" on offer: every provider has a context window, and
   * exceeding it is a hard 400 rather than a graceful trim — so the ceiling has
   * to exist. These are derived from each provider's real limits at about four
   * characters per token, left well short of the window so the prompt and the
   * reply both fit.
   *
   * `maxOutput` stays at or below 16,000 because anything larger needs
   * streaming to avoid the HTTP request timing out, and 16,000 tokens is
   * already some twelve thousand words of answer.
   */
  limits: { inputChars: number; maxOutput: number };
  notes?: string;
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  claude: {
    id: "claude",
    // 1M-token context window.
    limits: { inputChars: 600_000, maxOutput: 16_000 },
    label: "Claude",
    kind: "anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    models: {
      // Dropped from Opus on request, to cut the per-call cost.
      cheap: "claude-haiku-4-5",
      standard: "claude-sonnet-5-5",
    },
    price: { in: 2, out: 10 },
    notes: "Native SDK, and the only one here with schema-guaranteed JSON.",
  },

  openai: {
    id: "openai",
    // 128k-token context window.
    limits: { inputChars: 300_000, maxOutput: 16_000 },
    label: "ChatGPT (OpenAI)",
    kind: "openai",
    keyEnv: "OPENAI_API_KEY",
    models: { cheap: "gpt-4o-mini", standard: "gpt-4o" },
    price: { in: 2.5, out: 10 },
  },

  gemini: {
    id: "gemini",
    // 1M-token window, but only 8k of output.
    limits: { inputChars: 600_000, maxOutput: 8_192 },
    label: "Gemini",
    kind: "openai",
    keyEnv: "GEMINI_API_KEY",
    // Google's OpenAI-compatibility layer.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    models: { cheap: "gemini-2.0-flash-lite", standard: "gemini-2.0-flash" },
    price: { in: 0.1, out: 0.4 },
    notes: "Cheapest hosted option here by a wide margin.",
  },

  deepseek: {
    id: "deepseek",
    // 64k-token context window — the smallest offered here.
    limits: { inputChars: 180_000, maxOutput: 8_000 },
    label: "DeepSeek",
    kind: "openai",
    keyEnv: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com/v1",
    models: { cheap: "deepseek-chat", standard: "deepseek-chat" },
    price: { in: 0.27, out: 1.1 },
  },

  openrouter: {
    id: "openrouter",
    // Varies by model, so deliberately conservative.
    limits: { inputChars: 180_000, maxOutput: 8_000 },
    label: "OpenRouter",
    kind: "openai",
    keyEnv: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    // Deliberately explicit: OpenRouter's catalogue changes constantly, so the
    // model is meant to be set with AI_MODEL rather than trusted from here.
    models: {
      cheap: "google/gemini-2.0-flash-lite-001",
      standard: "anthropic/claude-sonnet-4.5",
    },
    notes: "One key for many models. Set AI_MODEL to choose one.",
  },

  ollama: {
    id: "ollama",
    // Depends entirely on the local model.
    limits: { inputChars: 100_000, maxOutput: 4_096 },
    label: "Ollama (local)",
    kind: "openai",
    keyEnv: null,
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    models: { cheap: "llama3.2", standard: "llama3.1" },
    price: { in: 0, out: 0 },
    notes: "Runs on your machine. Free, but will not work once deployed.",
  },
};

/** The provider in use, from AI_PROVIDER. Defaults to Claude. */
export function activeProviderId(): ProviderId {
  const raw = (process.env.AI_PROVIDER ?? "claude").toLowerCase().trim();
  return raw in PROVIDERS ? (raw as ProviderId) : "claude";
}

export function activeProvider(): ProviderSpec {
  return PROVIDERS[activeProviderId()];
}

/**
 * The model for a tier. `AI_MODEL` overrides both tiers — useful for
 * OpenRouter, and for pinning a specific Ollama tag.
 */
export function modelFor(tier: Tier, spec = activeProvider()): string {
  return process.env.AI_MODEL?.trim() || spec.models[tier];
}

/** Whether the active provider has what it needs to be called. */
export function providerReady(spec = activeProvider()): boolean {
  if (!spec.keyEnv) return true; // Ollama
  return !!process.env[spec.keyEnv];
}

/** Every provider that is currently usable — shown on the Claude page. */
export function configuredProviders(): ProviderSpec[] {
  return Object.values(PROVIDERS).filter(providerReady);
}
