# Kyoka — API contract (implementers)

HTTP paths assume mount base `/api/kyoka` and version prefix `/v1` where noted. In-process `api.*` mirrors these behaviors without HTTP.

This is a **development contract**, not polished integrator docs.

## Authn on routes

| Route class | Embed | Hosted |
|---|---|---|
| `check`, admin, generic events | Same-app / optional secret | `Authorization: Bearer kyo_live_…` |
| Provider webhooks | Provider signature | Provider signature |
| JWKS | Public | Public |

## `POST /v1/check`

Request:

```json
{
  "subject": "user_ada",
  "feature": "export.png",
  "used": 3
}
```

`used` optional. `subject` = alias value or `sub_…`.

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

In-process: `api.check({ subject, feature, used? })`.

## `POST /v1/events` (generic ingress)

Request (conceptual):

```json
{
  "idempotencyKey": "evt_custom_1",
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

## `POST /webhooks/stripe` (plugin)

Raw Stripe body + `Stripe-Signature`. Plugin verifies, maps, calls core `applyBillingEvent`. Not part of core package; registered by `@kyoka-js/stripe`.

## `GET …/jwks` (or `/.well-known/jwks.json` under mount)

JWKS document listing public keys with `kid`.

## Admin (in-process + HTTP under `/v1/admin/…`)

### Plans (`planStore: "database"` only)

- `plans.list` / `plans.get(slug)` / `plans.upsert({ slug, features })` / `plans.delete(slug)`
- If `planStore: "config"` → reject with clear error

### Subjects / aliases / overrides

- `subjects.get(subjectOrAlias)`
- `aliases.add({ subject, kind, value })` / `aliases.remove(…)`
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
| `planStore: database` and no plans | 500/config error with explicit message |
| Invalid provider signature | 401/400 |
| Duplicate event | 200 no-op |
| Unknown feature on entitled plan | `allowed: false`, reason `unknown_feature` or treat as deny |
