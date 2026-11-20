# Kyoka — API contract (implementers)

HTTP paths assume mount base `/api/kyoka` and version prefix `/v1` where noted. In-process `api.*` mirrors these behaviors without HTTP.

This is a **development contract**, not polished integrator docs.

## Authn on routes

| Route class | Embed | Hosted |
|---|---|---|
| `check`, `subjects.ensure`, admin, generic events | Same-app / optional secret | `Authorization: Bearer kyo_live_…` |
| Provider webhooks | Provider signature | Provider signature |
| JWKS | Public | Public |

## `POST /v1/check`

Request:

```json
{
  "subject": "user_ada",
  "feature": "export.png",
  "used": 3,
  "lazyCreate": false
}
```

`used` optional. `subject` = alias value or `sub_…`. `lazyCreate` optional, default `false`.

Unknown subject → `404 subject_not_found`. With `lazyCreate: true`, an unknown alias creates a `free`/`defaultPlan` subject and `auth` alias. `sub_…` ids are never created implicitly; an unknown id still 404s. An empty plan store → `503 plans_not_configured`.

Response:

```json
{
  "allowed": true,
  "feature": "export.png",
  "subject": "user_ada",
  "subjectId": "sub_01HZX…",
  "plan": "free",
  "status": "free",
  "limit": 5,
  "used": 3,
  "reason": "plan:free",
  "expiresAt": "2026-11-14T03:00:00.000Z",
  "token": "eyJ…"
}
```

Deny still returns a signed `token` when possible.

In-process: `api.check({ subject, feature, used?, lazyCreate? })`.

## `POST /v1/subjects`

Request:

```json
{
  "aliases": [
    { "kind": "auth", "value": "user_ada" },
    { "kind": "stripe", "value": "cus_ada" }
  ]
}
```

Response:

```json
{ "subjectId": "sub_01HZX…", "created": true }
```

Idempotent ensure. Creates a `free`/`defaultPlan` subject only if no alias matches; never changes billing state. Alias owned by another subject → `409 alias_conflict`; malformed aliases → `400 invalid_input`.

## `POST /v1/events` (generic ingress)

Request (conceptual):

```json
{
  "idempotencyKey": "evt_custom_1",
  "subjectId": "sub_01HZX…",
  "aliases": [
    { "kind": "auth", "value": "user_ada" },
    { "kind": "stripe", "value": "cus_ada" }
  ],
  "plan": "pro",
  "status": "active",
  "periodEndsAt": "2026-12-14T00:00:00.000Z",
  "graceEndsAt": null
}
```

Creates/links subject + aliases; applies billing state. Idempotent on `idempotencyKey`.

- `subjectId` targets an existing subject; unknown id → `404 subject_not_found`. Never creates.
- `aliases` are optional only when `subjectId` is present. With `subjectId`, matching aliases are linked atomically before state is applied.
- Without `subjectId`, at least one alias is required and a missing subject is created.
- Alias owned by another subject → `409 alias_conflict` before billing state changes.

Response includes `applied`, `duplicate`, `subjectId`, and `created` (`true` only when the event created the subject).

## `POST /webhooks/stripe` (plugin)

Raw Stripe body + `Stripe-Signature`. Plugin verifies, maps, calls core `applyBillingEvent`. Not part of core package; registered by `@kyoka-js/stripe`.

## `GET …/jwks` (or `/.well-known/jwks.json` under mount)

JWKS document listing public keys with `kid`.

## Admin (in-process + HTTP under `/v1/admin/…`)

### Plans (`planStore: "database"` only)

- `plans.list` / `plans.get(slug)` / `plans.upsert({ slug, features })` / `plans.delete(slug)`
- If `planStore: "config"` → reject with clear error

### Subjects / aliases / overrides

- `subjects.ensure({ aliases })`
- `subjects.get(subjectOrAlias)` → `null` when missing; no implicit creation
- `aliases.add({ subject, kind, value })` / `aliases.remove(…)`; `add` does not create subjects
- `subjects.setOverride({ subject, feature, enabled?, limit? })`
- `subjects.clearOverride({ subject, feature })`

## JWT claims

| Claim | Meaning |
|---|---|
| `sub` | Subject id preferred as `sub_…` (or alias used at mint — implementers: prefer canonical id) |
| `feature` | Feature key |
| `allowed` | boolean |
| `plan` | Plan slug |
| `reason` | Machine-readable reason |
| `limit` | number or omit/null |
| `iat` / `exp` | Issued / expiry |
| `iss` | Configured issuer |
| Header `kid` | Signing key id |

Algorithm: **ES256**. Default TTL: **1h**.

## Errors (sketch)

| Case | Behavior |
|---|---|
| Unknown subject on `check` without `lazyCreate` | `404 subject_not_found` |
| Plan store has no plans | `503 plans_not_configured` |
| Alias belongs to another subject | `409 alias_conflict` |
| Malformed aliases / event / lazy flag | `400 invalid_input` / route-specific 400 |
| Invalid provider signature | 401/400 |
| Duplicate event | 200 no-op, `created: false` |
| Unknown feature on entitled plan | `allowed: false`, reason `unknown_feature` or treat as deny |
