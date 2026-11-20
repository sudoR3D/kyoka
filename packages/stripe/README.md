# `@kyoka-js/stripe`

Stripe webhook adapter plugin for Kyoka.

```ts
import { kyoka, pgAdapter } from "@kyoka-js/kyoka";
import { stripe } from "@kyoka-js/stripe";

const entitlements = kyoka({
  database: pgAdapter(process.env.DATABASE_URL!),
  planStore: "config",
  defaultPlan: "free",
  plans: { /* … */ },
  plugins: [
    stripe({
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      priceIdToPlan: { price_xxx: "pro" },
      // metadataSubjectKey: "saasUserId",
      // metadataSubjectIdKey: "kyokaSubjectId",
      // graceDays: 3,
    }),
  ],
});

// Mount entitlements.handler — webhook at POST /api/kyoka/webhooks/stripe
```

Subscription/Checkout metadata may include `kyokaSubjectId: "sub_…"` to target an existing subject directly; `aliases` are then optional. Without it, the adapter links aliases from `saasUserId`/customer. Checkout is linking-only and does not upgrade plans.

See [PLUGINS.md](../../PLUGINS.md).
