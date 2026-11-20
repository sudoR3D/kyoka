import pg from "pg";
import type {
  AliasRecord,
  FeatureRule,
  KyokaDatabase,
  OverrideRecord,
  PlanRecord,
  SubjectRecord,
  SubjectStatus,
} from "../types.js";
import { AliasConflictError, SubjectNotFoundError } from "../errors.js";
import { createId } from "../ids.js";
import { runPgMigrations } from "./migrate.js";

const { Pool } = pg;

export type PgAdapterOptions =
  | string
  | pg.Pool
  | {
      connectionString?: string;
      pool?: pg.Pool;
    };

function isPool(value: unknown): value is pg.Pool {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as pg.Pool).query === "function" &&
    typeof (value as pg.Pool).connect === "function"
  );
}

function resolvePool(options: PgAdapterOptions): pg.Pool {
  if (typeof options === "string") {
    return new Pool({ connectionString: options });
  }
  if (isPool(options)) {
    return options;
  }
  if (options.pool) return options.pool;
  if (options.connectionString) {
    return new Pool({ connectionString: options.connectionString });
  }
  throw new Error("Kyoka pgAdapter: provide connectionString or pool");
}

async function verifyAliases(
  client: pg.PoolClient,
  tenantId: string,
  subjectId: string,
  aliases: Array<{ kind: string; value: string }>,
): Promise<void> {
  for (const alias of aliases) {
    const res = await client.query(
      `SELECT subject_id FROM kyoka_alias
       WHERE tenant_id = $1 AND kind = $2 AND value = $3
       LIMIT 1`,
      [tenantId, alias.kind, alias.value],
    );
    const row = res.rows[0];
    if (!row || String(row.subject_id) !== subjectId) {
      throw new AliasConflictError();
    }
  }
}

function mapSubject(row: Record<string, unknown>): SubjectRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? ""),
    planSlug: String(row.plan_slug),
    status: String(row.status) as SubjectStatus,
    periodEndsAt: row.period_ends_at ? new Date(String(row.period_ends_at)) : null,
    graceEndsAt: row.grace_ends_at ? new Date(String(row.grace_ends_at)) : null,
    trialEndsAt: row.trial_ends_at ? new Date(String(row.trial_ends_at)) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapAlias(row: Record<string, unknown>): AliasRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? ""),
    subjectId: String(row.subject_id),
    kind: String(row.kind),
    value: String(row.value),
    createdAt: new Date(String(row.created_at)),
  };
}

function mapPlan(row: Record<string, unknown>): PlanRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? ""),
    slug: String(row.slug),
    features: (row.features ?? {}) as Record<string, FeatureRule>,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapOverride(row: Record<string, unknown>): OverrideRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? ""),
    subjectId: String(row.subject_id),
    feature: String(row.feature),
    value: (row.value ?? {}) as FeatureRule,
  };
}

