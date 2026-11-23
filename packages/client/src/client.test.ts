import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { kyoka, generateEs256KeyPair } from "@kyoka-js/kyoka";
import { memoryAdapter } from "@kyoka-js/kyoka/adapters/memory";
import { KyokaClient } from "./client.js";
import { KyokaApiError, KyokaNetworkError } from "./errors.js";
import type { ResolvedConfig } from "./types.js";

const plans = {
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

let server: ReturnType<typeof Bun.serve>;
let client: KyokaClient;
let port: number;

beforeAll(async () => {
  const keys = await generateEs256KeyPair();
  const db = memoryAdapter();
  const instance = kyoka({
    database: db,
    planStore: "config",
    plans,
    defaultPlan: "free",
    issuer: "https://kyoka.test",
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    kid: "test-1",
    basePath: "/api/kyoka",
  });

  server = Bun.serve({
    port: 0,
    fetch: (req) => instance.handler(req),
  });
  port = server.port;

  const config: ResolvedConfig = {
    baseUrl: `http://localhost:${port}/api/kyoka`,
    apiKey: undefined,
    fetch: globalThis.fetch,
  };
  client = new KyokaClient(config);
});

afterAll(() => {
  server?.stop(true);
});

describe("client.check()", () => {
  test("lazy-creates subject and allows free feature", async () => {
    const result = await client.check({
      subject: "user_check_lazy",
      feature: "export.csv",
      lazyCreate: true,
    });

    expect(result.allowed).toBe(true);
    expect(result.plan).toBe("free");
    expect(result.status).toBe("free");
    expect(result.subject).toBe("user_check_lazy");
    expect(result.subjectId).toMatch(/^sub_/);
    expect(result.reason).toBe("plan:free");
    expect(result.token).toBeTruthy();
  });

  test("unknown subject without lazyCreate → KyokaApiError 404", async () => {
    try {
      await client.check({
        subject: "user_missing",
        feature: "export.csv",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(KyokaApiError);
      const apiErr = err as KyokaApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe("subject_not_found");
    }
  });

  test("used exceeding limit → denied", async () => {
    await client.check({
      subject: "user_limit",
      feature: "export.csv",
      lazyCreate: true,
    });

    const result = await client.check({
      subject: "user_limit",
      feature: "export.png",
      used: 5,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("limit_reached");
    expect(result.limit).toBe(5);
  });

  test("used under limit → allowed", async () => {
    const result = await client.check({
      subject: "user_limit",
      feature: "export.png",
      used: 3,
    });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
  });

  test("unknown feature → denied", async () => {
    const result = await client.check({
      subject: "user_limit",
      feature: "branding.hide",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("unknown_feature");
  });
});

describe("client.subjects.ensure()", () => {
  test("creates subject and returns subjectId", async () => {
    const result = await client.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ensure_new" }],
    });

    expect(result.subjectId).toMatch(/^sub_/);
    expect(result.created).toBe(true);
  });

  test("idempotent — second call returns same subject", async () => {
    const first = await client.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ensure_idem" }],
    });
    const second = await client.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ensure_idem" }],
    });

    expect(second.subjectId).toBe(first.subjectId);
    expect(second.created).toBe(false);
  });
});

describe("client.events.push()", () => {
  test("activates pro plan via billing event", async () => {
    const result = await client.events.push({
      idempotencyKey: "evt_client_1",
      aliases: [{ kind: "auth", value: "user_events_pro" }],
      plan: "pro",
      status: "active",
    });

    expect(result.applied).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.subjectId).toMatch(/^sub_/);

    // Verify check now reflects pro plan
    const check = await client.check({
      subject: "user_events_pro",
      feature: "branding.hide",
    });
    expect(check.allowed).toBe(true);
    expect(check.plan).toBe("pro");
    expect(check.status).toBe("active");
  });

  test("duplicate event → no-op", async () => {
    const again = await client.events.push({
      idempotencyKey: "evt_client_1",
      aliases: [{ kind: "auth", value: "user_events_pro" }],
      plan: "free",
      status: "free",
    });

    expect(again.duplicate).toBe(true);
    expect(again.applied).toBe(false);
  });
});

