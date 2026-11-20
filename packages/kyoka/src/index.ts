export { kyoka } from "./kyoka.js";
export {
  AliasConflictError,
  InvalidInputError,
  KyokaError,
  PlansNotConfiguredError,
  SubjectNotFoundError,
} from "./errors.js";
export { pgAdapter } from "./adapter/pg.js";
export { runPgMigrations } from "./adapter/migrate.js";
export { toNextHandler } from "./helpers/next.js";
export { mountKyoka } from "./helpers/hono.js";
export {
  verify,
  setEntitlementCookie,
  generateEs256KeyPair,
  buildJwks,
  loadTokenContext,
  mintToken,
  DEFAULT_TOKEN_TTL_SECONDS,
} from "./token.js";
export type {
  KyokaTokenClaims,
  VerifyOptions,
  EntitlementCookieOptions,
  TokenContext,
} from "./token.js";

export type {
  AliasRecord,
  AliasRef,
  ApplyBillingEventResult,
  EnsureSubjectInput,
  EnsureSubjectRecordInput,
  EnsureSubjectRecordResult,
  EnsureSubjectResult,
  BillingEventInput,
  CheckInput,
  CheckResult,
  FeatureRule,
  KyokaApi,
  KyokaDatabase,
  KyokaInstance,
  KyokaOptions,
  KyokaPlugin,
  OverrideRecord,
  PlanDefinition,
  PlanRecord,
  PlansMap,
  PlanStore,
  SubjectBillingUpdate,
  SubjectRecord,
  SubjectStatus,
  SubjectView,
} from "./types.js";
