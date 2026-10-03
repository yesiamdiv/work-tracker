import { Label, Meta } from "@/components/ui";
import {
  PROVIDERS,
  activeProvider,
  modelFor,
  providerReady,
} from "@/lib/ai";

/**
 * Which provider is in use, what it costs, and what else is available.
 *
 * Switching is an env change rather than a UI control on purpose: the choice is
 * per-deployment, and a dropdown would imply each request could pick, which
 * would mean six sets of prompt tuning instead of one.
 */
export function ProviderStatus() {
  const active = activeProvider();
  const rows = Object.values(PROVIDERS);

  const cost = (p: (typeof rows)[number]) => {
    if (!p.price) return "varies";
    if (p.price.in === 0) return "free";
    // A summary is roughly 3k in, 400 out. Shown per 100 of them.
    const per100 = (3000 * p.price.in + 400 * p.price.out) / 1e6 * 100;
    return `~$${per100.toFixed(2)}`;
  };

  return (
    <section className="rounded-xs border border-line p-4">
      <Label>Model provider</Label>

      <p className="text-body">
        {active.label}{" "}
        <Meta>
          · {modelFor("standard")} for summaries · {modelFor("cheap")} for
          rewrites
        </Meta>
      </p>
      {active.notes && <Meta className="mt-1 block">{active.notes}</Meta>}
      {!providerReady(active) && (
        <Meta className="mt-1.5 block text-body">
          Not usable yet — {active.keyEnv} is not set.
        </Meta>
      )}

      <div className="mt-4 border-t border-line pt-3.5">
        <Meta className="mb-2 block text-muted">
          Set AI_PROVIDER in .env.local to switch. Cost is for 100 summaries.
        </Meta>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-faint">
              <th className="pb-1.5 font-normal">Provider</th>
              <th className="pb-1.5 font-normal">AI_PROVIDER</th>
              <th className="pb-1.5 text-right font-normal">100 summaries</th>
              <th className="pb-1.5 text-right font-normal">Ready</th>
            </tr>
          </thead>
          <tbody className="text-muted">
            {rows.map((p) => (
              <tr
                key={p.id}
                className={
                  p.id === active.id ? "text-text" : undefined
                }
              >
                <td className="py-1">{p.label}</td>
                <td className="py-1 font-mono text-[12px]">{p.id}</td>
                <td className="py-1 text-right tnum">{cost(p)}</td>
                <td className="py-1 text-right">
                  {providerReady(p) ? "yes" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
