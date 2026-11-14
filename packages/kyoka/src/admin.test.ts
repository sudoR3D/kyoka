import { describe, expect, test } from "bun:test";
import { memoryAdapter } from "./adapter/memory.js";
import { kyoka } from "./kyoka.js";

describe("admin API", () => {
  test("database mode upserts plans and check uses them", async () => {
    const db = memoryAdapter();
    const instance = kyoka({
      database: db,
      planStore: "database",
      defaultPlan: "free",
    });

    await instance.api.plans.upsert({
      slug: "free",
      features: { "export.csv": { enabled: true } },
    });
    await instance.api.plans.upsert({
      slug: "pro",
      features: {
        "export.csv": { enabled: true },
        "branding.hide": { enabled: true },
      },
    });

    const list = await instance.api.plans.list();
    expect(list.map((p) => p.slug).sort()).toEqual(["free", "pro"]);

    const check = await instance.api.check({
      subject: "user_ada",
      feature: "export.csv",
    });
    expect(check.allowed).toBe(true);
  });

  test("config mode rejects plan mutations", async () => {
    const instance = kyoka({
      database: memoryAdapter(),
      planStore: "config",
      defaultPlan: "free",
      plans: { free: { features: { "export.csv": { enabled: true } } } },
    });

    await expect(
      instance.api.plans.upsert({
        slug: "pro",
        features: { x: { enabled: true } },
      }),
    ).rejects.toThrow(/planStore "database"/);
  });

  test("subjects.get, aliases, overrides via api", async () => {
    const instance = kyoka({
      database: memoryAdapter(),
      planStore: "config",
      defaultPlan: "free",
      plans: {
        free: {
          features: {
            "export.csv": { enabled: true },
            "branding.hide": { enabled: false },
          },
        },
      },
    });

    await instance.api.check({ subject: "user_ada", feature: "export.csv" });
    await instance.api.aliases.add({
      subject: "user_ada",
      kind: "app",
      value: "app_ada",
    });
    await instance.api.subjects.setOverride({
      subject: "user_ada",
      feature: "branding.hide",
      enabled: true,
    });

    const view = await instance.api.subjects.get("user_ada");
    expect(view).not.toBeNull();
    expect(view!.aliases.some((a) => a.kind === "app")).toBe(true);
    expect(view!.overrides.some((o) => o.feature === "branding.hide")).toBe(
      true,
    );

    const allowed = await instance.api.check({
      subject: "app_ada",
      feature: "branding.hide",
    });
    expect(allowed.allowed).toBe(true);

    await instance.api.subjects.clearOverride({
      subject: "user_ada",
      feature: "branding.hide",
    });
    const denied = await instance.api.check({
      subject: "user_ada",
      feature: "branding.hide",
    });
    expect(denied.allowed).toBe(false);
  });

  test("HTTP admin plan upsert", async () => {
    const instance = kyoka({
      database: memoryAdapter(),
      planStore: "database",
      defaultPlan: "free",
    });

    const res = await instance.handler(
      new Request("http://localhost/api/kyoka/v1/admin/plans/free", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          features: { "export.csv": { enabled: true } },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const plan = (await res.json()) as { slug: string };
    expect(plan.slug).toBe("free");
  });
});
