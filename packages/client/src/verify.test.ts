import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { kyoka, generateEs256KeyPair } from "@kyoka-js/kyoka";
import { memoryAdapter } from "@kyoka-js/kyoka/adapters/memory";
import { verifyToken } from "./verify.js";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let validToken: string;

beforeAll(async () => {
  const keys = await generateEs256KeyPair();
  const db = memoryAdapter();
  const instance = kyoka({
    database: db,
    planStore: "config",
    plans: {
      free: {
        features: { "f1": { enabled: true } },
      },
    },
    defaultPlan: "free",
    issuer: "https://kyoka-verify.test",
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    kid: "verify-1",
    basePath: "/api/kyoka",
  });

  server = Bun.serve({
    port: 0,
    fetch: (req) => instance.handler(req),
  });
  port = server.port;

  // Create a subject and get a token
  const checkRes = await instance.api.check({
    subject: "user_v",
    feature: "f1",
    lazyCreate: true,
  });
  validToken = checkRes.token!;
});

afterAll(() => {
  server?.stop(true);
});

describe("verifyToken", () => {
  test("verifies a valid token against JWKS endpoint", async () => {
    const jwksUrl = `http://localhost:${port}/api/kyoka/v1/jwks`;
    const claims = await verifyToken(
      validToken,
      jwksUrl,
      "https://kyoka-verify.test",
    );

    expect(claims.sub).toMatch(/^sub_/);
    expect(claims.feature).toBe("f1");
    expect(claims.allowed).toBe(true);
    expect(claims.plan).toBe("free");
    expect(claims.iss).toBe("https://kyoka-verify.test");
    expect(claims.iat).toBeGreaterThan(0);
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  test("rejects with wrong issuer", async () => {
    const jwksUrl = `http://localhost:${port}/api/kyoka/v1/jwks`;

    await expect(
      verifyToken(validToken, jwksUrl, "https://wrong-issuer.com"),
    ).rejects.toThrow();
  });

  test("rejects a garbage token", async () => {
    const jwksUrl = `http://localhost:${port}/api/kyoka/v1/jwks`;

    await expect(
      verifyToken("not.a.jwt", jwksUrl),
    ).rejects.toThrow();
  });

  test("JWKS cache reuses same instance for same URL", async () => {
    const jwksUrl = `http://localhost:${port}/api/kyoka/v1/jwks`;

    // Call twice — both should work (cache hit on second)
    const claims1 = await verifyToken(validToken, jwksUrl);
    const claims2 = await verifyToken(validToken, jwksUrl);

    expect(claims1.sub).toBe(claims2.sub);
    expect(claims1.feature).toBe(claims2.feature);
  });
});
