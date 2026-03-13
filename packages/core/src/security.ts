import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKeyBuffer(secret: string): Buffer {
  const sanitized = secret.trim();
  const asHex = /^[0-9a-f]{64}$/i.test(sanitized) ? sanitized : "";
  const buffer = asHex ? Buffer.from(asHex, "hex") : Buffer.from(sanitized);

  if (buffer.length !== 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must be exactly 32 bytes or 64 hex chars.");
  }

  return buffer;
}

export function encryptJson(payload: unknown, secret: string): string {
  const key = getKeyBuffer(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptJson<T>(payload: string, secret: string): T {
  const key = getKeyBuffer(secret);
  const raw = Buffer.from(payload, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return JSON.parse(plaintext.toString("utf8")) as T;
}
