import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts the API keys stored in the settings table.
 *
 * Keys have to live in the database so a provider can be configured without a
 * redeploy, but a plaintext column means a database dump — or anyone with the
 * connection string — hands over every key. AES-256-GCM with a key derived
 * from AUTH_SECRET means the dump alone is not enough.
 *
 * This is not protection against someone who already has the server's
 * environment; it narrows the blast radius of the database, which is the part
 * that gets copied, backed up and pasted into tools.
 */

const PREFIX = "enc.v1.";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is required to store API keys. Set it in .env.local.",
    );
  }
  // AUTH_SECRET is base64 of arbitrary length; hash it to exactly 32 bytes.
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, body].map((b) => b.toString("base64url")).join(".");
}

/**
 * Returns null rather than throwing when a value cannot be read — a key
 * encrypted under a previous AUTH_SECRET should surface as "not configured"
 * and be re-entered, not crash every page that asks whether AI is available.
 */
export function decryptSecret(stored: string | null): string | null {
  if (!stored) return null;
  // Written before encryption existed, or pasted in by hand.
  if (!stored.startsWith(PREFIX)) return stored;

  try {
    const [ivB64, tagB64, bodyB64] = stored.slice(PREFIX.length).split(".");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return (
      decipher.update(Buffer.from(bodyB64, "base64url")).toString("utf8") +
      decipher.final("utf8")
    );
  } catch {
    console.warn("[secret] a stored key could not be decrypted; treating it as unset");
    return null;
  }
}

/** Shown in the UI in place of a key, which is never sent to the browser. */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}
