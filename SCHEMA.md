# Kyoka — schema (MVP)

Logical schema for embed (app DB via adapter). Hosted adds a `tenant_id` on every row (see private `TENANCY.md`). Embed may omit `tenant_id` or use a constant.

IDs: string cuid/ulid; subjects prefixed `sub_` in application layer.

## Tables

### `kyoka_subject`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `sub_…` |
| `tenant_id` | text nullable | Hosted required |
| `plan_slug` | text | e.g. `free`, `pro` |
| `status` | text | See STATE_MACHINE |
| `period_ends_at` | timestamptz nullable | cancel-at-period-end |
| `grace_ends_at` | timestamptz nullable | |
| `trial_ends_at` | timestamptz nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes: `(tenant_id, id)`, `(tenant_id, plan_slug)` as needed.

### `kyoka_alias`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `tenant_id` | text nullable | |
| `subject_id` | text FK → subject | |
| `kind` | text | `auth`, `app`, `stripe`, `polar`, … |
| `value` | text | External id string |
| `created_at` | timestamptz | |

**Unique:** `(tenant_id, kind, value)` (use `''` tenant for embed if needed).

### `kyoka_plan` (only when `planStore: "database"`)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `tenant_id` | text nullable | |
| `slug` | text | `free`, `pro` |
| `features` | jsonb | Map feature → `{ enabled?, limit? }` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Unique:** `(tenant_id, slug)`.

Empty table + `planStore: database` → runtime error (no auto-seed).

### `kyoka_override` (MVP: jsonb `value`)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `tenant_id` | text nullable | |
| `subject_id` | text FK | |
| `feature` | text | |
| `value` | jsonb | e.g. `{ "enabled": true, "limit": 10 }` or `{ "limit": null }` for unlimited |

**Unique:** `(tenant_id, subject_id, feature)`. Do not use separate `enabled`/`limit` columns in MVP.

### `kyoka_processed_event`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `tenant_id` | text nullable | |
| `idempotency_key` | text | Stripe `event.id` or client key |
| `source` | text | `stripe`, `generic`, … |
| `processed_at` | timestamptz | |

**Unique:** `(tenant_id, source, idempotency_key)`.

### Signing keys (embed env or table)

MVP embed: key material from env (`KYOKA_SECRET` / PEM paths). Optional later table for rotation metadata. JWKS built from configured public keys + `kid`.

Hosted: per-tenant or platform keys — private repo decision.

## Config-mode plans (not a table)

When `planStore: "config"`, plans live only in the `kyoka({ plans })` object. `kyoka_plan` unused for reads.

## Migrations

CLI / adapter generate migrations for the tables above. Re-run after schema changes. Plugins must not invent private tables in MVP (Stripe uses core event + subject tables only).
