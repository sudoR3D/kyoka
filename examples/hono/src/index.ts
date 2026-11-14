/**
 * Minimal Kyoka embed on Hono.
 *
 * Uses in-memory adapter for a zero-setup demo. Swap for pgAdapter + migrate
 * in real apps.
 */
import { Hono } from "hono";
import { generateEs256KeyPair, kyoka, mountKyoka } from "@kyoka-js/kyoka";
import { memoryAdapter } from "@kyoka-js/kyoka/adapters/memory";
import { stripe } from "@kyoka-js/stripe";

const keys = await generateEs256KeyPair();
const db = memoryAdapter();

// Seed free plan into memory via config planStore instead
const entitlements = kyoka({
  database: db,
  planStore: "config",
  defaultPlan: "free",
  issuer: "http://localhost:8787/api/kyoka",
  privateKey: keys.privateKey,
  publicKey: keys.publicKey,
  plans: {
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
  },
  plugins: process.env.STRIPE_WEBHOOK_SECRET
    ? [
        stripe({
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          priceIdToPlan: {
            [process.env.STRIPE_PRICE_PRO ?? "price_pro"]: "pro",
          },
        }),
      ]
    : [],
});

const app = new Hono();
mountKyoka(app, entitlements);

app.get("/", (c) =>
  c.text(
    "Kyoka Hono example. POST /api/kyoka/v1/check  |  POST /api/kyoka/v1/events  |  GET /api/kyoka/v1/jwks",
  ),
);

const port = Number(process.env.PORT ?? 8787);
console.log(`Kyoka example listening on http://localhost:${port}`);
export default {
  port,
  fetch: app.fetch,
};
