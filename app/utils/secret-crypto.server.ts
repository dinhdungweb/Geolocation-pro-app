import crypto from "crypto";

const VERSION = "v1";

function getKey() {
  const rawKey = process.env.APP_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("APP_ENCRYPTION_KEY is required to encrypt stored secrets");
  }
  return crypto.createHash("sha256").update(rawKey).digest();
}

function encode(value: Buffer) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

export function encryptSecret(value: string) {
  if (!value) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, encode(iv), encode(authTag), encode(encrypted)].join(":");
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return "";
  if (!value.startsWith(`${VERSION}:`)) {
    return value;
  }

  const [, encodedIv, encodedAuthTag, encodedEncrypted] = value.split(":");
  if (!encodedIv || !encodedAuthTag || !encodedEncrypted) {
    throw new Error("Encrypted secret is malformed");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), decode(encodedIv));
  decipher.setAuthTag(decode(encodedAuthTag));
  return Buffer.concat([
    decipher.update(decode(encodedEncrypted)),
    decipher.final(),
  ]).toString("utf8");
}
