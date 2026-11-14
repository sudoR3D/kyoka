# Kyoka + Hono example

Minimal embed: config plans, `check`, JWKS, generic events. Optional Stripe when `STRIPE_WEBHOOK_SECRET` is set.

## Run

From repo root:

```bash
bun install
bun run --filter kyoka build
cd examples/hono && bun install && bun run dev
```

Server: `http://localhost:8787`

## Curl

```bash
# Check (lazy-creates free subject)
curl -s http://localhost:8787/api/kyoka/v1/check \
  -H 'content-type: application/json' \
  -d '{"subject":"user_ada","feature":"export.csv"}' | jq

# Upgrade via generic event
curl -s http://localhost:8787/api/kyoka/v1/events \
  -H 'content-type: application/json' \
  -d '{
    "idempotencyKey":"evt_demo_1",
    "aliases":[{"kind":"auth","value":"user_ada"}],
    "plan":"pro",
    "status":"active"
  }' | jq

# Pro feature
curl -s http://localhost:8787/api/kyoka/v1/check \
  -H 'content-type: application/json' \
  -d '{"subject":"user_ada","feature":"branding.hide"}' | jq

# JWKS
curl -s http://localhost:8787/api/kyoka/v1/jwks | jq
```

## Production notes

- Replace memory adapter with `pgAdapter(process.env.DATABASE_URL)` and call `database.migrate()`.
- Point Stripe webhooks at `POST /api/kyoka/webhooks/stripe`.
