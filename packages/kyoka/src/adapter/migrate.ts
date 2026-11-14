import type { Pool } from "pg";

const MIGRATION_ID = "001_init";

/** Keep in sync with src/migrations/001_init.sql */
export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS kyoka_subject (
  id text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT '',
  plan_slug text NOT NULL,
  status text NOT NULL,
  period_ends_at timestamptz NULL,
  grace_ends_at timestamptz NULL,
  trial_ends_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kyoka_subject_tenant_id_idx
  ON kyoka_subject (tenant_id, id);
CREATE INDEX IF NOT EXISTS kyoka_subject_tenant_plan_idx
  ON kyoka_subject (tenant_id, plan_slug);

CREATE TABLE IF NOT EXISTS kyoka_alias (
  id text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT '',
  subject_id text NOT NULL REFERENCES kyoka_subject (id) ON DELETE CASCADE,
  kind text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, value)
);

CREATE INDEX IF NOT EXISTS kyoka_alias_tenant_value_idx
  ON kyoka_alias (tenant_id, value);

CREATE TABLE IF NOT EXISTS kyoka_plan (
  id text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT '',
  slug text NOT NULL,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS kyoka_override (
  id text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT '',
  subject_id text NOT NULL REFERENCES kyoka_subject (id) ON DELETE CASCADE,
  feature text NOT NULL,
  value jsonb NOT NULL,
  UNIQUE (tenant_id, subject_id, feature)
);

CREATE TABLE IF NOT EXISTS kyoka_processed_event (
  id text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  source text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source, idempotency_key)
);

CREATE TABLE IF NOT EXISTS kyoka_schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

export async function runPgMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyoka_schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM kyoka_schema_migrations WHERE id = $1`,
    [MIGRATION_ID],
  );
  if ((existing.rowCount ?? 0) > 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(INIT_SQL);
    await client.query(
      `INSERT INTO kyoka_schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [MIGRATION_ID],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
