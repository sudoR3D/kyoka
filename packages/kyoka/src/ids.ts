import { randomBytes } from "node:crypto";

/** Crockford base32 alphabet (ULID-compatible). */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(now: number, len: number): string {
  let t = now;
  let out = "";
  for (let i = len; i > 0; i--) {
    const mod = t % 32;
    out = ENCODING[mod]! + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ENCODING[bytes[i]! % 32]!;
  }
  return out;
}

export function createId(prefix = ""): string {
  const ulid = encodeTime(Date.now(), 10) + encodeRandom(16);
  return prefix ? `${prefix}${ulid}` : ulid;
}

export function createSubjectId(): string {
  return createId("sub_");
}

export function normalizeTenantId(tenantId?: string | null): string {
  return tenantId ?? "";
}
