# Kyoka — product

Development product brief for the **public OSS embed library**. Hosted cloud is a separate private product; see the `kyoka-cloud` repo.

## One-liner

A TypeScript entitlements library that answers `can(subject, feature)` with plain JSON **and** a signed JWT, after money events from Stripe/Polar/generic webhooks — without being the merchant of record.

## Pronunciation / identity

- **Name:** Kyoka (Japanese: permission / approval)
- **Say:** KYOH-kah
- **API keys (hosted):** `kyo_live_…` / `kyo_test_…`
- **Packages:** `kyoka`, `@kyoka/stripe` (Polar later)

## This is

- Entitlements / licensing **decision** layer (plans, feature keys, seats/caps, trials, grace)
- Payment-agnostic: webhook/event in → `can()` out
- Better Auth–style: install in the app, mount `/api/kyoka/*`, use the app’s DB
- Signed, cacheable answers (JWT + JWKS)
- Open source core for embedders

## This is not

- Merchant of record (Stripe / Polar / Lemon take money)
- Feature flags / percentage rollouts (LaunchDarkly)
- Full machine licensing (Keygen’s surface)
- A required separate Docker box for the happy path (optional thin host later)
- EzyForm / any single customer’s billing UI

## Embed vs hosted

| | Embed (this repo) | Hosted (`kyoka-cloud`, private) |
|---|---|---|
| Ship form | npm library + plugins | Multi-tenant API + console |
| Default `planStore` | `config` or `database` (integrator choice) | `database` |
| Value | Permission brain in *their* app | Control plane, shared `baseURL`, webhook ingress, team UI |
| Moat for strangers | Docs/SDK later; code + contracts here | Ops humans need without SSH |

Hosted **depends on** published packages from this repo. It does not fork the decision engine.

## MVP done (OSS library)

A maintainer (and later a stranger) can:

1. Define free/pro plans (code `config` **or** DB via admin API — no auto-seed)
2. Mount Kyoka; run migrations
3. Point Stripe webhook at the Stripe plugin route **or** POST generic events
4. `check` → JSON + JWT; verify via JWKS
5. See cancel / fail / grace flip `can()` via the state machine — not scattered `plan === "pro"`

## Explicitly out of MVP

- Polar plugin (soon after Stripe)
- Hosted console / multi-tenant cloud
- Usage counters inside Kyoka (SaaS tracks `used`)
- Auto-seed plans from code into DB
- Integrator-facing polished README / website docs (separate track)
- Taking payment ourselves

## Related docs

- [DECISIONS.md](./DECISIONS.md) — locked choices
- [ARCHITECTURE.md](./ARCHITECTURE.md) — how it fits together
- [PLAN.md](./PLAN.md) — build phases
- History: [docs/history/LICENSE-ENTITLEMENTS-API.md](./docs/history/LICENSE-ENTITLEMENTS-API.md)
