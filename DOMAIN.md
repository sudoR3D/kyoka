# Kyoka — domain model

## Entities

### Tenant (install / customer)

Who embeds Kyoka or holds a hosted API key. In **embed**, the app install is implicit (one DB). In **hosted**, an explicit tenant row scopes all data.

### Subject

Kyoka’s canonical entitlement holder. Internal id: `sub_…` (stable forever).

Holds:

- Current **plan** slug (e.g. `free`, `pro`)
- Billing **status** (see [STATE_MACHINE.md](./STATE_MACHINE.md))
- Period / grace timestamps as needed
- Feature **overrides** (optional)

Not a Kyoka login user. Not necessarily a Clerk user — aliases bridge external systems.

### Alias

External identifier → one subject.

- Unique per tenant: `(kind, value)`
- Kinds (MVP): `auth`, `app`, `stripe`, `polar`, plus `custom:…` if needed
- Examples: `auth:user_ada`, `app:a1b2-…`, `stripe:cus_ada`

`check({ subject })` and billing events resolve any known alias (or `sub_…`) to the same subject.

Bare string subject (not `sub_…`): look up any `(kind, value)` match. With `lazyCreate: true`, create using default alias kind **`auth`**; without it, missing subjects return `404`.

### Plan

Named bundle (`free`, `pro`, …) with a feature map.

Feature entry shapes:

```text
"export.pdf": { enabled: true }           # boolean, no cap
"export.png": { limit: 5 }                # capped; null limit = unlimited
"export.png": { enabled: true, limit: 5 } # enabled implied if limit set
```

### Feature

String key the app checks: `export.csv`, `branding.hide`, `seat.add`, …

### Override

Per-subject, per-feature rule that wins over the plan.

Does **not** change plan slug or billing status. VIP free user can get `export.png` limit 10 while remaining on `free`.

### Entitlement (effective)

Computed at `check` time — not necessarily a stored row per feature:

```text
1. Subject override for feature? → use it
2. Else plan feature (from planStore) → use it
3. Else deny
```

### Billing event (normalized)

Ingress shape after plugins/generic events:

- Aliases to link/create
- Plan slug
- Status / period end / grace
- Idempotency key

## planStore

| Mode | Plan caps source |
|---|---|
| `config` | `kyoka({ plans })` object — live |
| `database` | Plan tables only; empty → error |

No hybrid. No auto-seed from code into DB.

## Usage vs caps

| | Owner |
|---|---|
| Cap / limit / enabled | Kyoka (plan or override) |
| How many already used | **Integrator DB**; pass `used` into `check` |

## Alias linking (happy path)

1. App calls `subjects.ensure({ aliases: [{ kind: "auth", value: saasUserId }] })` (or `check(..., { lazyCreate: true })`) → subject + alias + `defaultPlan`
2. Checkout metadata includes **same** `saasUserId` (or the existing `sub_…` as `kyokaSubjectId`)
3. Stripe webhook carries `cus_…` + metadata → both aliases on one `sub_…`

## Id changes

Never rename `sub_…`. Add/remove aliases via admin API.
