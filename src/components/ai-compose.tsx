"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { acceptProposal, proposeFromPrompt, type Proposal } from "@/app/ai-actions";
import { Button, Label, Meta } from "@/components/ui";
import { KIND_LABEL } from "@/lib/capture";

/**
 * Describe a piece of work in prose; get back a proposed subject, task and
 * entries. Nothing is written until it's approved — see `acceptProposal`.
 */
export function AiCompose() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();

  function propose() {
    setError(null);
    setProposal(null);
    start(async () => {
      const result = await proposeFromPrompt(text);
      if (result.ok) setProposal(result.data);
      else setError(result.error);
    });
  }

  function accept() {
    if (!proposal) return;
    setError(null);
    startSave(async () => {
      const result = await acceptProposal(proposal);
      if (result.ok) {
        setProposal(null);
        setText("");
        router.push(`/t/${result.data.taskId}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className="rounded-xs border border-line p-5">
      <Label>Describe some work and let Claude set it up</Label>
      <textarea
        rows={5}
        value={text}
        disabled={pending || saving}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          "Paste rough notes, or describe what you're starting. For example:\n\nStarting QA on the Acme firmware 2.5 beta this week. Need to run the power suite and the BLE reconnect cases on rev C and rev D. Already found that pairing fails on first boot — raised ACME-4502."
        }
        className="w-full rounded-xs border border-line bg-raised px-4 py-3 text-body transition-colors focus:border-line-strong disabled:opacity-50"
      />

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button onClick={propose} disabled={pending || saving || text.trim().length < 10}>
          {pending ? "Reading it…" : "Propose a setup"}
        </Button>
        <Meta>Nothing is saved until you approve it.</Meta>
      </div>

      {error && <Meta className="mt-3 block text-body">{error}</Meta>}

      {proposal && (
        <div className="mt-5 border-t border-line pt-5">
          <Label>Proposed — review before saving</Label>

          <dl className="space-y-3">
            <div>
              <Meta className="block text-muted">Task</Meta>
              <p className="text-body">
                {proposal.task.title}{" "}
                <Meta>· {proposal.task.type.replace(/_/g, " ")}</Meta>
              </p>
            </div>

            <div>
              <Meta className="block text-muted">Subjects</Meta>
              <p className="text-body">
                {proposal.task.subjectNames.length
                  ? proposal.task.subjectNames.join(", ")
                  : "none"}
              </p>
              {proposal.subject && !proposal.subject.reuseExisting && (
                <Meta className="mt-0.5 block">
                  New subject: {proposal.subject.name} (
                  {proposal.subject.kind.replace(/_/g, " ")}
                  {proposal.subject.parentName
                    ? `, under ${proposal.subject.parentName}`
                    : ", top level"}
                  )
                </Meta>
              )}
            </div>

            <div>
              <Meta className="block text-muted">
                Entries ({proposal.entries.length})
              </Meta>
              {proposal.entries.length ? (
                <ul className="mt-1 divide-y divide-line rounded-xs border border-line">
                  {proposal.entries.map((e, i) => (
                    <li key={i} className="px-3 py-2">
                      <Meta className="block text-muted">
                        {KIND_LABEL[e.kind]}
                        {e.outcome ? ` · ${e.outcome}` : ""}
                      </Meta>
                      <p className="text-body">{e.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <Meta>
                  None — the note describes work to do, not things that happened.
                </Meta>
              )}
            </div>

            {proposal.notes && (
              <div>
                <Meta className="block text-muted">Claude&rsquo;s note</Meta>
                <Meta>{proposal.notes}</Meta>
              </div>
            )}
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button onClick={accept} disabled={saving}>
              {saving ? "Saving…" : "Save this"}
            </Button>
            <button
              onClick={() => setProposal(null)}
              disabled={saving}
              className="text-[13px] text-faint transition-colors hover:text-muted"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
