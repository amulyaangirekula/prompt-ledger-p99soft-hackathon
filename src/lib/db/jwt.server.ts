/**
 * JWT subject extraction — mirrors jwt_sub.py.
 * Opaque decode only; token is already trusted (issued by Supabase).
 *
 * Single Responsibility: extract user UUID from a JWT string.
 */

export function jwtSubject(accessToken: string): string {
  return jwtPayload(accessToken).sub as string;
}

/** Decode and return the full JWT payload (no verification — token is trusted from Supabase). */
export function jwtPayload(accessToken: string): Record<string, unknown> {
  const parts = accessToken.trim().split(".");
  if (parts.length !== 3) throw new Error("Not a JWT (expected three segments).");

  const body = parts[1];
  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
  const decoded = Buffer.from(padded, "base64").toString("utf-8");
  const payload = JSON.parse(decoded) as Record<string, unknown>;

  if (!payload.sub || typeof payload.sub !== "string") throw new Error("JWT missing sub claim.");
  return payload;
}
