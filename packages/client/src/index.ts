import { KyokaClient } from "./client.js";
import { resolveConfig } from "./config.js";
import type { ClientOptions } from "./types.js";

export function createClient(options?: ClientOptions): KyokaClient {
  return new KyokaClient(resolveConfig(options));
}

export { KyokaClient } from "./client.js";
export { KyokaApiError, KyokaNetworkError } from "./errors.js";
export { verifyToken } from "./verify.js";
export type {
  AddAliasInput,
  AliasRecord,
  AliasRef,
  CheckInput,
  CheckResult,
  ClientOptions,
  EnsureSubjectInput,
  EnsureSubjectResult,
  FeatureRule,
  KyokaTokenClaims,
  OverrideRecord,
  PlanRecord,
  PushEventInput,
  PushEventResult,
  RemoveAliasInput,
  ResolvedConfig,
  SetOverrideInput,
  SubjectRecord,
  SubjectStatus,
  SubjectView,
  UpsertPlanInput,
} from "./types.js";
