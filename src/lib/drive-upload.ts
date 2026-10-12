import { recordAttachment, uploadTicket } from "@/app/drive-actions";

/**
 * Browser-side upload to Drive, shared by the compose boxes and the
 * after-the-fact "Attach files" control.
 *
 * The bytes go straight to Google: a serverless function caps request bodies
 * well below the size of a screen recording, so proxying them is not an option.
 * Only the resulting file id comes back to us.
 */

export type UploadProgress = { index: number; pct: number };

export type UploadOutcome = {
  uploaded: number;
  failures: { name: string; error: string }[];
};

export async function uploadFilesToEvent(
  eventId: string,
  files: File[],
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadOutcome> {
  if (!files.length) return { uploaded: 0, failures: [] };

  const ticket = await uploadTicket(eventId);
  if (!ticket.ok) {
    // One cause for all of them — a per-file message would just repeat it.
    return {
      uploaded: 0,
      failures: files.map((f) => ({ name: f.name, error: ticket.error })),
    };
  }

  const failures: UploadOutcome["failures"] = [];
  let uploaded = 0;

  for (let i = 0; i < files.length; i++) {
    try {
      const fileId = await putToDrive(
        files[i],
        ticket.data.token,
        ticket.data.folderId,
        (pct) => onProgress?.({ index: i, pct }),
      );
      const saved = await recordAttachment({ eventId, fileId });
      if (!saved.ok) throw new Error(saved.error);
      uploaded++;
      onProgress?.({ index: i, pct: 100 });
    } catch (error) {
      failures.push({
        name: files[i].name,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  return { uploaded, failures };
}

/**
 * Multipart upload.
 *
 * XMLHttpRequest rather than fetch, purely for upload progress — `fetch` still
 * cannot report how much of a request body has been sent.
 */
function putToDrive(
  file: File,
  token: string,
  folderId: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const body = new FormData();
  body.append(
    "metadata",
    new Blob([JSON.stringify({ name: file.name, parents: [folderId] })], {
      type: "application/json",
    }),
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
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
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

/** Pulls real files out of a paste — screenshots arrive this way. */
export function filesFromClipboard(e: ClipboardEvent): File[] {
  const items = e.clipboardData?.items;
  if (!items) return [];
  const out: File[] = [];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (!file) continue;
    // A pasted screenshot has no name; give it a readable one.
    out.push(
      file.name && file.name !== "image.png"
        ? file
        : new File([file], `pasted-${stamp()}.${ext(file.type)}`, {
            type: file.type,
          }),
    );
  }
  return out;
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function ext(mime: string): string {
  return mime.split("/")[1]?.split("+")[0] ?? "bin";
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
