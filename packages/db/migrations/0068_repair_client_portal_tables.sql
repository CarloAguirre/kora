-- Forward-only repair: rellena tablas de portal omitidas por salto del watermark de Drizzle.
-- Es idempotente: preserva registros y restricciones ya existentes y no cambia la vista PMO.
CREATE TABLE IF NOT EXISTS "client_portal_accounts" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "contact_id" uuid NOT NULL UNIQUE REFERENCES "client_contacts"("id") ON DELETE cascade,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_portal_accounts_client_idx" ON "client_portal_accounts" ("client_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_portal_project_grants" (
  "user_id" uuid NOT NULL REFERENCES "client_portal_accounts"("user_id") ON DELETE cascade,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "client_portal_project_grants_pk" PRIMARY KEY ("user_id", "project_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_portal_project_grants_project_idx" ON "client_portal_project_grants" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_portal_support_grants" (
  "user_id" uuid NOT NULL REFERENCES "client_portal_accounts"("user_id") ON DELETE cascade,
  "plan_id" uuid NOT NULL REFERENCES "support_plans"("id") ON DELETE cascade,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "client_portal_support_grants_pk" PRIMARY KEY ("user_id", "plan_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_portal_support_grants_plan_idx" ON "client_portal_support_grants" ("plan_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_portal_delivery_receipts" (
  "delivery_id" uuid PRIMARY KEY NOT NULL REFERENCES "project_module_deliveries"("id") ON DELETE cascade,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "received_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "received_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_portal_delivery_receipts_project_idx" ON "client_portal_delivery_receipts" ("project_id");

--> statement-breakpoint
-- Si se encontraron tablas creadas parcialmente, no marcar la reparación como
-- aplicada sin el contrato mínimo del portal: interrumpir y revisar esa BD.
DO $portal_guard$
DECLARE missing text;
BEGIN
  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO missing
  FROM (VALUES
    ('client_portal_accounts', 'user_id'),
    ('client_portal_accounts', 'client_id'),
    ('client_portal_accounts', 'contact_id'),
    ('client_portal_accounts', 'enabled'),
    ('client_portal_project_grants', 'user_id'),
    ('client_portal_project_grants', 'project_id'),
    ('client_portal_support_grants', 'user_id'),
    ('client_portal_support_grants', 'plan_id'),
    ('client_portal_delivery_receipts', 'delivery_id'),
    ('client_portal_delivery_receipts', 'project_id'),
    ('client_portal_delivery_receipts', 'client_id'),
    ('client_portal_delivery_receipts', 'received_by_user_id'),
    ('client_portal_delivery_receipts', 'received_at')
  ) AS required(table_name,column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS actual
    WHERE actual.table_schema = 'public' AND actual.table_name = required.table_name
      AND actual.column_name = required.column_name
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Inconsistent portal schema: missing columns %', missing;
  END IF;
END $portal_guard$;
