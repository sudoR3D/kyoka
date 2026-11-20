import { InvalidInputError } from "./errors.js";
import { createSubjectId, normalizeTenantId } from "./ids.js";
import type {
  AliasRef,
  EnsureSubjectRecordResult,
  EnsureSubjectResult,
  KyokaOptions,
  SubjectRecord,
  SubjectStatus,
} from "./types.js";

export function isSubjectId(value: string): boolean {
  return value.startsWith("sub_");
}

export function normalizeAliases(aliases: AliasRef[] | undefined): AliasRef[] {
  if (aliases === undefined) return [];
  if (!Array.isArray(aliases)) {
    throw new InvalidInputError("Kyoka: aliases must be an array");
  }

  const seen = new Set<string>();
  const normalized: AliasRef[] = [];
  for (const alias of aliases) {
    if (
      !alias ||
      typeof alias.kind !== "string" ||
      typeof alias.value !== "string" ||
      alias.kind.length === 0 ||
      alias.value.length === 0
    ) {
      throw new InvalidInputError("Kyoka: alias kind and value are required");
    }
    const key = `${alias.kind}\u0000${alias.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ kind: alias.kind, value: alias.value });
  }
  return normalized;
}

export function requireAliases(aliases: AliasRef[] | undefined): AliasRef[] {
  const normalized = normalizeAliases(aliases);
  if (normalized.length === 0) {
    throw new InvalidInputError("Kyoka: at least one alias is required");
  }
  return normalized;
}

export async function findSubject(
  options: KyokaOptions,
  tenantId: string,
  subjectOrAlias: string,
): Promise<SubjectRecord | null> {
  const db = options.database;

  if (isSubjectId(subjectOrAlias)) {
    return db.getSubjectById(tenantId, subjectOrAlias);
  }

  const alias = await db.findAlias(tenantId, subjectOrAlias);
  if (!alias) return null;

  const subject = await db.getSubjectById(tenantId, alias.subjectId);
  if (!subject) {
    throw new Error(
      `Kyoka: alias ${subjectOrAlias} points to missing subject ${alias.subjectId}`,
    );
  }
  return subject;
}

export async function ensureSubjectRecord(
  options: KyokaOptions,
  tenantId: string,
  input: {
    aliases: AliasRef[];
    planSlug: string;
    status: SubjectStatus;
  },
): Promise<EnsureSubjectRecordResult> {
  const aliases = requireAliases(input.aliases);
  return options.database.ensureSubject({
    tenantId,
    subjectId: createSubjectId(),
    planSlug: input.planSlug,
    status: input.status,
    aliases,
  });
}

export async function ensureSubject(
  options: KyokaOptions,
  input: { aliases: AliasRef[] },
): Promise<EnsureSubjectResult> {
  const tenantId = normalizeTenantId(options.tenantId);
  const ensured = await ensureSubjectRecord(options, tenantId, {
    aliases: input.aliases,
    planSlug: options.defaultPlan,
    status: "free",
  });
  return {
    subjectId: ensured.subject.id,
    created: ensured.created,
  };
}

