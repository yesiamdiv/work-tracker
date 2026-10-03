/**
 * Neon's free tier suspends the compute after about five minutes idle. The
 * request that wakes it can fail outright — `NeonDbError: Error connecting to
 * database: fetch failed` — before the instance is ready to answer.
 *
 * So every read retries a connection-level failure. Query errors (bad SQL, a
 * constraint violation) are thrown immediately: retrying those just delays a
 * real bug.
 */

const COLD_START = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|Connection terminated|connection closed/i;

const DELAYS_MS = [250, 750, 1500];

export async function withRetry<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  let last: unknown;

  for (let attempt = 0; attempt <= DELAYS_MS.length; attempt++) {
    try {
      return await run();
    } catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : String(error);
      const cause =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : "";

      if (!COLD_START.test(message) && !COLD_START.test(cause)) throw error;
      if (attempt === DELAYS_MS.length) break;

      await new Promise((r) => setTimeout(r, DELAYS_MS[attempt]));
      console.warn(
        `[db] ${label}: waking database, retry ${attempt + 1}/${DELAYS_MS.length}`,
      );
    }
  }

  throw new Error(
    `Database unreachable after ${DELAYS_MS.length + 1} attempts (${label}). ` +
      `If this persists, check the Neon project is not disabled.`,
    { cause: last },
  );
}
