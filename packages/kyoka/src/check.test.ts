import { describe, expect, test } from "bun:test";
import { memoryAdapter } from "./adapter/memory.js";
import { kyoka } from "./kyoka.js";
import { generateEs256KeyPair, setEntitlementCookie, verify } from "./token.js";

const freeProPlans = {
  free: {
    features: {
      "export.csv": { enabled: true },
      "export.png": { limit: 5 },
    },
  },
  pro: {
    features: {
      "export.csv": { enabled: true },
      "export.png": { limit: null },
      "branding.hide": { enabled: true },
    },
  },
};

async function createConfigInstance(withKeys = false) {
  const db = memoryAdapter();
  const keys = withKeys ? await generateEs256KeyPair() : null;
  const instance = kyoka({
    database: db,
    planStore: "config",
    plans: freeProPlans,
    defaultPlan: "free",
    ...(keys
      ? {
          issuer: "https://kyoka.test",
          privateKey: keys.privateKey,
          publicKey: keys.publicKey,
          kid: "test-1",
        }
      : {}),
  });
  return { db, instance, keys };
}

async function ensure(instance: ReturnType<typeof kyoka>, value: string) {
  return instance.api.subjects.ensure({
    aliases: [{ kind: "auth", value }],
  });
}

describe("api.check (config planStore)", () => {
  test("lazy-creates subject and allows free feature", async () => {
    const { instance } = await createConfigInstance();
    const result = await instance.api.check({
      subject: "user_ada",
      feature: "export.csv",
      lazyCreate: true,
    });

    expect(result.allowed).toBe(true);
    expect(result.plan).toBe("free");
    expect(result.status).toBe("free");
    expect(result.subject).toBe("user_ada");
    expect(result.subjectId.startsWith("sub_")).toBe(true);
    expect(result.reason).toBe("plan:free");
    expect(result.limit).toBeNull();
  });

  test("does not create an unknown subject without lazyCreate", async () => {
    const { instance } = await createConfigInstance();

    await expect(
      instance.api.check({ subject: "user_missing", feature: "export.csv" }),
    ).rejects.toThrow(/subject not found/);
    expect(await instance.api.subjects.get("user_missing")).toBeNull();
  });

  test("does not create from an unknown sub_ id", async () => {
    const { instance } = await createConfigInstance();

    await expect(
      instance.api.check({
        subject: "sub_missing",
        feature: "export.csv",
        lazyCreate: true,
      }),
    ).rejects.toThrow(/subject not found/);
    expect(await instance.api.subjects.get("sub_missing")).toBeNull();
  });

  test("lazyCreate creates once and then resolves read-only", async () => {
    const { instance } = await createConfigInstance();
    const first = await instance.api.check({
      subject: "user_lazy",
      feature: "export.csv",
      lazyCreate: true,
    });
    const second = await instance.api.check({
      subject: "user_lazy",
      feature: "export.csv",
    });
    expect(second.subjectId).toBe(first.subjectId);
  });

  test("denies unknown feature", async () => {
    const { instance } = await createConfigInstance();
    await ensure(instance, "user_ada");
    const result = await instance.api.check({
      subject: "user_ada",
      feature: "branding.hide",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("unknown_feature");
  });

  test("enforces limit with used", async () => {
    const { instance } = await createConfigInstance();
    await ensure(instance, "user_ada");
    const under = await instance.api.check({
      subject: "user_ada",
      feature: "export.png",
      used: 3,
    });
    expect(under.allowed).toBe(true);
    expect(under.limit).toBe(5);

    const over = await instance.api.check({
      subject: "user_ada",
      feature: "export.png",
      used: 5,
    });
    expect(over.allowed).toBe(false);
    expect(over.reason).toBe("limit_reached");
  });

  test("override wins over plan", async () => {
    const { db, instance } = await createConfigInstance();
    const first = await ensure(instance, "user_ada");

    db.seedOverride("", first.subjectId, "branding.hide", { enabled: true });
    const second = await instance.api.check({
      subject: "user_ada",
      feature: "branding.hide",
    });
    expect(second.allowed).toBe(true);
    expect(second.reason).toBe("override");
  });

  test("suspended still allows free-plan features only", async () => {
    const { db, instance } = await createConfigInstance();
    const created = await ensure(instance, "user_bob");
    db.setSubjectBilling("", created.subjectId, {
      status: "suspended",
      planSlug: "pro",
    });

    const freeFeature = await instance.api.check({
      subject: "user_bob",
      feature: "export.csv",
    });
    expect(freeFeature.allowed).toBe(true);
    expect(freeFeature.reason).toBe("plan:free");

    const proOnly = await instance.api.check({
      subject: "user_bob",
      feature: "branding.hide",
    });
    expect(proOnly.allowed).toBe(false);
    expect(proOnly.reason).toBe("unknown_feature");
  });

  test("resolves same subject via alias on second check", async () => {
    const { instance } = await createConfigInstance();
    await ensure(instance, "user_ada");
    const a = await instance.api.check({
      subject: "user_ada",
      feature: "export.csv",
    });
    const b = await instance.api.check({
      subject: "user_ada",
      feature: "export.csv",
    });
    expect(a.subjectId).toBe(b.subjectId);
  });
});

describe("planStore database", () => {
  test("errors when no plans in database", async () => {
    const db = memoryAdapter();
    const instance = kyoka({
      database: db,
      planStore: "database",
      defaultPlan: "free",
    });

    await expect(
      instance.api.check({
        subject: "user_ada",
        feature: "export.csv",
        lazyCreate: true,
      }),
    ).rejects.toThrow(/no plans/);
  });

  test("reads plans from database", async () => {
    const db = memoryAdapter();
    db.seedPlan("", "free", { "export.csv": { enabled: true } });
    const instance = kyoka({
      database: db,
      planStore: "database",
      defaultPlan: "free",
    });

    await ensure(instance, "user_ada");
    const result = await instance.api.check({
      subject: "user_ada",
      feature: "export.csv",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("plan:free");
  });
});

describe("HTTP handler", () => {
  test("POST /api/kyoka/v1/check returns JSON", async () => {
    const { instance } = await createConfigInstance();
    await ensure(instance, "user_ada");
    const res = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "user_ada",
          feature: "export.csv",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { allowed: boolean; plan: string };
    expect(body.allowed).toBe(true);
    expect(body.plan).toBe("free");
  });

  test("POST /subjects ensures and returns created", async () => {
    const { instance } = await createConfigInstance();
    const res = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/subjects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          aliases: [{ kind: "auth", value: "user_ada" }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subjectId: string; created: boolean };
    expect(body.created).toBe(true);
    expect(body.subjectId.startsWith("sub_")).toBe(true);

    const check = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: "user_ada", feature: "export.csv" }),
      }),
    );
    expect(check.status).toBe(200);
  });

  test("check without lazyCreate returns 404", async () => {
    const { instance } = await createConfigInstance();
    const res = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: "user_missing", feature: "export.csv" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "subject_not_found" });
  });

  test("check rejects non-boolean lazyCreate", async () => {
    const { instance } = await createConfigInstance();
    const res = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "user_missing",
          feature: "export.csv",
          lazyCreate: "yes",
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_lazy_create" });
  });

  test("POST deny path", async () => {
    const { instance } = await createConfigInstance();
    await ensure(instance, "user_ada");
    const res = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "user_ada",
          feature: "nope",
        }),
      }),
    );
    const body = (await res.json()) as { allowed: boolean; reason: string };
    expect(body.allowed).toBe(false);
    expect(body.reason).toBe("unknown_feature");
  });
});

