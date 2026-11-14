import type { KyokaPlugin } from "@kyoka-js/kyoka";
import Stripe from "stripe";
import { mapStripeEvent, type StripePluginOptions } from "./map.js";

export type { StripePluginOptions } from "./map.js";
export { mapStripeEvent } from "./map.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Kyoka Stripe webhook plugin — registers POST /webhooks/stripe.
 */
export function stripe(options: StripePluginOptions): KyokaPlugin {
  if (!options.webhookSecret) {
    throw new Error("@kyoka-js/stripe: webhookSecret is required");
  }

  return {
    id: "stripe",
    routes: {
      "POST /webhooks/stripe": async (req, { instance }) => {
        const signature = req.headers.get("stripe-signature");
        if (!signature) {
          return json({ error: "missing_signature" }, 400);
        }

        const rawBody = await req.text();
        let event: Stripe.Event;
        try {
          // Async verify — Bun's SubtleCrypto cannot run Stripe's sync HMAC path
          event = await Stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            options.webhookSecret,
          );
        } catch {
          return json({ error: "invalid_signature" }, 400);
        }

        const mapped = mapStripeEvent(event, options);
        if (!mapped) {
          return json({ received: true, ignored: true, type: event.type });
        }

        const result = await instance.api.applyBillingEvent(mapped);
        return json({
          received: true,
          type: event.type,
          applied: result.applied,
          duplicate: result.duplicate,
          subjectId: result.subjectId,
        });
      },
    },
  };
}
