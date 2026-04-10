import { createHash, randomBytes } from "crypto";

const PREFIX = "rs_k_";

/** Generate a new API key. Returns both the raw key (shown once) and its SHA-256 hash. */
export function generateApiKey() {
  const raw = randomBytes(32).toString("base64url");
  const fullKey = `${PREFIX}${raw}`;
  const keyHash = hashApiKey(fullKey);
  const prefix = fullKey.slice(0, PREFIX.length + 8);

  return { fullKey, keyHash, prefix };
}

/** SHA-256 hash of a raw API key string. */
export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}
