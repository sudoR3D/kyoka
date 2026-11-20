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

function makeInstance(tenantId = "") {
  return kyoka({
    database: memoryAdapter(),
    planStore: "config",
    defaultPlan: "free",
    plans,
    tenantId,
  });
}

describe("subjects.ensure", () => {
  test("creates a free subject and is idempotent", async () => {
    const instance = makeInstance();
    const first = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });
    expect(first.created).toBe(true);
    expect(first.subjectId.startsWith("sub_")).toBe(true);

    const again = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });
    expect(again.created).toBe(false);
    expect(again.subjectId).toBe(first.subjectId);

    const view = await instance.api.subjects.get("user_ada");
    expect(view?.subject.id).toBe(first.subjectId);
    expect(view?.subject.planSlug).toBe("free");
    expect(view?.subject.status).toBe("free");
  });

  test("links aliases without changing existing billing state", async () => {
    const instance = makeInstance();
    const created = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });

    await instance.api.applyBillingEvent({
      idempotencyKey: "evt_subject_1",
      subjectId: created.subjectId,
      plan: "pro",
      status: "active",
    });

    const again = await instance.api.subjects.ensure({
      aliases: [
        { kind: "auth", value: "user_ada" },
        { kind: "app", value: "app_ada" },
      ],
    });
    expect(again.created).toBe(false);
    expect(again.subjectId).toBe(created.subjectId);

    const view = await instance.api.subjects.get(created.subjectId);
    expect(view?.subject.planSlug).toBe("pro");
    expect(view?.subject.status).toBe("active");
    expect(view?.aliases.some((alias) => alias.kind === "app")).toBe(true);
  });

  test("rejects aliases that belong to different subjects", async () => {
    const instance = makeInstance();
    const a = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_a" }],
    });
    const b = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_b" }],
    });

    await expect(
      instance.api.subjects.ensure({
        aliases: [
          { kind: "auth", value: "user_a" },
          { kind: "auth", value: "user_b" },
        ],
      }),
    ).rejects.toBeInstanceOf(AliasConflictError);

    expect((await instance.api.subjects.get("user_a"))?.subject.id).toBe(
      a.subjectId,
    );
    expect((await instance.api.subjects.get("user_b"))?.subject.id).toBe(
      b.subjectId,
    );
  });

  test("namespaces aliases by tenant", async () => {
    const instance = makeInstance("ten_a");
    const a = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });

    const other = kyoka({
      database: (instance.options.database as ReturnType<typeof memoryAdapter>),
      planStore: "config",
      defaultPlan: "free",
      plans,
      tenantId: "ten_b",
    });
    const b = await other.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });

    expect(b.created).toBe(true);
    expect(b.subjectId).not.toBe(a.subjectId);
  });
});

describe("admin subject operations are strict", () => {
  test("does not create subjects for aliases or overrides", async () => {
    const instance = makeInstance();

    await expect(
      instance.api.aliases.add({
        subject: "missing",
        kind: "app",
        value: "app_missing",
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);

    await expect(
      instance.api.subjects.setOverride({
        subject: "missing",
        feature: "export.csv",
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);

    await expect(
      instance.api.subjects.clearOverride({
        subject: "missing",
        feature: "export.csv",
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);

    expect(await instance.api.subjects.get("missing")).toBeNull();
  });

  test("still adds aliases and overrides to existing subjects", async () => {
    const instance = makeInstance();
    const created = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });

    const alias = await instance.api.aliases.add({
      subject: created.subjectId,
      kind: "app",
      value: "app_ada",
    });
    expect(alias.subjectId).toBe(created.subjectId);

    const override = await instance.api.subjects.setOverride({
      subject: created.subjectId,
      feature: "branding.hide",
      enabled: true,
    });
    expect(override.subjectId).toBe(created.subjectId);
  });
});
