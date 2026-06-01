import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with Argon2id (the default variant of `@node-rs/argon2`),
 * a memory-hard KDF resistant to GPU/ASIC cracking. Prebuilt native binaries
 * (incl. linux-musl) mean no compiler is needed in the Alpine runtime image.
 */

// OWASP-aligned cost parameters (≈19 MiB, 2 passes).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, OPTIONS);
  } catch {
    // A malformed/garbage hash must read as "no match", never throw.
    return false;
  }
}
