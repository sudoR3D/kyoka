import type { BillingEventInput, SubjectStatus } from "@kyoka-js/kyoka";
import type Stripe from "stripe";

export type StripePluginOptions = {
  webhookSecret: string;
  priceIdToPlan?: Record<string, string>;
  /** Metadata key for saas user id. Default: saasUserId */
  metadataSubjectKey?: string;
  /** Days of grace after payment_failed. Default: 3 */
  graceDays?: number;
};

function metaValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string | undefined {
  const v = metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function planFromPrice(
  priceId: string | undefined,
  map: Record<string, string> | undefined,
): string | undefined {
  if (!priceId || !map) return undefined;
  return map[priceId];
}

function subscriptionPriceId(
  sub: Stripe.Subscription,
): string | undefined {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  if (!price) return undefined;
  return typeof price === "string" ? price : price.id;
}

function customerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | undefined {
  if (!customer) return undefined;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return customer.id;
  return customer.id;
}

function buildAliases(
  opts: StripePluginOptions,
  parts: {
    customer?: string;
    metadata?: Stripe.Metadata | null;
  },
): BillingEventInput["aliases"] {
  const key = opts.metadataSubjectKey ?? "saasUserId";
  const aliases: BillingEventInput["aliases"] = [];
  const saas = metaValue(parts.metadata, key);
  if (saas) {
    aliases.push({ kind: "auth", value: saas });
  }
  if (parts.customer) {
    aliases.push({ kind: "stripe", value: parts.customer });
  }
  return aliases;
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  return new Date(seconds * 1000).toISOString();
}

/** Stripe typings vary by API version — read period end defensively. */
function subscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const raw = sub as Stripe.Subscription & {
    current_period_end?: number;
  };
  return typeof raw.current_period_end === "number"
    ? raw.current_period_end
    : null;
}

function mapSubscriptionStatus(
  sub: Stripe.Subscription,
): { status: SubjectStatus; periodEndsAt?: string | null } {
  if (sub.cancel_at_period_end && sub.status === "active") {
    return {
      status: "canceling",
      periodEndsAt: unixToIso(subscriptionPeriodEnd(sub)),
    };
  }

  switch (sub.status) {
    case "trialing":
      return {
        status: "trial",
        periodEndsAt: unixToIso(sub.trial_end),
      };
    case "active":
      return { status: "active", periodEndsAt: null };
    case "past_due":
    case "unpaid":
      return { status: "past_due" };
    case "canceled":
    case "incomplete_expired":
      return { status: "free", periodEndsAt: null };
    default:
      return { status: "active" };
  }
}

export function mapStripeEvent(
  event: Stripe.Event,
  opts: StripePluginOptions,
): BillingEventInput | null {
  const graceDays = opts.graceDays ?? 3;

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const cus = customerId(sub.customer);
      const aliases = buildAliases(opts, {
        customer: cus,
        metadata: sub.metadata,
      });
      if (!aliases.length) return null;
      const mapped = mapSubscriptionStatus(sub);
      const plan = planFromPrice(subscriptionPriceId(sub), opts.priceIdToPlan);
      return {
        idempotencyKey: event.id,
        source: "stripe",
        aliases,
        plan: mapped.status === "free" ? "free" : plan,
        status: mapped.status,
        periodEndsAt: mapped.periodEndsAt,
        trialEndsAt: unixToIso(sub.trial_end),
      };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const cus = customerId(sub.customer);
      const aliases = buildAliases(opts, {
        customer: cus,
        metadata: sub.metadata,
      });
      if (!aliases.length) return null;
      return {
        idempotencyKey: event.id,
        source: "stripe",
        aliases,
        plan: "free",
        status: "free",
        periodEndsAt: null,
        graceEndsAt: null,
      };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const cus = customerId(invoice.customer);
      const aliases = buildAliases(opts, {
        customer: cus,
        metadata: invoice.metadata,
      });
      if (!aliases.length) return null;
      const graceEndsAt = new Date(
        Date.now() + graceDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      return {
        idempotencyKey: event.id,
        source: "stripe",
        aliases,
        status: "grace",
        graceEndsAt,
      };
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const cus = customerId(session.customer);
      const aliases = buildAliases(opts, {
        customer: cus ?? undefined,
        metadata: session.metadata,
      });
      if (!aliases.length) return null;
      // Linking-only: keep free/default unless subscription mode implies paid later via subscription events
      return {
        idempotencyKey: event.id,
        source: "stripe",
        aliases,
        status: "free",
      };
    }

    default:
      return null;
  }
}