describe("tokens + JWKS (O2)", () => {
  test("check mints JWT that verifies against JWKS", async () => {
    const { instance, keys } = await createConfigInstance(true);
    await ensure(instance, "user_ada");
    const result = await instance.api.check({
      subject: "user_ada",
      feature: "export.csv",
    });
    expect(result.token).toBeTruthy();
    expect(result.expiresAt).toBeTruthy();

    const jwksRes = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/jwks"),
    );
    expect(jwksRes.status).toBe(200);
    const jwks = (await jwksRes.json()) as {
      keys: Array<{ kid: string; alg: string }>;
    };
    expect(jwks.keys[0]?.kid).toBe("test-1");
    expect(jwks.keys[0]?.alg).toBe("ES256");

    const claims = await verify(result.token!, {
      jwks,
      issuer: "https://kyoka.test",
    });
    expect(claims.allowed).toBe(true);
    expect(claims.feature).toBe("export.csv");
    expect(claims.sub).toBe(result.subjectId);
    expect(claims.iss).toBe("https://kyoka.test");

    // also verify with public key PEM
    const viaPem = await verify(result.token!, {
      publicKey: keys!.publicKey,
      issuer: "https://kyoka.test",
    });
    expect(viaPem.allowed).toBe(true);
  });

  test("deny is also signed", async () => {
    const { instance } = await createConfigInstance(true);
    await ensure(instance, "user_ada");
    const result = await instance.api.check({
      subject: "user_ada",
      feature: "nope",
    });
    expect(result.allowed).toBe(false);
    expect(result.token).toBeTruthy();
    const jwks = await (
      await instance.handler(new Request("http://localhost/api/kyoka/.well-known/jwks.json"))
    ).json();
    const claims = await verify(result.token!, {
      jwks: jwks as never,
      issuer: "https://kyoka.test",
    });
    expect(claims.allowed).toBe(false);
  });

  test("setEntitlementCookie sets HttpOnly SameSite=Lax Secure", () => {
    const headers = new Headers();
    setEntitlementCookie(headers, "tok.en.here");
    const cookie = headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("kyoka_entitlement=tok.en.here");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });
});

