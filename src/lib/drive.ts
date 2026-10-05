import { auth, DRIVE_SCOPE } from "@/auth";

/**
 * Google Drive, for entry attachments.
 *
 * Only metadata and folder bookkeeping happen here. The file bytes go
 * **browser → Drive directly** using a short-lived access token, never through
 * a serverless function: the first screen recording of a flaky test would blow
 * past the request body limit.
 *
 * Scope is `drive.file`, so the app can only see files it created itself.
 */

const API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export const APP_FOLDER_NAME = "Work Tracker";

export class DriveError extends Error {}

export class DriveReauthNeeded extends DriveError {
  constructor() {
    super(
      "Google sign-in has expired. Sign out and back in to upload files — Testing-status apps expire this weekly.",
    );
  }
}

export class DriveNotGranted extends DriveError {
  constructor() {
    super(
      "Drive access was not granted. Sign out and back in, and accept the Drive permission.",
    );
  }
}

/** A usable access token, or a specific reason it isn't available. */
export async function driveToken(): Promise<string> {
  const session = await auth();
  if (!session) throw new DriveError("Not signed in.");
  if (session.refreshFailed) throw new DriveReauthNeeded();
  if (!session.hasDrive) throw new DriveNotGranted();
  if (!session.accessToken) throw new DriveReauthNeeded();
  return session.accessToken;
}

export const driveScope = DRIVE_SCOPE;

async function call<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (response.status === 401) throw new DriveReauthNeeded();
  if (response.status === 403) {
    const body = await response.text();
    // The likeliest first-run failure, and the message Google gives is opaque.
    if (/accessNotConfigured|has not been used|disabled/i.test(body)) {
      throw new DriveError(
        "The Google Drive API is not enabled for this project. Enable it under APIs & Services → Library, then try again.",
      );
    }
    throw new DriveError(`Drive refused the request: ${body.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new DriveError(
      `Drive error ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }

  return response.json() as Promise<T>;
}

type FileList = { files?: { id: string; name: string }[] };

/**
 * Finds a folder by name under a parent, creating it if absent.
 *
 * With `drive.file` the query only ever sees folders this app made, so there is
 * no risk of colliding with the user's own folders of the same name.
 */
async function folder(
  token: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const clauses = [
    `name = '${safe}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ];

  const found = await call<FileList>(
    token,
    `/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id,name)&pageSize=1`,
  );
  if (found.files?.length) return found.files[0].id;

  const created = await call<{ id: string }>(token, "/files?fields=id", {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return created.id;
}

/**
 * The folder a task's attachments belong in: `Work Tracker/<subject>/<task>`,
 * so the files remain navigable in Drive without the app.
 */
export async function folderForTask(
  token: string,
  subjectName: string | null,
  taskTitle: string,
): Promise<string> {
  const root = await folder(token, APP_FOLDER_NAME);
  const parent = subjectName
    ? await folder(token, sanitise(subjectName), root)
    : root;
  return folder(token, sanitise(taskTitle), parent);
}

/** Drive tolerates most characters, but slashes and newlines make a mess. */
function sanitise(name: string): string {
  return name.replace(/[\\/\n\r]+/g, " ").trim().slice(0, 120) || "Untitled";
}

/** Metadata for a file the browser has already uploaded. */
export async function fileMeta(
  token: string,
  fileId: string,
): Promise<{
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  thumbnailLink?: string;
}> {
  return call(
    token,
    `/files/${fileId}?fields=id,name,mimeType,size,webViewLink,thumbnailLink`,
  );
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  const response = await fetch(`${API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 means it is already gone, which is the outcome we wanted.
  if (!response.ok && response.status !== 404) {
    throw new DriveError(`Could not delete from Drive (${response.status}).`);
  }
}
