/** SHA-256 digest function, for example `crypto.subtle.digest` bound to SHA-256. */
export type DigestFn = (bytes: Uint8Array) => Promise<ArrayBuffer>;

/**
 * Default digest from Web Crypto. `crypto.subtle` exists only in secure
 * contexts (HTTPS or localhost); returns null when unavailable.
 */
export function defaultDigest(): DigestFn | null {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") return null;
  return (bytes) => subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
}

export function bytesToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Lowercase 64-character SHA-256 hex of `bytes`. */
export async function sha256Hex(
  bytes: Uint8Array,
  digest: DigestFn | null = defaultDigest(),
): Promise<string> {
  if (!digest) throw new Error("SHA-256 digest is unavailable");
  return bytesToHex(await digest(bytes));
}

export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
