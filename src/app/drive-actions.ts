"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { withRetry } from "@/db/retry";
import { attachments, events, subjects, taskSubjects, tasks } from "@/db/schema";
import {
  deleteFile,
  DriveError,
  fileMeta,
  folderForTask,
  driveToken,
} from "@/lib/drive";
import { getSession } from "@/lib/session";

export type DriveResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function guard<T>(run: () => Promise<T>): Promise<DriveResult<T>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Not signed in.");
    return { ok: true, data: await run() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof DriveError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Upload failed.",
    };
  }
}

/**
 * What the browser needs to upload directly: a short-lived token and the
 * destination folder. The token is the session's own Google access token, good
 * for an hour; the bytes never touch this server.
 */
export async function uploadTicket(
  eventId: string,
): Promise<DriveResult<{ token: string; folderId: string }>> {
  return guard(async () => {
    const token = await driveToken();

    const [row] = await withRetry("uploadTicket", () =>
      db
        .select({ taskId: events.taskId, taskTitle: tasks.title })
        .from(events)
        .innerJoin(tasks, eq(tasks.id, events.taskId))
        .where(eq(events.id, eventId))
        .limit(1),
    );
    if (!row) throw new Error("That entry no longer exists.");

    // The primary subject names the folder, so Drive mirrors the app's shape.
    const [subject] = await withRetry("uploadTicket.subject", () =>
      db
        .select({ name: subjects.name })
        .from(taskSubjects)
        .innerJoin(subjects, eq(subjects.id, taskSubjects.subjectId))
        .where(eq(taskSubjects.taskId, row.taskId))
        .orderBy(taskSubjects.isPrimary)
        .limit(1),
    );

    const folderId = await folderForTask(
      token,
      subject?.name ?? null,
      row.taskTitle,
    );
    return { token, folderId };
  });
}

/** Records a file the browser has already put in Drive. */
export async function recordAttachment(input: {
  eventId: string;
  fileId: string;
}): Promise<DriveResult<{ id: string }>> {
  return guard(async () => {
    const token = await driveToken();
    // Read the metadata back from Drive rather than trusting the client's
    // claims about name, type or size.
    const meta = await fileMeta(token, input.fileId);

    const [row] = await db
      .insert(attachments)
      .values({
        eventId: input.eventId,
        driveFileId: meta.id,
        name: meta.name,
        mime: meta.mimeType ?? null,
        size: meta.size ? Number(meta.size) : null,
        webViewLink: meta.webViewLink ?? null,
        thumbnailLink: meta.thumbnailLink ?? null,
      })
      .returning({ id: attachments.id });

    const [event] = await db
      .select({ taskId: events.taskId })
      .from(events)
      .where(eq(events.id, input.eventId))
      .limit(1);
    if (event) revalidatePath(`/t/${event.taskId}`);

    return { id: row.id };
  });
}

/**
 * Removes an attachment. The Drive file goes too — a record pointing at a file
 * you cannot see is worse than no record.
 */
export async function removeAttachment(
  attachmentId: string,
): Promise<DriveResult<null>> {
  return guard(async () => {
    const [row] = await db
      .select({
        driveFileId: attachments.driveFileId,
        eventId: attachments.eventId,
      })
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);
    if (!row) return null;

    await db.delete(attachments).where(eq(attachments.id, attachmentId));

    // Best effort: the row is already gone, and a leftover file in Drive is a
    // smaller problem than a failed delete the user cannot retry.
    try {
      await deleteFile(await driveToken(), row.driveFileId);
    } catch (error) {
      console.error("[drive] could not delete the file:", error);
    }

    const [event] = await db
      .select({ taskId: events.taskId })
      .from(events)
      .where(eq(events.id, row.eventId))
      .limit(1);
    if (event) revalidatePath(`/t/${event.taskId}`);

    return null;
  });
}
