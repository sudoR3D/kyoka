import * as jose from "jose";
import type { CheckResult, KyokaOptions } from "./types.js";

export const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;

export type KyokaTokenClaims = {
  sub: string;
  feature: string;
  allowed: boolean;
  plan: string;
  reason: string;
  limit?: number | null;
  iss: string;
  iat: number;
  exp: number;
};

export type TokenContext = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  issuer: string;
  kid: string;
  ttlSeconds: number;
};

export async function loadTokenContext(
  options: KyokaOptions,
): Promise<TokenContext | null> {
  if (!options.privateKey || !options.issuer) return null;

  const privateKey = await jose.importPKCS8(options.privateKey, "ES256");

  let publicKey: CryptoKey;
  if (options.publicKey) {
    publicKey = await jose.importSPKI(options.publicKey, "ES256");
  } else {
    const jwk = await jose.exportJWK(privateKey);
    const { d: _d, ...pubJwk } = jwk;
    publicKey = (await jose.importJWK(pubJwk, "ES256")) as CryptoKey;
  }

  return {
    privateKey,
    publicKey,
    issuer: options.issuer,
    kid: options.kid ?? "kyoka-1",
    ttlSeconds: options.tokenTtlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS,
  };
}

export async function mintToken(
  ctx: TokenContext,
  result: Pick<
    CheckResult,
    "subjectId" | "feature" | "allowed" | "plan" | "reason" | "limit"
  >,
): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ctx.ttlSeconds;

  const token = await new jose.SignJWT({
    feature: result.feature,
    allowed: result.allowed,
    plan: result.plan,
    reason: result.reason,
    ...(result.limit !== undefined ? { limit: result.limit } : {}),
  })
    .setProtectedHeader({ alg: "ES256", kid: ctx.kid, typ: "JWT" })
    .setSubject(result.subjectId)
    .setIssuer(ctx.issuer)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(ctx.privateKey);

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function buildJwks(ctx: TokenContext): Promise<jose.JSONWebKeySet> {
  const jwk = await jose.exportJWK(ctx.publicKey);
  return {
    keys: [
      {
        ...jwk,
        kid: ctx.kid,
        use: "sig",
        alg: "ES256",
      },
    ],
  };
}

export type VerifyOptions = {
  issuer?: string;
  jwks?: jose.JSONWebKeySet;
  jwksUrl?: string;
  publicKey?: string;
};

export async function verify(
  token: string,
  options: VerifyOptions,
): Promise<KyokaTokenClaims> {
  let keyOrSet: CryptoKey | jose.JWTVerifyGetKey;

  if (options.jwks) {
    const local = jose.createLocalJWKSet(options.jwks);
    keyOrSet = local;
  } else if (options.jwksUrl) {
    keyOrSet = jose.createRemoteJWKSet(new URL(options.jwksUrl));
  } else if (options.publicKey) {
    keyOrSet = await jose.importSPKI(options.publicKey, "ES256");
  } else {
    throw new Error("Kyoka verify: provide jwks, jwksUrl, or publicKey");
  }

  const { payload } = await jose.jwtVerify(token, keyOrSet, {
    algorithms: ["ES256"],
    issuer: options.issuer,
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

export type EntitlementCookieOptions = {
  name?: string;
  maxAge?: number;
  secure?: boolean;
  path?: string;
  domain?: string;
};

/**
 * Attach HttpOnly entitlement cookie to a Response (or Headers).
 */
export function setEntitlementCookie(
  target: Response | Headers,
  token: string,
  options: EntitlementCookieOptions = {},
): void {
  const name = options.name ?? "kyoka_entitlement";
  const maxAge = options.maxAge ?? DEFAULT_TOKEN_TTL_SECONDS;
  const secure = options.secure ?? true;
  const path = options.path ?? "/";

  const parts = [
    `${name}=${token}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  if (options.domain) parts.push(`Domain=${options.domain}`);

  const headers = target instanceof Response ? target.headers : target;
  headers.append("Set-Cookie", parts.join("; "));
}

/** Generate a PKCS8 + SPKI ES256 pair for tests / local bootstrapping. */
export async function generateEs256KeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  const { privateKey, publicKey } = await jose.generateKeyPair("ES256", {
    extractable: true,
  });
  return {
    privateKey: await jose.exportPKCS8(privateKey),
    publicKey: await jose.exportSPKI(publicKey),
  };
}
