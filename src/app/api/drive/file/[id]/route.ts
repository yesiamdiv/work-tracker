import { eq } from "drizzle-orm";

import { db } from "@/db";
import { attachments } from "@/db/schema";
import { driveToken } from "@/lib/drive";
import { getSession } from "@/lib/session";

/**
 * Streams one attachment's bytes, authenticated as the signed-in user.
 *
 * Needed because Drive's own `thumbnailLink` expires within hours and carries
 * no auth, so an <img> pointing at it works for a while and then silently
 * breaks. This serves the bytes from Drive using the session's access token
 * instead, so an image can simply be displayed.
 *
 * Two guards matter here. The session must be signed in, and the id must
 * already exist in our own `attachments` table — otherwise this would be an
 * open proxy for every file in the user's Drive that the app can see.
 *
 * Intended for images, which are small. Large files keep their direct Drive
 * links rather than being pulled through a serverless function.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new Response("Not signed in", { status: 401 });
  }

  const { id } = await params;

  // Only ids this app recorded. `id` is the attachment row id, not a Drive id,
  // so a Drive file the app never attached cannot be requested at all.
  const [row] = await db
    .select({
      driveFileId: attachments.driveFileId,
      name: attachments.name,
      mime: attachments.mime,
    })
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);

  if (!row) return new Response("Not found", { status: 404 });

  let token: string;
  try {
    token = await driveToken();
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Drive is unavailable",
      { status: 403 },
    );
  }

  const upstream = await fetch(
    `https://www.googleapis.com/drive/v3/files/${row.driveFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response(`Drive returned ${upstream.status}`, {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const type = row.mime ?? upstream.headers.get("content-type") ?? "application/octet-stream";

  const headers = new Headers({
    "Content-Type": type,
    // Private to this user; never let a shared cache hold it.
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${row.name.replace(/"/g, "")}"`,
  });

  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(upstream.body, { headers });
}
