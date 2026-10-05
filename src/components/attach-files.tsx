"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { recordAttachment, uploadTicket } from "@/app/drive-actions";
import { Meta } from "@/components/ui";

type Progress = { name: string; pct: number; error?: string };

/**
 * Uploads straight from the browser to Google Drive.
 *
 * Deliberately not routed through a server action: Vercel caps a request body
 * at a few megabytes, and a screen recording of a flaky test is bigger than
 * that. Only the resulting file id comes back to us.
 */
export function AttachFiles({ eventId }: { eventId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Progress[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function send(files: File[]) {
    setError(null);
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, pct: 0 })));

    const ticket = await uploadTicket(eventId);
    if (!ticket.ok) {
      setError(ticket.error);
      setRows([]);
      setBusy(false);
      return;
    }

    for (let i = 0; i < files.length; i++) {
      try {
        const fileId = await putToDrive(
          files[i],
          ticket.data.token,
          ticket.data.folderId,
          (pct) =>
            setRows((r) => r.map((x, j) => (j === i ? { ...x, pct } : x))),
        );
        const saved = await recordAttachment({ eventId, fileId });
        if (!saved.ok) throw new Error(saved.error);
        setRows((r) => r.map((x, j) => (j === i ? { ...x, pct: 100 } : x)));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed";
        setRows((r) => r.map((x, j) => (j === i ? { ...x, error: message } : x)));
      }
    }

    setBusy(false);
    router.refresh();
    // Clear the finished rows, but keep any that failed on screen.
    setRows((r) => r.filter((x) => x.error));
    if (input.current) input.current.value = "";
  }

  return (
    <div className="mt-2">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void send(files);
        }}
      />

      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="text-[13px] text-muted underline decoration-line underline-offset-[3px] transition-colors hover:text-text disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Attach files"}
      </button>

      {error && <Meta className="mt-1.5 block text-body">{error}</Meta>}

      {rows.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-2">
              <Meta className="min-w-0 flex-1 truncate">{r.name}</Meta>
              <Meta className={r.error ? "text-body" : "text-muted"}>
                {r.error ?? (r.pct === 100 ? "done" : `${r.pct}%`)}
              </Meta>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Multipart upload to Drive.
 *
 * XMLHttpRequest rather than fetch, purely for upload progress — `fetch` still
 * has no way to report how much of a request body has been sent.
 */
function putToDrive(
  file: File,
  token: string,
  folderId: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const metadata = {
    name: file.name,
    parents: [folderId],
  };

  const body = new FormData();
  body.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  body.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    );
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText).id as string);
        } catch {
          reject(new Error("Drive returned something unreadable."));
        }
      } else if (xhr.status === 401) {
        reject(new Error("Google sign-in expired — sign out and back in."));
      } else if (xhr.status === 403) {
        reject(
          new Error(
            "Drive refused it. Is the Google Drive API enabled for the project?",
          ),
        );
      } else {
        reject(new Error(`Drive error ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(body);
  });
}
