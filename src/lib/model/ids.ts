const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Random, opaque, stable identifier. Never derived from names or positions. */
export function newId(prefix: "obj" | "loc"): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}
