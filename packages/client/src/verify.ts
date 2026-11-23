import { createRemoteJWKSet, jwtVerify } from "jose";
import type { KyokaTokenClaims } from "./types.js";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(jwksUrl, jwks);
  }
  return jwks;
}

/**
 * Verify a Kyoka entitlement JWT against the remote JWKS endpoint.
 *
 * The JWKS is cached per URL — `createRemoteJWKSet` handles TTL and
 * re-fetching internally.
 */
export async function verifyToken(
  token: string,
  jwksUrl: string,
  issuer?: string,
): Promise<KyokaTokenClaims> {
  const jwks = getJwks(jwksUrl);

  const { payload } = await jwtVerify(token, jwks, {
    algorithms: ["ES256"],
    ...(issuer ? { issuer } : {}),
  });

  return {
    sub: String(payload.sub ?? ""),
    feature: String(payload.feature ?? ""),
    allowed: Boolean(payload.allowed),
    plan: String(payload.plan ?? ""),
    reason: String(payload.reason ?? ""),
    limit:
      payload.limit === undefined || payload.limit === null
        ? (payload.limit as null | undefined)
        : Number(payload.limit),
    iss: String(payload.iss ?? ""),
    iat: Number(payload.iat ?? 0),
    exp: Number(payload.exp ?? 0),
  };
}
