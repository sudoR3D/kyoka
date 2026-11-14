-- Kyoka schema (MVP). tenant_id is '' for single-tenant embed.
-- Canonical copy also embedded in adapter/migrate.ts (INIT_SQL) for runtime.

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
