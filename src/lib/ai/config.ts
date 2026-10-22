import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { withRetry } from "@/db/retry";
import { settings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secret";

import { PROVIDERS, type ProviderId, type ProviderSpec, type Tier } from "./providers";

/**
 * Where the assistant's configuration comes from.
 *
 * The settings table wins over the environment, so a provider can be set up
 * and a model chosen from the settings page without a redeploy. Environment
 * variables remain the fallback, which keeps anything already deployed working
 * and means a key can still be injected by the platform if preferred.
 */

const ACTIVE = "ai.provider";
const modelKey = (id: ProviderId) => `ai.model.${id}`;
const secretKey = (id: ProviderId) => `ai.key.${id}`;

export type ProviderConfig = {
  spec: ProviderSpec;
  /** Decrypted key, from the database or the environment. */
  apiKey: string | null;
  /** Where it came from, so the UI can say so. */
  keySource: "settings" | "environment" | null;
  /** Model override, if one has been chosen. */
  model: string | null;
  ready: boolean;
};

export type AiConfig = {
  activeId: ProviderId;
  active: ProviderConfig;
  providers: Record<ProviderId, ProviderConfig>;
};

async function readAll(): Promise<Map<string, string | null>> {
  const keys = [
    ACTIVE,
    ...Object.keys(PROVIDERS).flatMap((id) => [
      modelKey(id as ProviderId),
      secretKey(id as ProviderId),
    ]),
  ];
  const rows = await withRetry("aiSettings", () =>
    db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(inArray(settings.key, keys)),
  );
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function getAiConfig(): Promise<AiConfig> {
  const stored = await readAll();

  const providers = {} as Record<ProviderId, ProviderConfig>;

  for (const spec of Object.values(PROVIDERS)) {
    const fromDb = decryptSecret(stored.get(secretKey(spec.id)) ?? null);
    const fromEnv = spec.keyEnv ? (process.env[spec.keyEnv] ?? null) : null;
    const apiKey = fromDb || fromEnv || null;

    providers[spec.id] = {
      spec,
      apiKey,
      keySource: fromDb ? "settings" : fromEnv ? "environment" : null,
      model: stored.get(modelKey(spec.id)) || process.env.AI_MODEL || null,
      // Ollama needs no key; everything else does.
      ready: spec.keyEnv === null || !!apiKey,
    };
  }

  const chosen = (stored.get(ACTIVE) ||
    process.env.AI_PROVIDER ||
    "claude") as ProviderId;
  const activeId = chosen in PROVIDERS ? chosen : "claude";

  return { activeId, active: providers[activeId], providers };
}

/** The model for a tier, honouring any override. */
export function modelFrom(config: ProviderConfig, tier: Tier): string {
  return config.model?.trim() || config.spec.models[tier];
}

/* ---------------------------------------------------------------- writes --- */

async function put(key: string, value: string | null) {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function setActiveProvider(id: ProviderId) {
  if (!(id in PROVIDERS)) throw new Error("Unknown provider");
  await put(ACTIVE, id);
}

export async function setProviderModel(id: ProviderId, model: string) {
  if (!(id in PROVIDERS)) throw new Error("Unknown provider");
  await put(modelKey(id), model.trim() || null);
}

/** Stores a key encrypted. An empty string clears it. */
export async function setProviderKey(id: ProviderId, apiKey: string) {
  const spec = PROVIDERS[id];
  if (!spec) throw new Error("Unknown provider");
  if (spec.keyEnv === null) throw new Error(`${spec.label} needs no API key.`);

  const trimmed = apiKey.trim();
  await put(secretKey(id), trimmed ? encryptSecret(trimmed) : null);
}

export async function clearProviderKey(id: ProviderId) {
  await db.delete(settings).where(eq(settings.key, secretKey(id)));
}
