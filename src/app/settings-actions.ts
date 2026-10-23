"use server";

import { revalidatePath } from "next/cache";

import {
  askText,
  aiErrorMessage,
  clearProviderKey,
  getAiConfig,
  modelFrom,
  PROVIDERS,
  setActiveProvider,
  setProviderKey,
  setProviderModel,
  type ProviderId,
} from "@/lib/ai";
import { getSession } from "@/lib/session";

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
}

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function asProviderId(raw: string): ProviderId {
  if (!(raw in PROVIDERS)) throw new Error("Unknown provider");
  return raw as ProviderId;
}

/** Stores a key for one provider. An empty value clears it. */
export async function saveProviderKey(
  provider: string,
  apiKey: string,
): Promise<ActionResult> {
  try {
    await requireUser();
    const id = asProviderId(provider);

    if (!apiKey.trim()) {
      await clearProviderKey(id);
      revalidatePath("/settings");
      revalidatePath("/ask");
      return { ok: true, message: `Removed the ${PROVIDERS[id].label} key.` };
    }

    await setProviderKey(id, apiKey);
    revalidatePath("/settings");
    revalidatePath("/ask");
    return { ok: true, message: `Saved. Stored encrypted, not in plain text.` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the key",
    };
  }
}

export async function saveProviderModel(
  provider: string,
  model: string,
): Promise<ActionResult> {
  try {
    await requireUser();
    const id = asProviderId(provider);
    await setProviderModel(id, model);
    revalidatePath("/settings");
    revalidatePath("/ask");
    return {
      ok: true,
      message: model.trim()
        ? `Using ${model.trim()}.`
        : `Back to the defaults for ${PROVIDERS[id].label}.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the model",
    };
  }
}

export async function chooseProvider(provider: string): Promise<ActionResult> {
  try {
    await requireUser();
    const id = asProviderId(provider);
    await setActiveProvider(id);
    revalidatePath("/settings");
    revalidatePath("/ask");
    revalidatePath("/");
    return { ok: true, message: `${PROVIDERS[id].label} is now in use.` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not switch",
    };
  }
}

/**
 * Sends one trivial prompt to a provider and reports what came back.
 *
 * Worth the call: a key can be present and still wrong, out of credit, or
 * paired with a model the provider does not offer — and finding that out while
 * trying to summarise a month is a worse way to learn it.
 */
export async function testProvider(provider: string): Promise<ActionResult> {
  try {
    await requireUser();
    const id = asProviderId(provider);

    const before = await getAiConfig();
    const target = before.providers[id];
    if (!target.ready) {
      return { ok: false, error: `${target.spec.label} has no API key yet.` };
    }

    // askText uses whichever provider is active, so test by switching to it.
    const restore = before.activeId;
    await setActiveProvider(id);
    try {
      const started = Date.now();
      const reply = await askText({
        system: "Reply with exactly: ok",
        user: "Reply with exactly: ok",
        tier: "cheap",
        /*
         * Not 20. A reasoning model spends its budget thinking before it
         * writes anything, so a tiny ceiling makes a working model report
         * failure. 2,000 is enough for one to think and still answer "ok".
         */
        maxTokens: 2_000,
        /*
         * Fail fast. This is a two-word prompt: a model that cannot answer it
         * inside twenty seconds will never answer a real question inside the
         * sixty the serverless function gets, so saying so here is kinder than
         * letting it look configured and time out later.
         */
        timeoutMs: 20_000,
      });
      const took = ((Date.now() - started) / 1000).toFixed(1);
      return {
        ok: true,
        message: `${target.spec.label} answered in ${took}s with "${reply.slice(0, 32)}" using ${modelFrom(target, "cheap")}.${
          Number(took) > 8
            ? " That is slow for two words — a real question may well time out."
            : ""
        }`,
      };
    } finally {
      if (restore !== id) await setActiveProvider(restore);
      revalidatePath("/settings");
    }
  } catch (error) {
    const spec = PROVIDERS[provider as ProviderId];
    return { ok: false, error: aiErrorMessage(error, spec) };
  }
}