describe("events + status machine (O2)", () => {
  test("event upgrades to pro/active and check allows branding", async () => {
    const { instance } = await createConfigInstance(true);

    const applied = await instance.api.applyBillingEvent({
      idempotencyKey: "evt_1",
      aliases: [
        { kind: "auth", value: "user_ada" },
        { kind: "stripe", value: "cus_ada" },
      ],
      plan: "pro",
      status: "active",
    });
    expect(applied.applied).toBe(true);
    expect(applied.duplicate).toBe(false);

    const check = await instance.api.check({
      subject: "user_ada",
      feature: "branding.hide",
    });
    expect(check.allowed).toBe(true);
    expect(check.plan).toBe("pro");
    expect(check.status).toBe("active");
    expect(check.token).toBeTruthy();

    // stripe alias resolves same subject
    const viaStripe = await instance.api.check({
      subject: "cus_ada",
      feature: "branding.hide",
    });
    expect(viaStripe.subjectId).toBe(check.subjectId);
  });

  test("duplicate event is no-op", async () => {
    const { instance } = await createConfigInstance();
    await instance.api.applyBillingEvent({
      idempotencyKey: "evt_dup",
      aliases: [{ kind: "auth", value: "user_ada" }],
      plan: "pro",
      status: "active",
    });
    const again = await instance.api.applyBillingEvent({
      idempotencyKey: "evt_dup",
      aliases: [{ kind: "auth", value: "user_ada" }],
      plan: "free",
      status: "free",
    });
    expect(again.duplicate).toBe(true);
    expect(again.applied).toBe(false);

    const check = await instance.api.check({
      subject: "user_ada",
      feature: "branding.hide",
    });
    expect(check.plan).toBe("pro");
    expect(check.status).toBe("active");
  });

  test("HTTP POST /v1/events then check", async () => {
    const { instance } = await createConfigInstance(true);
    const ev = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: "evt_http",
          aliases: [{ kind: "auth", value: "user_http" }],
          plan: "pro",
          status: "active",
        }),
      }),
    );
    expect(ev.status).toBe(200);
    const body = (await ev.json()) as { applied: boolean };
    expect(body.applied).toBe(true);

    const checkRes = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "user_http",
          feature: "branding.hide",
        }),
      }),
    );
    const check = (await checkRes.json()) as {
      allowed: boolean;
      token?: string;
    };
    expect(check.allowed).toBe(true);
    expect(check.token).toBeTruthy();
  });

  test("canceling past periodEndsAt denies", async () => {
    const { db, instance } = await createConfigInstance();
    const created = await ensure(instance, "user_c");
    db.setSubjectBilling("", created.subjectId, {
      planSlug: "pro",
      status: "canceling",
      periodEndsAt: new Date(Date.now() - 60_000),
    });

    const denied = await instance.api.check({
      subject: "user_c",
      feature: "branding.hide",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("period_ended");
  });

  test("canceling before periodEndsAt allows", async () => {
    const { db, instance } = await createConfigInstance();
    const created = await ensure(instance, "user_c2");
    db.setSubjectBilling("", created.subjectId, {
      planSlug: "pro",
      status: "canceling",
      periodEndsAt: new Date(Date.now() + 86_400_000),
    });

    const ok = await instance.api.check({
      subject: "user_c2",
      feature: "branding.hide",
    });
    expect(ok.allowed).toBe(true);
  });

  test("grace past graceEndsAt denies", async () => {
    const { db, instance } = await createConfigInstance();
    const created = await ensure(instance, "user_g");
    db.setSubjectBilling("", created.subjectId, {
      planSlug: "pro",
      status: "grace",
      graceEndsAt: new Date(Date.now() - 60_000),
    });

    const denied = await instance.api.check({
      subject: "user_g",
      feature: "branding.hide",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("grace_ended");
  });

  test("past_due denies", async () => {
    const { db, instance } = await createConfigInstance();
    const created = await ensure(instance, "user_pd");
    db.setSubjectBilling("", created.subjectId, {
      planSlug: "pro",
      status: "past_due",
    });

    const denied = await instance.api.check({
      subject: "user_pd",
      feature: "branding.hide",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("status:past_due");
  });
});
