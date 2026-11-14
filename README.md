# Kyoka (public OSS)

TypeScript entitlements library: `can(subject, feature)` → JSON + signed JWT. Payment-agnostic (Stripe plugin + generic events). Better Auth–style embed.

> **Maintainer docs** (this pass). Polished integrator quickstart is a later track.

## Pronunciation

**Kyoka** — KYOH-kah (permission / approval).

## Nested workspace note

This repo lives at `kyoka-cloud/oss/` so agents can work beside the private cloud tree. It has its **own** `.git`. The parent private repo **gitignores** `oss/`.

Prefer opening **`kyoka-cloud`** (parent) in Cursor, not this folder alone.

## Repository layout

```text
PRODUCT.md          What we're building
DECISIONS.md        Locked product decisions
ARCHITECTURE.md     How the library fits together
DOMAIN.md           Subjects, aliases, plans, overrides
SCHEMA.md           Tables
STATE_MACHINE.md    Billing states
API_CONTRACT.md     Implementer HTTP / api shapes
PLUGINS.md          Plugin + Stripe adapter contract
PLAN.md             OSS build phases + sprint map (O1–O3)
packages/kyoka      Core package (to implement)
packages/stripe     @kyoka/stripe (to implement)
examples/           Example apps (later)
docs/history/       Archived handoff briefs
```

## Private cloud (parent)

Hosted API + Next console: parent directory `kyoka-cloud/` (private). Depends on packages from this OSS repo. Dual-MVP shape: [../MVP.md](../MVP.md).

## Status

Sprint **O1** implemented in `packages/kyoka`: config-mode `check` (JSON), `pg` adapter + migrations, HTTP mount. Next: O2 (JWT + events). See [PLAN.md](./PLAN.md).

```bash
bun install
bun test
bun run --filter kyoka build
```

## License

**MIT** — see [LICENSE](./LICENSE).