export function pgAdapter(options: PgAdapterOptions): KyokaDatabase {
  const pool = resolvePool(options);

  return {
    async migrate() {
      await runPgMigrations(pool);
    },

    async getSubjectById(tenantId, id) {
      const res = await pool.query(
        `SELECT * FROM kyoka_subject WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id],
      );
      const row = res.rows[0];
      return row ? mapSubject(row) : null;
    },

    async findAlias(tenantId, value, kind?) {
      if (kind) {
        const res = await pool.query(
          `SELECT * FROM kyoka_alias
           WHERE tenant_id = $1 AND kind = $2 AND value = $3
           LIMIT 1`,
          [tenantId, kind, value],
        );
        const row = res.rows[0];
        return row ? mapAlias(row) : null;
      }
      const res = await pool.query(
        `SELECT * FROM kyoka_alias
         WHERE tenant_id = $1 AND value = $2
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId, value],
      );
      const row = res.rows[0];
      return row ? mapAlias(row) : null;
    },

    async createSubjectWithAlias(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const now = new Date();
        await client.query(
          `INSERT INTO kyoka_subject
            (id, tenant_id, plan_slug, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)`,
          [input.subjectId, input.tenantId, input.planSlug, input.status, now],
        );
        await client.query(
          `INSERT INTO kyoka_alias
            (id, tenant_id, subject_id, kind, value, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            createId(),
            input.tenantId,
            input.subjectId,
            input.aliasKind,
            input.aliasValue,
            now,
          ],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      const loaded = await pool.query(
        `SELECT * FROM kyoka_subject WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [input.tenantId, input.subjectId],
      );
      const row = loaded.rows[0];
      if (!row) throw new Error("Kyoka: failed to load created subject");
      return mapSubject(row);
    },

    async ensureSubject(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const matching: Array<Record<string, unknown>> = [];
        for (const alias of input.aliases) {
          const res = await client.query(
            `SELECT * FROM kyoka_alias
             WHERE tenant_id = $1 AND kind = $2 AND value = $3
             FOR UPDATE`,
            [input.tenantId, alias.kind, alias.value],
          );
          const row = res.rows[0];
          if (row) matching.push(row);
        }

        const subjectIds = new Set(
          matching.map((row) => String(row.subject_id)),
        );
        if (subjectIds.size > 1) {
          throw new AliasConflictError();
        }

        if (subjectIds.size === 1) {
          const subjectId = [...subjectIds][0]!;
          const loaded = await client.query(
            `SELECT * FROM kyoka_subject
             WHERE tenant_id = $1 AND id = $2
             LIMIT 1`,
            [input.tenantId, subjectId],
          );
          const row = loaded.rows[0];
          if (!row) {
            throw new Error(
              `Kyoka: alias points to missing subject ${subjectId}`,
            );
          }

          const now = new Date();
          for (const alias of input.aliases) {
            await client.query(
              `INSERT INTO kyoka_alias
                (id, tenant_id, subject_id, kind, value, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (tenant_id, kind, value) DO NOTHING`,
              [
                createId(),
                input.tenantId,
                subjectId,
                alias.kind,
                alias.value,
                now,
              ],
            );
          }
          await verifyAliases(
            client,
            input.tenantId,
            subjectId,
            input.aliases,
          );
          await client.query("COMMIT");
          return { subject: mapSubject(row), created: false };
        }

        const now = new Date();
        const created = await client.query(
          `INSERT INTO kyoka_subject
            (id, tenant_id, plan_slug, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)
           RETURNING *`,
          [
            input.subjectId,
            input.tenantId,
            input.planSlug,
            input.status,
            now,
          ],
        );

        for (const alias of input.aliases) {
          await client.query(
            `INSERT INTO kyoka_alias
              (id, tenant_id, subject_id, kind, value, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, kind, value) DO NOTHING`,
            [
              createId(),
              input.tenantId,
              input.subjectId,
              alias.kind,
              alias.value,
              now,
            ],
          );
        }
        await verifyAliases(
          client,
          input.tenantId,
          input.subjectId,
          input.aliases,
        );
        await client.query("COMMIT");
        return { subject: mapSubject(created.rows[0]!), created: true };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The connection may already be aborted.
        }
        throw err;
      } finally {
        client.release();
      }
    },

    async linkAliases(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const subject = await client.query(
          `SELECT id FROM kyoka_subject
           WHERE tenant_id = $1 AND id = $2
           LIMIT 1`,
          [input.tenantId, input.subjectId],
        );
        if (!subject.rows[0]) {
          throw new SubjectNotFoundError();
        }

        const records: AliasRecord[] = [];
        for (const alias of input.aliases) {
          const existing = await client.query(
            `SELECT * FROM kyoka_alias
             WHERE tenant_id = $1 AND kind = $2 AND value = $3
             FOR UPDATE`,
            [input.tenantId, alias.kind, alias.value],
          );
          const found = existing.rows[0];
          if (found) {
            if (String(found.subject_id) !== input.subjectId) {
              throw new AliasConflictError();
            }
            records.push(mapAlias(found));
            continue;
          }

          const now = new Date();
          await client.query(
            `INSERT INTO kyoka_alias
              (id, tenant_id, subject_id, kind, value, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, kind, value) DO NOTHING`,
            [
              createId(),
              input.tenantId,
              input.subjectId,
              alias.kind,
              alias.value,
              now,
            ],
          );
          const after = await client.query(
            `SELECT * FROM kyoka_alias
             WHERE tenant_id = $1 AND kind = $2 AND value = $3
             LIMIT 1`,
            [input.tenantId, alias.kind, alias.value],
          );
          const row = after.rows[0];
          if (!row || String(row.subject_id) !== input.subjectId) {
            throw new AliasConflictError();
          }
          records.push(mapAlias(row));
        }

        await client.query("COMMIT");
        return records;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The connection may already be aborted.
        }
        throw err;
      } finally {
        client.release();
      }
    },

    async getPlan(tenantId, slug) {
      const res = await pool.query(
        `SELECT * FROM kyoka_plan WHERE tenant_id = $1 AND slug = $2 LIMIT 1`,
        [tenantId, slug],
      );
      const row = res.rows[0];
      return row ? mapPlan(row) : null;
    },

    async listPlans(tenantId) {
      const res = await pool.query(
        `SELECT * FROM kyoka_plan WHERE tenant_id = $1 ORDER BY slug ASC`,
        [tenantId],
      );
      return res.rows.map(mapPlan);
    },

    async getOverride(tenantId, subjectId, feature) {
      const res = await pool.query(
        `SELECT * FROM kyoka_override
         WHERE tenant_id = $1 AND subject_id = $2 AND feature = $3
         LIMIT 1`,
        [tenantId, subjectId, feature],
      );
      const row = res.rows[0];
      return row ? mapOverride(row) : null;
    },

    async addAlias(input) {
      const existing = await pool.query(
        `SELECT * FROM kyoka_alias
         WHERE tenant_id = $1 AND kind = $2 AND value = $3
         LIMIT 1`,
        [input.tenantId, input.kind, input.value],
      );
      const found = existing.rows[0];
      if (found) {
        const mapped = mapAlias(found);
        if (mapped.subjectId !== input.subjectId) {
          throw new Error(
            `Kyoka: alias ${input.kind}:${input.value} belongs to another subject`,
          );
        }
        return mapped;
      }
      const id = createId();
      const now = new Date();
      await pool.query(
        `INSERT INTO kyoka_alias
          (id, tenant_id, subject_id, kind, value, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, input.tenantId, input.subjectId, input.kind, input.value, now],
      );
      return {
        id,
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        kind: input.kind,
        value: input.value,
        createdAt: now,
      };
    },

    async updateSubjectBilling(tenantId, subjectId, update) {
      const sets: string[] = ["updated_at = now()"];
      const params: unknown[] = [tenantId, subjectId];
      let i = 3;

      if (update.planSlug !== undefined) {
        sets.push(`plan_slug = $${i++}`);
        params.push(update.planSlug);
      }
      if (update.status !== undefined) {
        sets.push(`status = $${i++}`);
        params.push(update.status);
      }
      if (update.periodEndsAt !== undefined) {
        sets.push(`period_ends_at = $${i++}`);
        params.push(update.periodEndsAt);
      }
      if (update.graceEndsAt !== undefined) {
        sets.push(`grace_ends_at = $${i++}`);
        params.push(update.graceEndsAt);
      }
      if (update.trialEndsAt !== undefined) {
        sets.push(`trial_ends_at = $${i++}`);
        params.push(update.trialEndsAt);
      }

      const res = await pool.query(
        `UPDATE kyoka_subject SET ${sets.join(", ")}
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        params,
      );
      const row = res.rows[0];
      if (!row) throw new Error("Kyoka: subject not found for billing update");
      return mapSubject(row);
    },

    async hasProcessedEvent(tenantId, source, idempotencyKey) {
      const res = await pool.query(
        `SELECT 1 FROM kyoka_processed_event
         WHERE tenant_id = $1 AND source = $2 AND idempotency_key = $3
         LIMIT 1`,
        [tenantId, source, idempotencyKey],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async recordProcessedEvent(input) {
      await pool.query(
        `INSERT INTO kyoka_processed_event
          (id, tenant_id, source, idempotency_key, processed_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (tenant_id, source, idempotency_key) DO NOTHING`,
        [
          createId(),
          input.tenantId,
          input.source,
          input.idempotencyKey,
        ],
      );
    },

    async upsertPlan(input) {
      const existing = await pool.query(
        `SELECT * FROM kyoka_plan WHERE tenant_id = $1 AND slug = $2 LIMIT 1`,
        [input.tenantId, input.slug],
      );
      const found = existing.rows[0];
      if (found) {
        const res = await pool.query(
          `UPDATE kyoka_plan
           SET features = $3::jsonb, updated_at = now()
           WHERE tenant_id = $1 AND slug = $2
           RETURNING *`,
          [input.tenantId, input.slug, JSON.stringify(input.features)],
        );
        return mapPlan(res.rows[0]!);
      }
      const id = createId();
      const res = await pool.query(
        `INSERT INTO kyoka_plan
          (id, tenant_id, slug, features, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, now(), now())
         RETURNING *`,
        [id, input.tenantId, input.slug, JSON.stringify(input.features)],
      );
      return mapPlan(res.rows[0]!);
    },

    async deletePlan(tenantId, slug) {
      const res = await pool.query(
        `DELETE FROM kyoka_plan WHERE tenant_id = $1 AND slug = $2`,
        [tenantId, slug],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async listOverrides(tenantId, subjectId) {
      const res = await pool.query(
        `SELECT * FROM kyoka_override
         WHERE tenant_id = $1 AND subject_id = $2
         ORDER BY feature ASC`,
        [tenantId, subjectId],
      );
      return res.rows.map(mapOverride);
    },

    async setOverride(input) {
      const existing = await pool.query(
        `SELECT * FROM kyoka_override
         WHERE tenant_id = $1 AND subject_id = $2 AND feature = $3
         LIMIT 1`,
        [input.tenantId, input.subjectId, input.feature],
      );
      const found = existing.rows[0];
      if (found) {
        const res = await pool.query(
          `UPDATE kyoka_override SET value = $4::jsonb
           WHERE tenant_id = $1 AND subject_id = $2 AND feature = $3
           RETURNING *`,
          [
            input.tenantId,
            input.subjectId,
            input.feature,
            JSON.stringify(input.value),
          ],
        );
        return mapOverride(res.rows[0]!);
      }
      const id = createId();
      const res = await pool.query(
        `INSERT INTO kyoka_override
          (id, tenant_id, subject_id, feature, value)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING *`,
        [
          id,
          input.tenantId,
          input.subjectId,
          input.feature,
          JSON.stringify(input.value),
        ],
      );
      return mapOverride(res.rows[0]!);
    },

    async clearOverride(tenantId, subjectId, feature) {
      const res = await pool.query(
        `DELETE FROM kyoka_override
         WHERE tenant_id = $1 AND subject_id = $2 AND feature = $3`,
        [tenantId, subjectId, feature],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async listAliases(tenantId, subjectId) {
      const res = await pool.query(
        `SELECT * FROM kyoka_alias
         WHERE tenant_id = $1 AND subject_id = $2
         ORDER BY created_at ASC`,
        [tenantId, subjectId],
      );
      return res.rows.map(mapAlias);
    },

    async removeAlias(tenantId, kind, value) {
      const res = await pool.query(
        `DELETE FROM kyoka_alias
         WHERE tenant_id = $1 AND kind = $2 AND value = $3`,
        [tenantId, kind, value],
      );
      return (res.rowCount ?? 0) > 0;
    },
  };
}
