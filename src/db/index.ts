import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";

import * as schema from "./schema";

/**
 * Two drivers, one schema.
 *
 * - No `DATABASE_URL` → PGlite: real Postgres compiled to WASM, kept in
 *   `.pglite/`. Zero setup, which is what makes the POC runnable immediately.
 * - `DATABASE_URL` set → Neon over HTTP, which is what the deploy uses.
 *
 * Both are Postgres, so the schema and every query are identical — switching is
 * a matter of setting the env var.
 */

export type Database = PgliteDatabase<typeof schema>;

const globalForDb = globalThis as { __db?: Database; __pglite?: PGlite };

function connect(): Database {
  if (globalForDb.__db) return globalForDb.__db;

  const url = process.env.DATABASE_URL;

  if (url) {
    globalForDb.__db = drizzleNeon(neon(url), { schema }) as unknown as Database;
  } else {
    // One PGlite instance across dev hot-reloads, or the data dir stays locked.
    globalForDb.__pglite ??= new PGlite(process.env.PGLITE_DIR ?? "./.pglite");
    globalForDb.__db = drizzlePglite(globalForDb.__pglite, { schema });
  }

  return globalForDb.__db;
}

/**
 * Connected on first query, not on import — `next build` imports every module
 * while collecting page data, and a build machine has no reason to open a
 * database.
 */
export const db = new Proxy({} as Database, {
  get: (_, prop) => Reflect.get(connect(), prop),
});

export { schema };
