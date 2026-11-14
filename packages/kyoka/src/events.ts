import { createSubjectId, normalizeTenantId } from "./ids.js";
import type {
  ApplyBillingEventResult,
  BillingEventInput,
  KyokaOptions,
  SubjectRecord,
} from "./types.js";

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Kyoka: invalid date ${value}`);
  }
  return d;
}

async function resolveOrCreateFromAliases(
  options: KyokaOptions,
  tenantId: string,
  aliases: BillingEventInput["aliases"],
  planSlug: string,
  status: BillingEventInput["status"],
): Promise<SubjectRecord> {
  if (!aliases.length) {
    throw new Error("Kyoka: billing event requires at least one alias");
  }

  const db = options.database;
  let subject: SubjectRecord | null = null;

  for (const alias of aliases) {
    const found = await db.findAlias(tenantId, alias.value, alias.kind);
    if (found) {
      subject = await db.getSubjectById(tenantId, found.subjectId);
      if (!subject) {
        throw new Error(
          `Kyoka: alias points to missing subject ${found.subjectId}`,
        );
      }
      break;
    }
    // Also try value-only match (any kind)
    const any = await db.findAlias(tenantId, alias.value);
    if (any) {
      subject = await db.getSubjectById(tenantId, any.subjectId);
      if (subject) break;
    }
  }

  if (!subject) {
    const first = aliases[0]!;
    subject = await db.createSubjectWithAlias({
      tenantId,
      subjectId: createSubjectId(),
      planSlug,
      status,
      aliasKind: first.kind,
      aliasValue: first.value,
    });
  }

  for (const alias of aliases) {
    const existing = await db.findAlias(tenantId, alias.value, alias.kind);
    if (existing) {
      if (existing.subjectId !== subject.id) {
        throw new Error(
          `Kyoka: alias ${alias.kind}:${alias.value} belongs to another subject`,
        );
      }
      continue;
    }
    await db.addAlias({
      tenantId,
      subjectId: subject.id,
      kind: alias.kind,
      value: alias.value,
    });
  }

  return subject;
}

export async function applyBillingEvent(
  options: KyokaOptions,
  input: BillingEventInput,
): Promise<ApplyBillingEventResult> {
  const tenantId = normalizeTenantId(options.tenantId);
  const source = input.source ?? "generic";
  const db = options.database;

  if (!input.idempotencyKey) {
    throw new Error("Kyoka: idempotencyKey is required");
  }
  if (!input.status) {
    throw new Error("Kyoka: status is required");
  }

  if (await db.hasProcessedEvent(tenantId, source, input.idempotencyKey)) {
    return { applied: false, duplicate: true, subjectId: null };
  }

  const planSlug = input.plan ?? options.defaultPlan;
  const subject = await resolveOrCreateFromAliases(
    options,
    tenantId,
    input.aliases,
    planSlug,
    input.status,
  );

  await db.updateSubjectBilling(tenantId, subject.id, {
    planSlug: input.plan ?? subject.planSlug,
    status: input.status,
    periodEndsAt:
      input.periodEndsAt === undefined
        ? undefined
        : toDate(input.periodEndsAt),
    graceEndsAt:
      input.graceEndsAt === undefined ? undefined : toDate(input.graceEndsAt),
    trialEndsAt:
      input.trialEndsAt === undefined ? undefined : toDate(input.trialEndsAt),
  });

  await db.recordProcessedEvent({
    tenantId,
    source,
    idempotencyKey: input.idempotencyKey,
  });

  return {
    applied: true,
    duplicate: false,
    subjectId: subject.id,
  };
}
