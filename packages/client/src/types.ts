// ── Shared enums ──

export type SubjectStatus =
  | "free"
  | "trial"
  | "active"
  | "canceling"
  | "past_due"
  | "grace"
  | "suspended";

// ── Config ──

export type ClientOptions = {
  /** Full base URL for self-hosted Kyoka. Wins over tenantId if both set. */
  baseUrl?: string;
  /** Tenant ID for Kyoka Cloud (e.g. "ten_abc123"). */
  tenantId?: string;
  /** API key (e.g. "kyo_live_xxxx"). */
  apiKey?: string;
  /** Custom fetch implementation (for testing or custom transports). */
  fetch?: typeof globalThis.fetch;
};

export type ResolvedConfig = {
  baseUrl: string;
  apiKey: string | undefined;
  fetch: typeof globalThis.fetch;
};

// ── Check ──

export type CheckInput = {
  subject: string;
  feature: string;
  used?: number;
  lazyCreate?: boolean;
};

export type CheckResult = {
  allowed: boolean;
  feature: string;
  subject: string;
  subjectId: string;
  plan: string;
  status: SubjectStatus;
  limit: number | null;
  used?: number;
  reason: string;
  token?: string;
  expiresAt?: string;
};

// ── Subjects ──

export type AliasRef = {
  kind: string;
  value: string;
};

export type EnsureSubjectInput = {
  aliases: AliasRef[];
};

export type EnsureSubjectResult = {
  subjectId: string;
  created: boolean;
};

// ── Events ──

export type PushEventInput = {
  idempotencyKey: string;
  subjectId?: string;
  aliases?: AliasRef[];
  plan?: string;
  status: SubjectStatus;
  periodEndsAt?: string | null;
  graceEndsAt?: string | null;
  trialEndsAt?: string | null;
};

export type PushEventResult = {
  applied: boolean;
  duplicate: boolean;
  subjectId: string | null;
  created: boolean;
};

// ── Admin: Plans ──

export type FeatureRule = {
  enabled?: boolean;
  limit?: number | null;
};

export type PlanRecord = {
  id: string;
  tenantId: string;
  slug: string;
  features: Record<string, FeatureRule>;
  createdAt: string;
  updatedAt: string;
};

export type UpsertPlanInput = {
  slug: string;
  features: Record<string, FeatureRule>;
};

// ── Admin: Subjects ──

export type SubjectRecord = {
  id: string;
  tenantId: string;
  planSlug: string;
  status: SubjectStatus;
  periodEndsAt: string | null;
  graceEndsAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AliasRecord = {
  id: string;
  tenantId: string;
  subjectId: string;
  kind: string;
  value: string;
  createdAt: string;
};

export type OverrideRecord = {
  id: string;
  tenantId: string;
  subjectId: string;
  feature: string;
  value: FeatureRule;
};

export type SubjectView = {
  subject: SubjectRecord;
  aliases: AliasRecord[];
  overrides: OverrideRecord[];
};

export type SetOverrideInput = {
  subject: string;
  feature: string;
  enabled?: boolean;
  limit?: number | null;
};

export type AddAliasInput = {
  subject: string;
  kind: string;
  value: string;
};

export type RemoveAliasInput = {
  kind: string;
  value: string;
};

// ── Verify ──

export type KyokaTokenClaims = {
  sub: string;
  feature: string;
  allowed: boolean;
  plan: string;
  reason: string;
  limit?: number | null;
  iss: string;
  iat: number;
  exp: number;
};
