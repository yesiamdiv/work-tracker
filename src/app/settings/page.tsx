import { ProviderSettings, type ProviderRow } from "@/components/provider-settings";
import { Meta, PageTitle, SectionLabel } from "@/components/ui";
import { getAiConfig, PROVIDERS } from "@/lib/ai";
import { maskSecret } from "@/lib/secret";

/**
 * A big summary can take a while to generate, and Vercel kills a serverless
 * function at ten seconds by default. Sixty is the Hobby plan's maximum.
 */
export const maxDuration = 60;

/** Where to get a key, per provider. */
const SIGNUP: Record<string, string> = {
  claude: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
  deepseek: "https://platform.deepseek.com/api_keys",
  openrouter: "https://openrouter.ai/keys",
};

/** Indicative, for comparison only — a summary is roughly 3k in, 400 out. */
function costPer100(price?: { in: number; out: number }) {
  if (!price) return undefined;
  if (price.in === 0) return "free";
  return `~$${(((3000 * price.in + 400 * price.out) / 1e6) * 100).toFixed(2)}`;
}

export default async function SettingsPage() {
  const config = await getAiConfig();

  const rows: ProviderRow[] = Object.values(PROVIDERS).map((spec) => {
    const c = config.providers[spec.id];
    return {
      id: spec.id,
      label: spec.label,
      active: config.activeId === spec.id,
      // Masked here, on the server. The key itself never leaves it.
      maskedKey:
        c.keySource === "settings" && c.apiKey ? maskSecret(c.apiKey) : null,
      keySource: c.keySource,
      keyEnv: spec.keyEnv,
      model: c.model,
      defaultModels: spec.models,
      ready: c.ready,
      notes: spec.notes,
      signupUrl: SIGNUP[spec.id],
      costPer100: costPer100(spec.price),
    };
  });

  return (
    <>
      <PageTitle sub="Which model writes the summaries, and the keys to reach it. Saved here rather than in the deployment, so changing provider needs no redeploy.">
        Settings
      </PageTitle>

      <SectionLabel hint="Keys are encrypted before they are stored and are never sent back to this page — only a masked hint of one. An environment variable still works and is used when nothing is stored here.">
        Assistant providers
      </SectionLabel>

      <ProviderSettings rows={rows} />

      <p className="mt-7 max-w-xl">
        <Meta>
          Ollama runs on your own machine, so it needs no key — but it only
          works where it is running, which is not the deployed app. OpenRouter
          needs a model name, since its catalogue changes constantly; everything
          else has sensible defaults.
        </Meta>
      </p>
    </>
  );
}
