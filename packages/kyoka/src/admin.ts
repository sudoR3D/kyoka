import { resolveSubject } from "./check.js";
import { normalizeTenantId } from "./ids.js";
import type {
  AliasRecord,
  FeatureRule,
  KyokaOptions,
  OverrideRecord,
  PlanRecord,
  SubjectView,
} from "./types.js";

function requireDatabasePlanStore(options: KyokaOptions): void {
  if (options.planStore !== "database") {
    throw new Error(
      'Kyoka: plan mutations require planStore "database" (config mode rejects admin plan writes)',
    );
  }
}

export async function listPlans(options: KyokaOptions): Promise<PlanRecord[]> {
  requireDatabasePlanStore(options);
  const tenantId = normalizeTenantId(options.tenantId);
  return options.database.listPlans(tenantId);
}

export async function getPlan(
  options: KyokaOptions,
  slug: string,
): Promise<PlanRecord | null> {
  requireDatabasePlanStore(options);
  const tenantId = normalizeTenantId(options.tenantId);
  return options.database.getPlan(tenantId, slug);
}

export async function upsertPlan(
  options: KyokaOptions,
  input: { slug: string; features: Record<string, FeatureRule> },
): Promise<PlanRecord> {
  requireDatabasePlanStore(options);
  const tenantId = normalizeTenantId(options.tenantId);
  if (!input.slug) throw new Error("Kyoka: plan slug is required");
  return options.database.upsertPlan({
    tenantId,
    slug: input.slug,
    features: input.features ?? {},
  });
}

export async function deletePlan(
  options: KyokaOptions,
  slug: string,
): Promise<boolean> {
  requireDatabasePlanStore(options);
  const tenantId = normalizeTenantId(options.tenantId);
  return options.database.deletePlan(tenantId, slug);
}

export async function getSubject(
  options: KyokaOptions,
  subjectOrAlias: string,
): Promise<SubjectView | null> {
  const tenantId = normalizeTenantId(options.tenantId);
  const db = options.database;

  let subjectId: string | null = null;
  if (subjectOrAlias.startsWith("sub_")) {
    const s = await db.getSubjectById(tenantId, subjectOrAlias);
    if (!s) return null;
    subjectId = s.id;
  } else {
    const alias = await db.findAlias(tenantId, subjectOrAlias);
    if (!alias) return null;
    subjectId = alias.subjectId;
  }

  const subject = await db.getSubjectById(tenantId, subjectId);
  if (!subject) return null;

  const [aliases, overrides] = await Promise.all([
    db.listAliases(tenantId, subject.id),
    db.listOverrides(tenantId, subject.id),
  ]);

  return { subject, aliases, overrides };
}

export async function addAlias(
  options: KyokaOptions,
  input: { subject: string; kind: string; value: string },
): Promise<AliasRecord> {
  const tenantId = normalizeTenantId(options.tenantId);
  const subject = await resolveSubject(options, tenantId, input.subject);
  return options.database.addAlias({
    tenantId,
    subjectId: subject.id,
    kind: input.kind,
    value: input.value,
  });
}

export async function removeAlias(
  options: KyokaOptions,
  input: { kind: string; value: string },
): Promise<boolean> {
  const tenantId = normalizeTenantId(options.tenantId);
  return options.database.removeAlias(tenantId, input.kind, input.value);
}

export async function setOverride(
  options: KyokaOptions,
  input: {
    subject: string;
    feature: string;
    enabled?: boolean;
    limit?: number | null;
  },
): Promise<OverrideRecord> {
  const tenantId = normalizeTenantId(options.tenantId);
  const subject = await resolveSubject(options, tenantId, input.subject);
  const value: FeatureRule = {};
  if (input.enabled !== undefined) value.enabled = input.enabled;
  if (Object.prototype.hasOwnProperty.call(input, "limit")) {
    value.limit = input.limit ?? null;
  }
  return options.database.setOverride({
    tenantId,
    subjectId: subject.id,
    feature: input.feature,
    value,
  });
}

export async function clearOverride(
  options: KyokaOptions,
  input: { subject: string; feature: string },
): Promise<boolean> {
  const tenantId = normalizeTenantId(options.tenantId);
  const subject = await resolveSubject(options, tenantId, input.subject);
  return options.database.clearOverride(
    tenantId,
    subject.id,
    input.feature,
  );
}
