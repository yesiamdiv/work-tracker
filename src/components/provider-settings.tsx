"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  chooseProvider,
  saveProviderKey,
  saveProviderModel,
  testProvider,
  type ActionResult,
} from "@/app/settings-actions";
import { Alert, Button, Input, Label, Meta } from "@/components/ui";
import { cn } from "@/lib/utils";

export type ProviderRow = {
  id: string;
  label: string;
  active: boolean;
  /** Masked — the key itself never reaches the browser. */
  maskedKey: string | null;
  keySource: "settings" | "environment" | null;
  keyEnv: string | null;
  model: string | null;
  defaultModels: { cheap: string; standard: string };
  ready: boolean;
  notes?: string;
  signupUrl?: string;
  costPer100?: string;
};

/**
 * One provider's configuration.
 *
 * Keys are write-only from here: what comes back from the server is masked, so
 * the page can say a key is present without being able to leak it. Saving an
 * empty value clears it.
 */
function Row({ row }: { row: ProviderRow }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [model, setModel] = useState(row.model ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setResult(await fn());
      router.refresh();
    });

  return (
    <section
      className={cn(
        "rounded-xs border p-4",
        row.active ? "border-accent" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[15px] text-text">
          {row.label}
          {row.active && <Meta className="ml-2 text-muted">· in use</Meta>}
        </h3>

        <div className="flex items-center gap-4">
          {row.ready && !row.active && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => chooseProvider(row.id))}
              className="text-[13px] text-text underline decoration-line-strong underline-offset-[3px] disabled:opacity-50"
            >
              Use this one
            </button>
          )}
          {row.ready && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => testProvider(row.id))}
              className="text-[13px] text-muted underline decoration-line underline-offset-[3px] transition-colors hover:text-text disabled:opacity-50"
            >
              {pending ? "Testing…" : "Test"}
            </button>
          )}
        </div>
      </div>

      <p className="mt-1">
        <Meta>
          {row.ready
            ? row.keySource === "environment"
              ? `Key from ${row.keyEnv} in the environment`
              : row.keySource === "settings"
                ? `Key stored here · ${row.maskedKey}`
                : "No key needed"
            : "No key yet"}
          {row.costPer100 && ` · ${row.costPer100} per 100 summaries`}
        </Meta>
      </p>

      {row.notes && <Meta className="mt-1 block">{row.notes}</Meta>}

      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        {row.keyEnv && (
          <div>
            <Label>API key</Label>
            <Input
              type="password"
              value={key}
              disabled={pending}
              placeholder={row.maskedKey ? "Replace the stored key" : "Paste a key"}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => {
                  run(() => saveProviderKey(row.id, key));
                  setKey("");
                }}
                disabled={pending || !key.trim()}
              >
                Save key
              </Button>
              {row.maskedKey && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => saveProviderKey(row.id, ""))}
                  className="text-[13px] text-faint transition-colors hover:text-text disabled:opacity-50"
                >
                  Remove
                </button>
              )}
              {row.signupUrl && (
                <a
                  href={row.signupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="extlink text-[13px] text-muted hover:text-text"
                >
                  Get a key ↗
                </a>
              )}
            </div>
          </div>
        )}

        <div>
          <Label>Model</Label>
          <Input
            value={model}
            disabled={pending}
            placeholder={`${row.defaultModels.standard} / ${row.defaultModels.cheap}`}
            onChange={(e) => setModel(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => run(() => saveProviderModel(row.id, model))}
              disabled={pending}
            >
              Save model
            </Button>
            <Meta>
              {row.model
                ? "Overriding both tiers."
                : "Empty uses the defaults above."}
            </Meta>
          </div>
        </div>
      </div>

      {result &&
        (result.ok ? (
          <Alert>{result.message}</Alert>
        ) : (
          <Alert>{result.error}</Alert>
        ))}
    </section>
  );
}

export function ProviderSettings({ rows }: { rows: ProviderRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
    </div>
  );
}
