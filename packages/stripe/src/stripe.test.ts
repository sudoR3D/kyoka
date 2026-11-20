import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { kyoka } from "@kyoka-js/kyoka";
import { memoryAdapter } from "../../kyoka/src/adapter/memory.js";
import type Stripe from "stripe";
import { stripe } from "./index.js";
import { mapStripeEvent } from "./map.js";

const SECRET = "whsec_test_kyoka_secret";

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

/** Stripe webhook test header via Node crypto (Bun SubtleCrypto is async-only). */
function signedRequest(payload: object, secret = SECRET): Request {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${body}`;
  // Stripe Node SDK HMAC's the secret string as-is (including whsec_ prefix)
  const signature = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  const header = `t=${timestamp},v1=${signature}`;
  return new Request("http://localhost/api/kyoka/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": header,
    },
    body,
  });
}

describe("mapStripeEvent", () => {
  test("maps subscription.created to active/pro", () => {
    const event = {
      id: "evt_sub_1",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          object: "subscription",
          status: "active",
          cancel_at_period_end: false,
          customer: "cus_ada",
          metadata: { saasUserId: "user_ada" },
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    } as unknown as Stripe.Event;

    const mapped = mapStripeEvent(event, {
      webhookSecret: SECRET,
      priceIdToPlan: { price_pro: "pro" },
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.status).toBe("active");
    expect(mapped!.plan).toBe("pro");
    expect(mapped!.source).toBe("stripe");
    expect(mapped!.aliases).toEqual([
      { kind: "auth", value: "user_ada" },
      { kind: "stripe", value: "cus_ada" },
    ]);
  });

  test("maps metadata subject id", () => {
    const event = {
      id: "evt_subject_1",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          object: "subscription",
          status: "active",
          cancel_at_period_end: false,
          customer: null,
          metadata: { kyokaSubjectId: "sub_existing" },
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    } as unknown as Stripe.Event;

    const mapped = mapStripeEvent(event, {
      webhookSecret: SECRET,
      priceIdToPlan: { price_pro: "pro" },
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.subjectId).toBe("sub_existing");
    expect(mapped!.aliases).toEqual([]);
  });

  test("payment_failed maps to grace", () => {
    const event = {
      id: "evt_fail_1",
      type: "invoice.payment_failed",
      data: {
        object: {
          object: "invoice",
          customer: "cus_ada",
          metadata: { saasUserId: "user_ada" },
        },
      },
    } as unknown as Stripe.Event;

    const mapped = mapStripeEvent(event, {
      webhookSecret: SECRET,
      graceDays: 3,
    });
    expect(mapped!.status).toBe("grace");
    expect(mapped!.graceEndsAt).toBeTruthy();
  });
});

describe("@kyoka-js/stripe webhook", () => {
  test("signed subscription event flips check", async () => {
    const db = memoryAdapter();
    const plugin = stripe({
      webhookSecret: SECRET,
      priceIdToPlan: { price_pro: "pro" },
    });
    const instance = kyoka({
      database: db,
      planStore: "config",
      defaultPlan: "free",
      plans,
      plugins: [plugin],
    });

    const payload = {
      id: "evt_live_1",
      object: "event",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          object: "subscription",
          status: "active",
          cancel_at_period_end: false,
          customer: "cus_ada",
          metadata: { saasUserId: "user_ada" },
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    };

    const res = await instance.handler(signedRequest(payload));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { applied: boolean };
    expect(body.applied).toBe(true);

    const check = await instance.api.check({
      subject: "user_ada",
      feature: "branding.hide",
    });
    expect(check.allowed).toBe(true);
    expect(check.plan).toBe("pro");
    expect(check.status).toBe("active");
  });

  test("metadata subject id targets an existing subject", async () => {
    const db = memoryAdapter();
    const instance = kyoka({
      database: db,
      planStore: "config",
      defaultPlan: "free",
      plans,
      plugins: [
        stripe({
          webhookSecret: SECRET,
          priceIdToPlan: { price_pro: "pro" },
        }),
      ],
    });
    const created = await instance.api.subjects.ensure({
      aliases: [{ kind: "auth", value: "user_ada" }],
    });

    const payload = {
      id: "evt_live_subject_id",
      object: "event",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          object: "subscription",
          status: "active",
          cancel_at_period_end: false,
          customer: "cus_ada",
          metadata: { kyokaSubjectId: created.subjectId },
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    };

    const res = await instance.handler(signedRequest(payload));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { created: boolean; subjectId: string };
    expect(body.created).toBe(false);
    expect(body.subjectId).toBe(created.subjectId);

    const check = await instance.api.check({
      subject: created.subjectId,
      feature: "branding.hide",
    });
    expect(check.allowed).toBe(true);
    expect(check.plan).toBe("pro");
  });

  test("bad signature rejected", async () => {
    const plugin = stripe({ webhookSecret: SECRET });
    const instance = kyoka({
      database: memoryAdapter(),
      planStore: "config",
      defaultPlan: "free",
      plans,
      plugins: [plugin],
    });

    const res = await instance.handler(
      new Request("http://localhost/api/kyoka/webhooks/stripe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "t=1,v1=bad",
        },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("duplicate event is no-op", async () => {
    const plugin = stripe({
      webhookSecret: SECRET,
      priceIdToPlan: { price_pro: "pro" },
    });
    const instance = kyoka({
      database: memoryAdapter(),
      planStore: "config",
      defaultPlan: "free",
      plans,
      plugins: [plugin],
    });

    const payload = {
      id: "evt_dup_stripe",
      object: "event",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          object: "subscription",
          status: "active",
          cancel_at_period_end: false,
          customer: "cus_ada",
          metadata: { saasUserId: "user_ada" },
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    };

    const first = await instance.handler(signedRequest(payload));
    expect(((await first.json()) as { applied: boolean }).applied).toBe(true);

    const second = await instance.handler(signedRequest(payload));
    const body = (await second.json()) as {
      applied: boolean;
      duplicate: boolean;
    };
    expect(body.duplicate).toBe(true);
    expect(body.applied).toBe(false);
  });
});
