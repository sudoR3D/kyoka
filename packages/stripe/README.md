# `@kyoka/stripe`

Stripe webhook adapter plugin for Kyoka.

```ts
import { kyoka, pgAdapter } from "kyoka";
import { stripe } from "@kyoka/stripe";

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
      // graceDays: 3,
    }),
  ],
});

// Mount entitlements.handler — webhook at POST /api/kyoka/webhooks/stripe
```

See [PLUGINS.md](../../PLUGINS.md).
