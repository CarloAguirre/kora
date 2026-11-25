\set ON_ERROR_STOP on
-- EJECUTAR ÚNICAMENTE EN BASE DE TEST: prueba la reparación cuando 0063
-- quedó saltada por el watermark de migraciones. ROLLBACK restaura todo.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE portal_repair_history_before AS TABLE drizzle.__drizzle_migrations;

-- Simulación de una base actualizada a 0067 sin las tablas del portal.
DROP TABLE IF EXISTS "client_portal_delivery_receipts";
DROP TABLE IF EXISTS "client_portal_project_grants";
DROP TABLE IF EXISTS "client_portal_support_grants";
DROP TABLE IF EXISTS "client_portal_accounts";

DO $assert$
BEGIN
  IF to_regclass('public.client_portal_accounts') IS NOT NULL THEN
    RAISE EXCEPTION 'Test setup failed: portal table was not removed';
  END IF;
END $assert$;

\ir ../migrations/0068_repair_client_portal_tables.sql

DO $assert$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'client_portal_accounts', 'client_portal_project_grants',
    'client_portal_support_grants', 'client_portal_delivery_receipts'
  ] LOOP
    IF to_regclass('public.' || name) IS NULL THEN
      RAISE EXCEPTION 'Missing portal table after repair: %', name;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.client_portal_delivery_receipts'::regclass
      AND contype = 'p'
  ) THEN
    RAISE EXCEPTION 'Delivery receipts must preserve their primary key';
  END IF;
END $assert$;

-- Reaplicación sin pérdida de datos ni errores por "already exists".
\ir ../migrations/0068_repair_client_portal_tables.sql

DO $assert$
BEGIN
  IF EXISTS (
    (TABLE portal_repair_history_before EXCEPT TABLE drizzle.__drizzle_migrations)
    UNION ALL
    (TABLE drizzle.__drizzle_migrations EXCEPT TABLE portal_repair_history_before)
  ) THEN
    RAISE EXCEPTION 'Repair modified historic Drizzle migration entries';
  END IF;
END $assert$;

ROLLBACK;
\echo 'PASS: portal tables repaired after skipped 0063; second application is idempotent and migration history unchanged.'