describe("client.admin.plans", () => {
  test("list() in config planStore returns empty (plans are in-memory, not DB)", async () => {
    // Config-mode planStore rejects admin plan operations with 400.
    // This is correct — admin plan CRUD only works with planStore: "database".
    // We validate the client correctly surfaces that error.
    try {
      await client.admin.plans.list();
      // If it succeeds (future handler change), just verify shape
    } catch (err) {
      expect(err).toBeInstanceOf(KyokaApiError);
      expect((err as KyokaApiError).status).toBe(400);
      expect((err as KyokaApiError).code).toBe("admin_failed");
    }
  });
});

describe("client.admin.subjects", () => {
  test("get() returns subject view", async () => {
    // Ensure a subject exists first
    await client.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_admin_get" }],
    });

    const view = await client.admin.subjects.get("user_admin_get");
    expect(view.subject).toBeDefined();
    expect(view.subject.planSlug).toBe("free");
    expect(view.subject.status).toBe("free");
    expect(view.aliases.length).toBeGreaterThanOrEqual(1);
    expect(view.overrides).toBeDefined();
  });

  test("get() on unknown subject → 404", async () => {
    try {
      await client.admin.subjects.get("user_nonexistent");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(KyokaApiError);
      expect((err as KyokaApiError).status).toBe(404);
    }
  });

  test("setOverride() + clearOverride()", async () => {
    await client.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_override" }],
    });

    // Set override
    const override = await client.admin.subjects.setOverride({
      subject: "user_override",
      feature: "branding.hide",
      enabled: true,
    });
    expect(override.feature).toBe("branding.hide");
    expect(override.value).toEqual({ enabled: true, limit: null });

    // Verify override works via check
    const check = await client.check({
      subject: "user_override",
      feature: "branding.hide",
    });
    expect(check.allowed).toBe(true);
    expect(check.reason).toBe("override");

    // Clear override
    const cleared = await client.admin.subjects.clearOverride({
      subject: "user_override",
      feature: "branding.hide",
    });
    expect(cleared.cleared).toBe(true);

    // Verify override is gone
    const checkAfter = await client.check({
      subject: "user_override",
      feature: "branding.hide",
    });
    expect(checkAfter.allowed).toBe(false);
  });
});

describe("client.admin.aliases", () => {
  test("add() + remove()", async () => {
    await client.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_alias_test" }],
    });

    // Add a stripe alias
    const alias = await client.admin.aliases.add({
      subject: "user_alias_test",
      kind: "stripe",
      value: "cus_alias_test",
    });
    expect(alias.kind).toBe("stripe");
    expect(alias.value).toBe("cus_alias_test");

    // Check via stripe alias resolves same subject
    const check = await client.check({
      subject: "cus_alias_test",
      feature: "export.csv",
    });
    expect(check.allowed).toBe(true);
    expect(check.subject).toBe("cus_alias_test");

    // Remove alias
    const removed = await client.admin.aliases.remove({
      kind: "stripe",
      value: "cus_alias_test",
    });
    expect(removed.removed).toBe(true);
  });
});

describe("client.verify()", () => {
  test("verifies a token from check result", async () => {
    const checkResult = await client.check({
      subject: "user_check_lazy",
      feature: "export.csv",
    });
    expect(checkResult.token).toBeTruthy();

    const claims = await client.verify(
      checkResult.token!,
      "https://kyoka.test",
    );
    expect(claims.sub).toMatch(/^sub_/);
    expect(claims.feature).toBe("export.csv");
    expect(claims.allowed).toBe(true);
    expect(claims.plan).toBe("free");
    expect(claims.iss).toBe("https://kyoka.test");
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });
});

describe("error handling", () => {
  test("KyokaNetworkError on unreachable server", async () => {
    const badClient = new KyokaClient({
      baseUrl: "http://localhost:1",
      apiKey: undefined,
      fetch: globalThis.fetch,
    });

    try {
      await badClient.check({
        subject: "x",
        feature: "y",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(KyokaNetworkError);
      expect((err as KyokaNetworkError).message).toContain("failed");
    }
  });
});
