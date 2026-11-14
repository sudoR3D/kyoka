# Kyoka — locked decisions

Source: kickoff workshop (2026-11). Change only with an explicit new decision note.

## Product

| Topic | Decision |
|---|---|
| Name | **Kyoka** (KYOH-kah) |
| Company shape | Separate product; not an EzyForm feature |
| EzyForm | Later customer when automation exists |
| MoR | Never Kyoka; Stripe/Polar/Lemon take money |
| First-party checkout | Not MVP |
| Surface | `can()` + signed token; not LaunchDarkly / Keygen-complete |
| API versioning | `/v1/` on HTTP surfaces from day one |
| License | **MIT** |

## Architecture

| Topic | Decision |
|---|---|
| Shape | Better Auth–style **library-first** embed |
| Runtime | TypeScript library; Node 22+; **Bun** for workspace tooling / local scripts |
| Hosted thin API | Same library on **Node + Hono** (private repo) |
| Hosted UI | Next.js console (private repo) |
| Go core | Not MVP |
| Self-host default | Mount in app + app DB; no Compose required |
| OSS boundary | Core + adapters + Stripe plugin + CLI public; cloud private |
| Package manager | **Bun** workspaces (`packages/kyoka`, `packages/stripe`, …) |
| npm org / packages | Org **`kyoka-js`** → `@kyoka-js/kyoka`, `@kyoka-js/stripe` |
| Publish auth | **Trusted Publishing (OIDC)** on GitHub Actions; no long-lived CI npm token |

## Database adapters

| Topic | Decision |
|---|---|
| Model | Adapter **interface**; Kyoka owns `kyoka_*` tables |
| First adapter (O1) | **`pg`** — direct SQL on the same Postgres as the host app |
| Host ORM | **Not required** — Prisma/Drizzle apps still use the `pg` adapter + same `DATABASE_URL` |
| Later | Optional Prisma / Drizzle adapters for DX only |
| Overrides column | `kyoka_override.value` **jsonb** (not separate enabled/limit columns) |
| Bare `check` subject | Resolve any alias with that value (or `sub_…`); on lazy-create default kind **`auth`** |
| IDs | `sub_…` subjects; other ids ulid/cuid strings |

## Hosted value

| Topic | Decision |
|---|---|
| Not selling | “Easier than npm” |
| Selling | Control plane, shared `baseURL`, stable webhook ingress, analytics later |
| Build order | Library first; cloud monetizes later |
| Dual MVP | OSS v1 (publishable embed) then Cloud MVP — see parent `MVP.md` |

## Remote / Cloud consumers

| Topic | Decision |
|---|---|
| Protocol | Language-agnostic HTTP: `baseURL` + API key (`kyo_…`) + public JWKS |
| Embed (Node) | In-process `kyoka()` + mount — not HTTP to own process |
| Node on Cloud (MVP) | Same as Go/Python: `fetch` / curl to hosted API — **no** dedicated cloud client package |
| JWT verify | Small `verify` helper (or snippet) against JWKS; no API key |
| Later | Optional thin typed HTTP client (`@kyoka-js/client` or similar) during Cloud / Docs-SDK track if needed |

## Token + auth

| Topic | Decision |
|---|---|
| Format | JWT **ES256** + **JWKS** + `kid` rotation |
| Default TTL | **1 hour** |
| Sign | Allow **and** deny |
| Verify | Public JWKS only (no API key) |
| Scope | One subject + one feature per token |
| Enforcement | Trusted server/BFF authoritative; UI booleans soft-only |
| Cookie KISS | HttpOnly + Secure entitlement cookie; loader JSON for UI |
| Topology | Same-origin path gateway default; `Domain=.` / BFF advanced |
| Generic events auth | API key (hosted) / same-app trust (embed) |
| Provider webhooks | Provider signature (not Kyoka API key) |
| Mint without keys | If `issuer` / `privateKey` omitted, `check` still works but **omits** `token` / `expiresAt` |
| Default `kid` | `kyoka-1` when unset |
| Cookie name | `kyoka_entitlement` |

## Status gating (O2)

| Topic | Decision |
|---|---|
| free / suspended | Evaluate features against `defaultPlan` (not paid `planSlug`) |
| canceling / grace expiry | Hard deny (`period_ended` / `grace_ended`) — no free-plan fallback at check time |
| past_due | Not entitled until an event moves to `grace` / `active` |
| Event alias conflict | Same `(kind, value)` on another subject → **error** |

## Subject + limits

| Topic | Decision |
|---|---|
| Identity | Canonical `sub_…` + **aliases** `(kind, value)` |
| `check` subject | Any alias or `sub_…` |
| Lazy create | Yes + **defaultPlan** (usually `free`) |
| `sub_…` in responses | Exposed; optional for callers to store |
| Hierarchy | Flat (no org tree in MVP) |
| Usage counts | **SaaS DB only**; pass `used` into `check` |
| Feature shapes | Boolean and/or `limit: N \| null` |
| Response | `allowed` + `limit` (+ echo `used`) + `token` |
| Checkout hygiene | Same saas user id in provider **metadata** |

## Plans store

| Topic | Decision |
|---|---|
| Modes | **`config` XOR `database`** only — no hybrid |
| Config | Live `plans` object in `kyoka({…})` |
| Database | Plan rows only; empty table → **clear error** (no auto-seed) |
| Overrides | Per-subject feature overrides; override > plan |
| Env | Secrets only — never plan matrices |
| Hosted | `database` + console |

## Plugins

| Topic | Decision |
|---|---|
| Generic events | **Core**, day one |
| First provider | **Stripe** (`@kyoka-js/stripe`) |
| Second | Polar (same adapter pattern) |
| Embed select | `plugins: [stripe()]` |
| Hosted select | Console dropdown + secrets |
| Plugin job | Verify + map → core `applyBillingEvent`; not MoR |

## Ingress

| Topic | Decision |
|---|---|
| Primitive | Normalized grant/revoke/status event |
| Adapters | Named webhooks map onto that event |
| Idempotency | Provider `event.id` / client idempotency key |
