\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE reconciliation_before (
  table_name text PRIMARY KEY,
  fingerprint text NOT NULL
);

-- Ignore only the nullable links populated by the original roadmap backfill and
-- the newly introduced fields. Existing financial, identity and status data must
-- remain byte-for-byte equivalent on every pre-existing public table.
CREATE FUNCTION pg_temp.reconciliation_fingerprint(source_table text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  ignored text[] := ARRAY[]::text[];
  result text;
BEGIN
  CASE source_table
    WHEN 'project_module_tasks' THEN ignored := ARRAY['segment_id', 'cancelled_at'];
    WHEN 'project_module_deliveries' THEN ignored := ARRAY['segment_id', 'completed_on', 'completed_by_user_id', 'completion_comment'];
    WHEN 'project_module_segments' THEN ignored := ARRAY['closed_at', 'estimated_hours'];
    WHEN 'project_team_members' THEN ignored := ARRAY['blocked_at'];
    WHEN 'project_payment_milestones' THEN ignored := ARRAY['trigger_module_id'];
    WHEN 'hour_entries' THEN ignored := ARRAY['segment_id', 'task_id'];
    ELSE NULL;
  END CASE;
  EXECUTE format(
    'SELECT md5(coalesce(string_agg(value, E''\n'' ORDER BY value), '''')) FROM (SELECT (to_jsonb(t) - $1)::text AS value FROM public.%I t) rows',
    source_table
  ) INTO result USING ignored;
  RETURN result;
END $$;

INSERT INTO reconciliation_before
SELECT tablename, pg_temp.reconciliation_fingerprint(tablename)
FROM pg_tables WHERE schemaname = 'public';

CREATE TEMP TABLE migration_history_before AS TABLE drizzle.__drizzle_migrations;

\ir ../migrations/0067_reconcile_quotation_roadmap_history.sql

DO $assert$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ') INTO missing
  FROM (VALUES
    ('hour_entries', 'segment_id'), ('hour_entries', 'task_id'),
    ('project_team_members', 'blocked_at'), ('project_module_tasks', 'cancelled_at'),
    ('project_module_tasks', 'segment_id'), ('project_module_segments', 'closed_at'),
    ('project_module_segments', 'estimated_hours'),
    ('project_module_deliveries', 'segment_id'), ('project_module_deliveries', 'completed_on'),
    ('project_module_deliveries', 'completed_by_user_id'), ('project_module_deliveries', 'completion_comment'),
    ('project_payment_milestones', 'trigger_module_id')
  ) expected(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = expected.table_name AND c.column_name = expected.column_name
  );
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Missing columns: %', missing; END IF;
  IF to_regclass('project_quotations') IS NULL OR to_regclass('quotation_versions') IS NULL
    OR to_regclass('quotation_events') IS NULL OR to_regclass('project_roadmap_reference_exclusions') IS NULL
  THEN RAISE EXCEPTION 'Missing quotation/roadmap tables'; END IF;

  SELECT string_agg(table_name, ', ') INTO missing FROM reconciliation_before b
  WHERE b.fingerprint <> pg_temp.reconciliation_fingerprint(b.table_name);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Existing data changed: %', missing; END IF;

  IF EXISTS ((TABLE migration_history_before EXCEPT TABLE drizzle.__drizzle_migrations)
    UNION ALL (TABLE drizzle.__drizzle_migrations EXCEPT TABLE migration_history_before))
  THEN RAISE EXCEPTION 'Historical migration rows were changed'; END IF;
END $assert$;

-- A second application must not change even the newly populated links.
CREATE TEMP TABLE reconciliation_once AS
SELECT tablename, md5(query_to_xml(format('SELECT * FROM public.%I ORDER BY id', tablename), false, true, '')::text) AS fingerprint
FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
  'project_module_tasks', 'project_module_segments', 'project_module_deliveries',
  'hour_entries', 'project_payment_milestones'
);

\ir ../migrations/0067_reconcile_quotation_roadmap_history.sql

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1 FROM reconciliation_once b
    WHERE b.fingerprint <> md5(query_to_xml(format('SELECT * FROM public.%I ORDER BY id', b.tablename), false, true, '')::text)
  ) THEN RAISE EXCEPTION 'Reapplication changed operational data'; END IF;
END $assert$;

ROLLBACK;
\echo 'PASS: missing schema repaired; existing records and migration history preserved; repeat application unchanged.'
