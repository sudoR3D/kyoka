export type PlanStore = "config" | "database";

export type FeatureRule = {
  enabled?: boolean;
  limit?: number | null;
};

export type PlanDefinition = {
  features: Record<string, FeatureRule>;
};

export type PlansMap = Record<string, PlanDefinition>;

export type SubjectStatus =
  | "free"
  | "trial"
  | "active"
  | "canceling"
  | "past_due"
  | "grace"
  | "suspended";

export type SubjectRecord = {
  id: string;
  tenantId: string;
  planSlug: string;
  status: SubjectStatus;
  periodEndsAt: Date | null;
  graceEndsAt: Date | null;
  trialEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AliasRecord = {
  id: string;
  tenantId: string;
  subjectId: string;
  kind: string;
  value: string;
  createdAt: Date;
};

export type PlanRecord = {
  id: string;
  tenantId: string;
  slug: string;
  features: Record<string, FeatureRule>;
  createdAt: Date;
  updatedAt: Date;
};

export type OverrideRecord = {
  id: string;
  tenantId: string;
  subjectId: string;
  feature: string;
  value: FeatureRule;
};

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
  /** Present when issuer + privateKey configured */
  token?: string;
  expiresAt?: string;
};

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

export type EnsureSubjectRecordInput = {
  tenantId: string;
  subjectId: string;
  planSlug: string;
  status: SubjectStatus;
  aliases: AliasRef[];
};

export type EnsureSubjectRecordResult = {
  subject: SubjectRecord;
  created: boolean;
};

export type BillingEventInput = {
  idempotencyKey: string;
  source?: "generic" | "stripe" | "polar" | string;
  /** Target an existing subject. Never creates a subject. */
  subjectId?: string;
  aliases?: AliasRef[];
  plan?: string;
  status: SubjectStatus;
  periodEndsAt?: string | Date | null;
  graceEndsAt?: string | Date | null;
  trialEndsAt?: string | Date | null;
};

export type ApplyBillingEventResult = {
  applied: boolean;
  duplicate: boolean;
  subjectId: string | null;
  created: boolean;
};

export type KyokaPlugin = {
  id: string;
  routes?: Record<
    string,
    (req: Request, ctx: { instance: KyokaInstance }) => Promise<Response> | Response
  >;
};

export type KyokaOptions = {
  database: KyokaDatabase;
  planStore: PlanStore;
  plans?: PlansMap;
  defaultPlan: string;
  /** Embed: omit or `""`. Hosted: required tenant id. */
  tenantId?: string;
  plugins?: KyokaPlugin[];
  /** JWT issuer (required to mint tokens) */
  issuer?: string;
  /** PKCS8 PEM ES256 private key */
  privateKey?: string;
  /** SPKI PEM ES256 public key (optional; derived from private if omitted) */
  publicKey?: string;
  /** JWT kid header, default kyoka-1 */
  kid?: string;
  /** Token TTL seconds, default 3600 */
  tokenTtlSeconds?: number;
  /** Mount base path, default `/api/kyoka` */
  basePath?: string;
};

export type SubjectView = {
  subject: SubjectRecord;
  aliases: AliasRecord[];
  overrides: OverrideRecord[];
};

export type KyokaApi = {
  check: (input: CheckInput) => Promise<CheckResult>;
  applyBillingEvent: (
    input: BillingEventInput,
  ) => Promise<ApplyBillingEventResult>;
  plans: {
    list: () => Promise<PlanRecord[]>;
    get: (slug: string) => Promise<PlanRecord | null>;
    upsert: (input: {
      slug: string;
      features: Record<string, FeatureRule>;
    }) => Promise<PlanRecord>;
    delete: (slug: string) => Promise<boolean>;
  };
  subjects: {
    ensure: (input: EnsureSubjectInput) => Promise<EnsureSubjectResult>;
    get: (subjectOrAlias: string) => Promise<SubjectView | null>;
    setOverride: (input: {
      subject: string;
      feature: string;
      enabled?: boolean;
      limit?: number | null;
    }) => Promise<OverrideRecord>;
    clearOverride: (input: {
      subject: string;
      feature: string;
    }) => Promise<boolean>;
  };
  aliases: {
    add: (input: {
      subject: string;
      kind: string;
      value: string;
    }) => Promise<AliasRecord>;
    remove: (input: {
      kind: string;
      value: string;
    }) => Promise<boolean>;
  };
};

export type KyokaInstance = {
  api: KyokaApi;
  handler: (req: Request) => Promise<Response>;
  options: KyokaOptions;
};

export type SubjectBillingUpdate = {
  planSlug?: string;
  status?: SubjectStatus;
  periodEndsAt?: Date | null;
  graceEndsAt?: Date | null;
  trialEndsAt?: Date | null;
};

export type KyokaDatabase = {
  getSubjectById(tenantId: string, id: string): Promise<SubjectRecord | null>;
  findAlias(
    tenantId: string,
    value: string,
    kind?: string,
  ): Promise<AliasRecord | null>;
  createSubjectWithAlias(input: {
    tenantId: string;
    subjectId: string;
    planSlug: string;
    status: SubjectStatus;
    aliasKind: string;
    aliasValue: string;
  }): Promise<SubjectRecord>;
  ensureSubject(input: EnsureSubjectRecordInput): Promise<EnsureSubjectRecordResult>;
  linkAliases(input: {
    tenantId: string;
    subjectId: string;
    aliases: AliasRef[];
  }): Promise<AliasRecord[]>;
  addAlias(input: {
    tenantId: string;
    subjectId: string;
    kind: string;
    value: string;
  }): Promise<AliasRecord>;
  updateSubjectBilling(
    tenantId: string,
    subjectId: string,
    update: SubjectBillingUpdate,
  ): Promise<SubjectRecord>;
  hasProcessedEvent(
    tenantId: string,
    source: string,
    idempotencyKey: string,
  ): Promise<boolean>;
  recordProcessedEvent(input: {
    tenantId: string;
    source: string;
    idempotencyKey: string;
  }): Promise<void>;
  getPlan(tenantId: string, slug: string): Promise<PlanRecord | null>;
  listPlans(tenantId: string): Promise<PlanRecord[]>;
  upsertPlan(input: {
    tenantId: string;
    slug: string;
    features: Record<string, FeatureRule>;
  }): Promise<PlanRecord>;
  deletePlan(tenantId: string, slug: string): Promise<boolean>;
  getOverride(
    tenantId: string,
    subjectId: string,
    feature: string,
  ): Promise<OverrideRecord | null>;
  listOverrides(
    tenantId: string,
    subjectId: string,
  ): Promise<OverrideRecord[]>;
  setOverride(input: {
    tenantId: string;
    subjectId: string;
    feature: string;
    value: FeatureRule;
  }): Promise<OverrideRecord>;
  clearOverride(
    tenantId: string,
    subjectId: string,
    feature: string,
  ): Promise<boolean>;
  listAliases(tenantId: string, subjectId: string): Promise<AliasRecord[]>;
  removeAlias(
    tenantId: string,
    kind: string,
    value: string,
  ): Promise<boolean>;
  migrate(): Promise<void>;
};
