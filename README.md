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
PRODUCT.md … PLAN.md     Product / contracts
packages/kyoka           Core library (npm: @kyoka-js/kyoka)
packages/stripe          Stripe plugin (npm: @kyoka-js/stripe)
examples/hono            Minimal Hono embed
docs/history/            Archived handoff briefs
```

## Status

OSS sprints **O1–O3** complete: publishable `@kyoka-js/kyoka` + `@kyoka-js/stripe` (v0.2.0). Cloud build starts next (parent `PLAN_HOSTED.md`).

```bash
bun install
bun run build   # tsc → dist/ (required before imports of "@kyoka-js/kyoka")
bun test
```

Local GitHub Actions dry-run (needs Docker + [act](https://github.com/nektos/act)):

```bash
act push -e .github/events/push-main.json -W .github/workflows/ci.yml
```

Example: [examples/hono](./examples/hono).

## Publish (maintainers)

Packages are under the npm org [`kyoka-js`](https://www.npmjs.com/org/kyoka-js) (current: **0.2.0**).

**Releases** use GitHub Actions **Trusted Publishing (OIDC)** — no `NPM_TOKEN`:

1. On each package page → Settings → Trusted Publisher → GitHub Actions  
   - Org/user: `sudoR3D` · Repo: `kyoka` · Workflow: `publish.yml`
2. Bump `version` in `packages/*/package.json`, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`
3. `.github/workflows/publish.yml` builds, tests, and publishes both packages via OIDC

`@kyoka-js/stripe` depends on `@kyoka-js/kyoka` via **peerDependencies** only (not `workspace:*` in the published tarball).
Polished stranger-facing docs remain a **later track**.

## Private cloud (parent)

Hosted API + Next console: parent directory `kyoka-cloud/` (private). Dual-MVP shape: [../MVP.md](../MVP.md).

## License

**MIT** — see [LICENSE](./LICENSE).
