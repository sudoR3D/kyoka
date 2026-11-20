import { AliasConflictError, SubjectNotFoundError } from "../errors.js";
import { createId } from "../ids.js";
import type {
  AliasRecord,
  KyokaDatabase,
  OverrideRecord,
  PlanRecord,
  SubjectBillingUpdate,
  SubjectRecord,
  SubjectStatus,
} from "../types.js";

/**
 * In-memory adapter for unit tests. Not a supported production adapter.
 */
export function memoryAdapter(): KyokaDatabase & {
  seedPlan(tenantId: string, slug: string, features: PlanRecord["features"]): void;
  setSubjectStatus(tenantId: string, subjectId: string, status: SubjectStatus): void;
  setSubjectBilling(
    tenantId: string,
    subjectId: string,
    update: SubjectBillingUpdate,
  ): void;
  /** Test helper — prefer api/database setOverride in production paths */
  seedOverride(
    tenantId: string,
    subjectId: string,
    feature: string,
    value: OverrideRecord["value"],
  ): void;
} {
  const subjects = new Map<string, SubjectRecord>();
  const aliases: AliasRecord[] = [];
  const plans = new Map<string, PlanRecord>();
  const overrides = new Map<string, OverrideRecord>();
  const processed = new Set<string>();

  const subjectKey = (tenantId: string, id: string) => `${tenantId}::${id}`;
  const planKey = (tenantId: string, slug: string) => `${tenantId}::${slug}`;
  const overrideKey = (tenantId: string, subjectId: string, feature: string) =>
    `${tenantId}::${subjectId}::${feature}`;
  const eventKey = (tenantId: string, source: string, idempotencyKey: string) =>
    `${tenantId}::${source}::${idempotencyKey}`;

  function applyBilling(
    tenantId: string,
    subjectId: string,
    update: SubjectBillingUpdate,
  ): SubjectRecord {
    const key = subjectKey(tenantId, subjectId);
    const subject = subjects.get(key);
    if (!subject) throw new Error("subject not found");
    const next: SubjectRecord = {
      ...subject,
      planSlug: update.planSlug ?? subject.planSlug,
      status: update.status ?? subject.status,
      periodEndsAt:
        update.periodEndsAt !== undefined
          ? update.periodEndsAt
          : subject.periodEndsAt,
      graceEndsAt:
        update.graceEndsAt !== undefined
          ? update.graceEndsAt
          : subject.graceEndsAt,
      trialEndsAt:
        update.trialEndsAt !== undefined
          ? update.trialEndsAt
          : subject.trialEndsAt,
      updatedAt: new Date(),
    };
    subjects.set(key, next);
    return next;
  }

  return {
    async migrate() {
      // no-op
    },

    seedPlan(tenantId, slug, features) {
      const now = new Date();
      plans.set(planKey(tenantId, slug), {
        id: createId(),
        tenantId,
        slug,
        features,
        createdAt: now,
        updatedAt: now,
      });
    },

    setSubjectStatus(tenantId, subjectId, status) {
      applyBilling(tenantId, subjectId, { status });
    },

    setSubjectBilling(tenantId, subjectId, update) {
      applyBilling(tenantId, subjectId, update);
    },

    seedOverride(tenantId, subjectId, feature, value) {
      overrides.set(overrideKey(tenantId, subjectId, feature), {
        id: createId(),
        tenantId,
        subjectId,
        feature,
        value,
      });
    },

    async getSubjectById(tenantId, id) {
      return subjects.get(subjectKey(tenantId, id)) ?? null;
    },

    async findAlias(tenantId, value, kind?) {
      return (
        aliases.find(
          (a) =>
            a.tenantId === tenantId &&
            a.value === value &&
            (kind ? a.kind === kind : true),
        ) ?? null
      );
    },

    async createSubjectWithAlias(input) {
      const now = new Date();
      const subject: SubjectRecord = {
        id: input.subjectId,
        tenantId: input.tenantId,
        planSlug: input.planSlug,
        status: input.status,
        periodEndsAt: null,
        graceEndsAt: null,
        trialEndsAt: null,
        createdAt: now,
        updatedAt: now,
      };
      subjects.set(subjectKey(input.tenantId, input.subjectId), subject);
      aliases.push({
        id: createId(),
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        kind: input.aliasKind,
        value: input.aliasValue,
        createdAt: now,
      });
      return subject;
    },

    async ensureSubject(input) {
      const matching = aliases.filter(
        (a) =>
          a.tenantId === input.tenantId &&
          input.aliases.some(
            (ref) => ref.kind === a.kind && ref.value === a.value,
          ),
      );
      const subjectIds = new Set(matching.map((a) => a.subjectId));

      if (subjectIds.size > 1) {
        throw new AliasConflictError();
      }

      if (subjectIds.size === 1) {
        const subjectId = [...subjectIds][0]!;
        const subject = subjects.get(subjectKey(input.tenantId, subjectId));
        if (!subject) {
          throw new Error(
            `Kyoka: alias points to missing subject ${subjectId}`,
          );
        }
        const now = new Date();
        for (const ref of input.aliases) {
          const existing = aliases.find(
            (a) =>
              a.tenantId === input.tenantId &&
              a.kind === ref.kind &&
              a.value === ref.value,
          );
          if (existing) {
            if (existing.subjectId !== subjectId) {
              throw new AliasConflictError();
            }
            continue;
          }
          aliases.push({
            id: createId(),
            tenantId: input.tenantId,
            subjectId,
            kind: ref.kind,
            value: ref.value,
            createdAt: now,
          });
        }
        return { subject, created: false };
      }

      const now = new Date();
      const subject: SubjectRecord = {
        id: input.subjectId,
        tenantId: input.tenantId,
        planSlug: input.planSlug,
        status: input.status,
        periodEndsAt: null,
        graceEndsAt: null,
        trialEndsAt: null,
        createdAt: now,
        updatedAt: now,
      };
      subjects.set(subjectKey(input.tenantId, input.subjectId), subject);
      for (const ref of input.aliases) {
        aliases.push({
          id: createId(),
          tenantId: input.tenantId,
          subjectId: input.subjectId,
          kind: ref.kind,
          value: ref.value,
          createdAt: now,
        });
      }
      return { subject, created: true };
    },

    async linkAliases(input) {
      const subject = subjects.get(subjectKey(input.tenantId, input.subjectId));
      if (!subject) throw new SubjectNotFoundError();

      const records: AliasRecord[] = [];
      const pending: AliasRecord[] = [];
      for (const ref of input.aliases) {
        const existing = aliases.find(
          (a) =>
            a.tenantId === input.tenantId &&
            a.kind === ref.kind &&
            a.value === ref.value,
        );
        if (existing) {
          if (existing.subjectId !== input.subjectId) {
            throw new AliasConflictError();
          }
          records.push(existing);
          continue;
        }
        const record: AliasRecord = {
          id: createId(),
          tenantId: input.tenantId,
          subjectId: input.subjectId,
          kind: ref.kind,
          value: ref.value,
          createdAt: new Date(),
        };
        pending.push(record);
        records.push(record);
      }
      aliases.push(...pending);
      return records;
    },

    async addAlias(input) {
      const existing = aliases.find(
        (a) =>
          a.tenantId === input.tenantId &&
          a.kind === input.kind &&
          a.value === input.value,
      );
      if (existing) {
        if (existing.subjectId !== input.subjectId) {
          throw new Error(
            `Kyoka: alias ${input.kind}:${input.value} belongs to another subject`,
          );
        }
        return existing;
      }
      const record: AliasRecord = {
        id: createId(),
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        kind: input.kind,
        value: input.value,
        createdAt: new Date(),
      };
      aliases.push(record);
      return record;
    },

    async updateSubjectBilling(tenantId, subjectId, update) {
      return applyBilling(tenantId, subjectId, update);
    },

    async hasProcessedEvent(tenantId, source, idempotencyKey) {
      return processed.has(eventKey(tenantId, source, idempotencyKey));
    },

    async recordProcessedEvent(input) {
      processed.add(
        eventKey(input.tenantId, input.source, input.idempotencyKey),
      );
    },

    async getPlan(tenantId, slug) {
      return plans.get(planKey(tenantId, slug)) ?? null;
    },

    async listPlans(tenantId) {
      return [...plans.values()]
        .filter((p) => p.tenantId === tenantId)
        .sort((a, b) => a.slug.localeCompare(b.slug));
    },

    async upsertPlan(input) {
      const now = new Date();
      const key = planKey(input.tenantId, input.slug);
      const existing = plans.get(key);
      const record: PlanRecord = {
        id: existing?.id ?? createId(),
        tenantId: input.tenantId,
        slug: input.slug,
        features: input.features,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      plans.set(key, record);
      return record;
    },

    async deletePlan(tenantId, slug) {
      return plans.delete(planKey(tenantId, slug));
    },

    async getOverride(tenantId, subjectId, feature) {
      return overrides.get(overrideKey(tenantId, subjectId, feature)) ?? null;
    },

    async listOverrides(tenantId, subjectId) {
      return [...overrides.values()].filter(
        (o) => o.tenantId === tenantId && o.subjectId === subjectId,
      );
    },

    async setOverride(input) {
      const key = overrideKey(input.tenantId, input.subjectId, input.feature);
      const existing = overrides.get(key);
      const record: OverrideRecord = {
        id: existing?.id ?? createId(),
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        feature: input.feature,
        value: input.value,
      };
      overrides.set(key, record);
      return record;
    },

    async clearOverride(tenantId, subjectId, feature) {
      return overrides.delete(overrideKey(tenantId, subjectId, feature));
    },

    async listAliases(tenantId, subjectId) {
      return aliases.filter(
        (a) => a.tenantId === tenantId && a.subjectId === subjectId,
      );
    },

    async removeAlias(tenantId, kind, value) {
      const idx = aliases.findIndex(
        (a) =>
          a.tenantId === tenantId && a.kind === kind && a.value === value,
      );
      if (idx < 0) return false;
      aliases.splice(idx, 1);
      return true;
    },
  };
}
