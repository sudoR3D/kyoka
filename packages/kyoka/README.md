# `@kyoka-js/kyoka`

TypeScript entitlements library: `can(subject, feature)` → JSON + signed JWT.

```bash
npm i @kyoka-js/kyoka
# optional Stripe plugin
npm i @kyoka-js/stripe
```

```ts
const subject = await entitlements.api.subjects.ensure({
  aliases: [{ kind: "auth", value: "user_ada" }],
});

const check = await entitlements.api.check({
  subject: subject.subjectId,
  feature: "export.csv",
});
```

`check` is read-only by default. Pass `lazyCreate: true` to create a missing alias subject on the fly. Unknown `sub_…` ids never auto-create.

See repo [PLAN.md](../../PLAN.md), [ARCHITECTURE.md](../../ARCHITECTURE.md), [API_CONTRACT.md](../../API_CONTRACT.md).
