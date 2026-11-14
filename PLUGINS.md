# Kyoka — plugins

## Principle

Core speaks **normalized billing events** only. Provider dialects live in plugins.

Generic JSON events are **core** (not a plugin).

## Plugin interface (intent)

A server plugin may:

- Register HTTP routes on the Kyoka mount (e.g. `POST /webhooks/stripe`)
- Accept options (`webhookSecret`, `priceIdToPlan`, metadata key names)
- Call core `applyBillingEvent(normalized)` after verify + map
- Optionally contribute types/docs — not private DB tables in MVP

Client plugins: not required for MVP entitlements (unlike Better Auth’s dual client plugins).

## Registration (embed)

```ts
import { kyoka } from "@kyoka-js/kyoka";
import { stripe } from "@kyoka-js/stripe";

export const entitlements = kyoka({
  planStore: "config",
  plans: { /* … */ },
  plugins: [
    stripe({
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      // priceIdToPlan: { price_xxx: "pro" },
      // metadataSubjectKey: "saasUserId",
    }),
  ],
});
```

## `@kyoka-js/stripe` (MVP) — must implement

| Responsibility | Detail |
|---|---|
| Route | `POST /webhooks/stripe` |
| Verify | Stripe signature + secret; reject bad |
| Allowlist | Subscription lifecycle + payment failed (+ checkout completed if needed) |
| Map | → aliases, plan slug, status, period/grace, idempotency = `event.id` |
| Metadata | Read saas user id from Checkout/subscription metadata; upsert `stripe:cus_…` |
| Idempotency | Via core processed-event table |

**Out of scope for plugin:** Checkout Session UI, Customer Portal, tax, MoR.

## Polar (later)

Same contract: verify Polar signatures, map events → `applyBillingEvent`. Hosted console dropdown enables it the same way embed adds `polar()` to `plugins`.

## Normalized event (core input)

```ts
type BillingEvent = {
  idempotencyKey: string;
  source: "stripe" | "polar" | "generic";
  aliases: { kind: string; value: string }[];
  plan?: string;
  status: string; // state machine status
  periodEndsAt?: string | null;
  graceEndsAt?: string | null;
  trialEndsAt?: string | null;
};
```

## Hosted

Same plugin packages run inside the private Hono host. Console stores webhook secrets per tenant and shows the webhook URL — no second mapper implementation.
