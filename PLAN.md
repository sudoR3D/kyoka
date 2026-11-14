# Kyoka — OSS build plan

Phased work for the **public** library. Hosted phases live in `kyoka-cloud` (`PLAN_HOSTED.md`). Dual-MVP overview: parent [MVP.md](../MVP.md).

Integrator-facing docs (stranger README) are a **later track**, after the library works.

## Sprint map (OSS v1)

Three sprints cover Phases 1–7. Cloud sprints start only after O3 (publishable).

| Sprint | Phases | Exit check |
|---|---|---|
| **O1** | 1–2 | Config-mode example: define plans, mount, `check` returns allow/deny |
| **O2** | 3–4 | Stripe-less path: POST event → status flips → JWT verify via JWKS |
| **O3** | 5–7 | Publishable `kyoka` + `@kyoka/stripe`; database-mode admin upserts plans |

**OSS v1 done** when a maintainer (and later a stranger) can: define free/pro plans (config or DB admin), mount + migrate, Stripe webhook or generic events, `check` → JSON + JWT via JWKS, cancel/fail/grace flip `can()` via the state machine. Schema includes nullable `tenant_id` so Cloud can require it later.

## Phase 0 — Docs + skeleton (this pass)

- [x] Product / decisions / domain / schema / architecture / API / plugins docs
- [x] Repo layout placeholders (`packages/`, `examples/`)
- [x] Dual-MVP sprint shape ([../MVP.md](../MVP.md))
- [x] O1 locks: MIT, Bun workspaces, `pg` adapter first (see [DECISIONS.md](./DECISIONS.md))
- [x] `LICENSE` (MIT) + package manifests

## Phase 1 — Core skeleton (O1)

- [x] Bun workspace + `packages/kyoka` package manifests; MIT `LICENSE`
- [x] `kyoka()` options type: `database`, `planStore`, `plans`, `defaultPlan`, `plugins`, secrets/issuer
- [x] Adapter interface + **`pg` adapter** (direct SQL; Prisma/Drizzle later)
- [x] SQL migrations for SCHEMA.md tables (`tenant_id` nullable; override `value` jsonb)
- [x] Mount handler stub (`/api/kyoka/*`) + Next/Hono helper stubs

## Phase 2 — Subjects, plans, check (no JWT yet) (O1)

- [x] Alias resolve (any kind / `sub_…`) + lazy create with default kind `auth` + `defaultPlan`
- [x] planStore `config` and `database` (empty DB → hard error)
- [x] Override resolution order (`value` jsonb)
- [x] `api.check` JSON only (`allowed`, `limit`, `used`, `reason`, `subjectId`, …) — no JWT yet
- [x] Status gating from STATE_MACHINE (minimal: `free` / `active`)

## Phase 3 — Tokens + JWKS (O2)

- [ ] ES256 mint + JWKS route
- [ ] Sign allow and deny; TTL 1h
- [ ] `verify` helper for server/edge
- [ ] Optional cookie helper (set HttpOnly entitlement cookie)

## Phase 4 — Generic events + state machine fullness (O2)

- [ ] `POST /v1/events` + `applyBillingEvent`
- [ ] Idempotency table
- [ ] Full status transitions (grace, canceling, suspended)

## Phase 5 — Stripe plugin (O3)

- [ ] `@kyoka/stripe` package
- [ ] Signature verify + event map + metadata aliases
- [ ] Fixture tests with signed payloads

## Phase 6 — Admin API (O3)

- [ ] Plans CRUD when `planStore: "database"`
- [ ] Aliases add/remove
- [ ] Overrides set/clear
- [ ] `subjects.get`

## Phase 7 — Harden for publish (O3)

- [ ] Example app under `examples/`
- [ ] Unit/integration tests
- [ ] npm publish pipeline for `kyoka` + `@kyoka/stripe`
- [ ] Then: integrator docs track + private hosted build ([../PLAN_HOSTED.md](../PLAN_HOSTED.md))

## Non-goals in these phases

- Polar plugin (Phase 5b after Stripe)
- Hosted multi-tenant / Next console
- Auto-seed plans
- Usage metering storage inside Kyoka
- Dedicated Node HTTP client for Cloud (`@kyoka/client` / remote `baseURL` mode) — revisit in Cloud / Docs-SDK track
