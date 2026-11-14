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
packages/kyoka           Core library (npm: kyoka)
packages/stripe          Stripe plugin (npm: @kyoka/stripe)
examples/hono            Minimal Hono embed
docs/history/            Archived handoff briefs
```

## Status

OSS sprints **O1–O3** complete: publishable `kyoka` + `@kyoka/stripe` (v0.1.0). Cloud build starts next (parent `PLAN_HOSTED.md`).

```bash
bun install
bun run build   # tsc → dist/ (required before imports of "kyoka")
bun test
```

Local GitHub Actions dry-run (needs Docker + [act](https://github.com/nektos/act)):

```bash
act push -e .github/events/push-main.json -W .github/workflows/ci.yml
```

Example: [examples/hono](./examples/hono).

## Publish (maintainers)

Packages are **0.1.0**. Publishing uses `.github/workflows/publish.yml` on tags `v*`.

1. Set repo secret `NPM_TOKEN` (npm automation token with publish rights)
2. `git tag v0.1.0 && git push origin v0.1.0`
3. Action builds, tests, and `npm publish`s `kyoka` then `@kyoka/stripe`

Bump versions in both `package.json` files before tagging a new release.

Polished stranger-facing docs remain a **later track**.

## Private cloud (parent)

Hosted API + Next console: parent directory `kyoka-cloud/` (private). Dual-MVP shape: [../MVP.md](../MVP.md).

## License

**MIT** — see [LICENSE](./LICENSE).
