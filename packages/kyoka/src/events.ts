import { InvalidInputError, SubjectNotFoundError } from "./errors.js";
import { normalizeTenantId } from "./ids.js";
import { ensureSubjectRecord, normalizeAliases } from "./subjects.js";
import type {
  AliasRef,
  ApplyBillingEventResult,
  BillingEventInput,
  KyokaOptions,
  SubjectRecord,
  SubjectStatus,
} from "./types.js";

const SUBJECT_STATUSES: ReadonlySet<string> = new Set([
  "free",
  "trial",
  "active",
  "canceling",
  "past_due",
  "grace",
  "suspended",
]);

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidInputError(`Kyoka: invalid date ${value}`);
  }
  return d;
}

function normalizeSource(source: string | undefined): string {
  const value = source ?? "generic";
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(value)) {
    throw new InvalidInputError("Kyoka: invalid event source");
  }
  return value;
}

function validateEventInput(input: BillingEventInput): {
  source: string;
  aliases: AliasRef[];
} {
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length === 0
  ) {
    throw new InvalidInputError("Kyoka: idempotencyKey is required");
  }
  if (
    typeof input.status !== "string" ||
    !SUBJECT_STATUSES.has(input.status)
  ) {
    throw new InvalidInputError("Kyoka: status is required");
  }
  if (
    input.plan !== undefined &&
    (typeof input.plan !== "string" || input.plan.length === 0)
  ) {
    throw new InvalidInputError("Kyoka: plan must be a non-empty string");
  }
  if (input.subjectId !== undefined) {
    if (
      typeof input.subjectId !== "string" ||
      !input.subjectId.startsWith("sub_")
    ) {
      throw new InvalidInputError("Kyoka: subjectId must be a sub_ id");
    }
  }

  const aliases = normalizeAliases(input.aliases);
  if (!input.subjectId && aliases.length === 0) {
    throw new InvalidInputError(
      "Kyoka: billing event requires a subjectId or at least one alias",
    );
  }

  return {
    source: normalizeSource(input.source),
    aliases,
  };
}

export async function applyBillingEvent(
  options: KyokaOptions,
  input: BillingEventInput,
): Promise<ApplyBillingEventResult> {
  const tenantId = normalizeTenantId(options.tenantId);
  const db = options.database;
  const { source, aliases } = validateEventInput(input);

  if (await db.hasProcessedEvent(tenantId, source, input.idempotencyKey)) {
    return {
      applied: false,
      duplicate: true,
      subjectId: input.subjectId ?? null,
      created: false,
    };
  }

  let subject: SubjectRecord;
  let created = false;

  if (input.subjectId) {
    const existing = await db.getSubjectById(tenantId, input.subjectId);
    if (!existing) {
      throw new SubjectNotFoundError();
    }
    if (aliases.length > 0) {
      await db.linkAliases({
        tenantId,
        subjectId: existing.id,
        aliases,
      });
    }
    subject = existing;
  } else {
    const ensured = await ensureSubjectRecord(options, tenantId, {
      aliases,
      planSlug: input.plan ?? options.defaultPlan,
      status: input.status as SubjectStatus,
    });
    subject = ensured.subject;
    created = ensured.created;
  }

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
    created,
  };
}
