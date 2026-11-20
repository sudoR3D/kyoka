import { describe, expect, test } from "bun:test";
import { memoryAdapter } from "./adapter/memory.js";
import { AliasConflictError, SubjectNotFoundError } from "./errors.js";
import { kyoka } from "./kyoka.js";

const plans = {
  free: {
    features: {
      "export.csv": { enabled: true },
    },
  },
  pro: {
    features: {
      "export.csv": { enabled: true },
      "branding.hide": { enabled: true },
    },
  },
};

function makeInstance(db = memoryAdapter(), tenantId = "") {
  return kyoka({
    database: db,
    planStore: "config",
    defaultPlan: "free",
    plans,
    tenantId,
  });
}

describe("applyBillingEvent subject targeting", () => {
  test("creates from aliases and reports created", async () => {
    const instance = makeInstance();
    const result = await instance.api.applyBillingEvent({
      idempotencyKey: "evt_alias_create",
      aliases: [{ kind: "auth", value: "user_ada" }],
      plan: "pro",
      status: "active",
    });

    expect(result.applied).toBe(true);
    expect(result.created).toBe(true);
    expect(result.subjectId).not.toBeNull();

    const check = await instance.api.check({
      subject: "user_ada",
      feature: "branding.hide",
    });
    expect(check.allowed).toBe(true);
    expect(check.plan).toBe("pro");
    expect(check.status).toBe("active");
  });

  test("updates an existing subject by subjectId without aliases", async () => {
    const instance = makeInstance();
    const created = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });

    const result = await instance.api.applyBillingEvent({
      idempotencyKey: "evt_subject_update",
      subjectId: created.subjectId,
      plan: "pro",
      status: "active",
    });

    expect(result.created).toBe(false);
    expect(result.subjectId).toBe(created.subjectId);

    const check = await instance.api.check({
      subject: created.subjectId,
      feature: "branding.hide",
    });
    expect(check.allowed).toBe(true);
  });

  test("links aliases to a subjectId target", async () => {
    const instance = makeInstance();
    const created = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });

    await instance.api.applyBillingEvent({
      idempotencyKey: "evt_subject_link",
      subjectId: created.subjectId,
      aliases: [{ kind: "stripe", value: "cus_ada" }],
      status: "free",
    });

    const check = await instance.api.check({
      subject: "cus_ada",
      feature: "export.csv",
    });
    expect(check.subjectId).toBe(created.subjectId);
  });

  test("unknown subjectId never creates a subject", async () => {
    const instance = makeInstance();

    await expect(
      instance.api.applyBillingEvent({
        idempotencyKey: "evt_missing_subject",
        subjectId: "sub_missing",
        status: "free",
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  test("subjectId is tenant scoped", async () => {
    const db = memoryAdapter();
    const a = makeInstance(db, "ten_a");
    const b = makeInstance(db, "ten_b");
    const created = await a.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });

    await expect(
      b.api.applyBillingEvent({
        idempotencyKey: "evt_cross_tenant",
        subjectId: created.subjectId,
        status: "free",
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  test("alias conflict does not apply billing state", async () => {
    const instance = makeInstance();
    const a = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_a" }],
    });

    await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_b" }],
    });

    await expect(
      instance.api.applyBillingEvent({
        idempotencyKey: "evt_alias_conflict",
        aliases: [
          { kind: "auth", value: "user_a" },
          { kind: "auth", value: "user_b" },
        ],
        plan: "pro",
        status: "active",
      }),
    ).rejects.toBeInstanceOf(AliasConflictError);

    const view = await instance.api.subjects.get("user_a");
    expect(view?.subject.id).toBe(a.subjectId);
    expect(view?.subject.planSlug).toBe("free");
    expect(view?.subject.status).toBe("free");
  });

  test("partial alias link conflict leaves no new aliases", async () => {
    const instance = makeInstance();
    await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_a" }],
    });
    await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_b" }],
    });

    await expect(
      instance.api.applyBillingEvent({
        idempotencyKey: "evt_partial_link",
        subjectId: (await instance.api.subjects.get("user_a"))!.subject.id,
        aliases: [
          { kind: "app", value: "app_new" },
          { kind: "auth", value: "user_b" },
        ],
        plan: "pro",
        status: "active",
      }),
    ).rejects.toBeInstanceOf(AliasConflictError);

    expect(await instance.api.subjects.get("app_new")).toBeNull();
  });

  test("duplicate event returns duplicate and created false", async () => {
    const instance = makeInstance();
    const first = await instance.api.applyBillingEvent({
      idempotencyKey: "evt_dup_subject",
      aliases: [{ kind: "auth", value: "user_ada" }],
      plan: "pro",
      status: "active",
    });
    expect(first.created).toBe(true);

    const again = await instance.api.applyBillingEvent({
      idempotencyKey: "evt_dup_subject",
      aliases: [{ kind: "auth", value: "user_ada" }],
      plan: "free",
      status: "free",
    });
    expect(again.duplicate).toBe(true);
    expect(again.applied).toBe(false);
    expect(again.created).toBe(false);
  });
});
