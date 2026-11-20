import { PlansNotConfiguredError, SubjectNotFoundError } from "./errors.js";
import { normalizeTenantId } from "./ids.js";
import { ensureSubjectRecord, findSubject, isSubjectId } from "./subjects.js";
import { loadTokenContext, mintToken } from "./token.js";
import type {
  CheckInput,
  CheckResult,
  FeatureRule,
  KyokaOptions,
  PlansMap,
  SubjectRecord,
  SubjectStatus,
} from "./types.js";

function resolveFeatureRule(
  rule: FeatureRule | undefined,
): { enabled: boolean; limit: number | null } | null {
  if (!rule) return null;
  const hasLimit = Object.prototype.hasOwnProperty.call(rule, "limit");
  const enabled =
    rule.enabled === true || (rule.enabled !== false && hasLimit);
  if (!enabled && rule.enabled === false) {
    return { enabled: false, limit: hasLimit ? (rule.limit ?? null) : null };
  }
  if (!enabled && !hasLimit) return null;
  return {
    enabled: rule.enabled === false ? false : true,
    limit: hasLimit ? (rule.limit ?? null) : null,
  };
}

async function loadPlans(
  options: KyokaOptions,
  tenantId: string,
): Promise<PlansMap> {
  if (options.planStore === "config") {
    if (!options.plans || Object.keys(options.plans).length === 0) {
      throw new PlansNotConfiguredError(
        'Kyoka: planStore "config" requires a non-empty plans object',
      );
    }
    return options.plans;
  }

  const plans = await options.database.listPlans(tenantId);
  if (plans.length === 0) {
    throw new PlansNotConfiguredError(
      'Kyoka: planStore "database" has no plans — upsert plans via admin API (no auto-seed)',
    );
  }
  const map: PlansMap = {};
  for (const plan of plans) {
    map[plan.slug] = { features: plan.features };
  }
  return map;
}

/**
 * free/suspended → evaluate against defaultPlan (free) features.
 * Other statuses → subject's current plan slug.
 */
function effectivePlanSlug(
  subject: SubjectRecord,
  defaultPlan: string,
): string {
  if (subject.status === "free" || subject.status === "suspended") {
    return defaultPlan;
  }
  return subject.planSlug;
}

/**
 * Whether billing status currently grants plan features (before feature lookup).
 * Returns deny reason if not entitled.
 */
function statusDenyReason(
  subject: SubjectRecord,
  now: Date,
): string | null {
  switch (subject.status) {
    case "past_due":
      return "status:past_due";
    case "canceling": {
      if (subject.periodEndsAt && now.getTime() >= subject.periodEndsAt.getTime()) {
        return "period_ended";
      }
      return null;
    }
    case "grace": {
      if (subject.graceEndsAt && now.getTime() >= subject.graceEndsAt.getTime()) {
        return "grace_ended";
      }
      return null;
    }
    case "trial":
    case "active":
    case "free":
    case "suspended":
      return null;
    default: {
      const _exhaustive: never = subject.status;
      return `status:${_exhaustive}`;
    }
  }
}

async function attachToken(
  options: KyokaOptions,
  result: CheckResult,
): Promise<CheckResult> {
  const ctx = await loadTokenContext(options);
  if (!ctx) return result;
  const minted = await mintToken(ctx, result);
  return {
    ...result,
    token: minted.token,
    expiresAt: minted.expiresAt,
  };
}

async function evaluateCheck(
  options: KyokaOptions,
  tenantId: string,
  subject: SubjectRecord,
  input: CheckInput,
  plans: PlansMap,
): Promise<CheckResult> {
  const planSlug = effectivePlanSlug(subject, options.defaultPlan);
  const plan = plans[planSlug];
  const now = new Date();

  const base: Omit<CheckResult, "allowed" | "limit" | "reason"> = {
    feature: input.feature,
    subject: input.subject,
    subjectId: subject.id,
    plan: subject.planSlug,
    status: subject.status,
    used: input.used,
  };

  const finish = (partial: Pick<CheckResult, "allowed" | "limit" | "reason">) =>
    attachToken(options, { ...base, ...partial });

  if (!plan) {
    return finish({
      allowed: false,
      limit: null,
      reason: `unknown_plan:${planSlug}`,
    });
  }

  const statusReason = statusDenyReason(subject, now);
  // past_due / expired canceling|grace block before feature lookup
  if (
    statusReason === "status:past_due" ||
    statusReason === "period_ended" ||
    statusReason === "grace_ended"
  ) {
    return finish({
      allowed: false,
      limit: null,
      reason: statusReason,
    });
  }

  const override = await options.database.getOverride(
    tenantId,
    subject.id,
    input.feature,
  );

  const fromOverride = override ? resolveFeatureRule(override.value) : null;
  const fromPlan = resolveFeatureRule(plan.features[input.feature]);
  const rule = fromOverride ?? fromPlan;

  if (!rule) {
    return finish({
      allowed: false,
      limit: null,
      reason: "unknown_feature",
    });
  }

  if (!rule.enabled) {
    return finish({
      allowed: false,
      limit: rule.limit,
      reason: fromOverride
        ? "override:disabled"
        : `plan:${planSlug}:disabled`,
    });
  }

  if (rule.limit != null && input.used != null && input.used >= rule.limit) {
    return finish({
      allowed: false,
      limit: rule.limit,
      reason: "limit_reached",
    });
  }

  return finish({
    allowed: true,
    limit: rule.limit,
    reason: fromOverride ? "override" : `plan:${planSlug}`,
  });
}

export async function runCheck(
  options: KyokaOptions,
  input: CheckInput,
): Promise<CheckResult> {
  const tenantId = normalizeTenantId(options.tenantId);
  const existing = await findSubject(options, tenantId, input.subject);

  if (existing) {
    const plans = await loadPlans(options, tenantId);
    return evaluateCheck(options, tenantId, existing, input, plans);
  }

  if (input.lazyCreate !== true || isSubjectId(input.subject)) {
    throw new SubjectNotFoundError();
  }

  const plans = await loadPlans(options, tenantId);
  const ensured = await ensureSubjectRecord(options, tenantId, {
    aliases: [{ kind: "auth", value: input.subject }],
    planSlug: options.defaultPlan,
    status: "free",
  });
  return evaluateCheck(options, tenantId, ensured.subject, input, plans);
}
