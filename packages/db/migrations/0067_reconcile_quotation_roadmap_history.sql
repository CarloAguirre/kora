-- Forward-only repair: older feature migrations may have been skipped after
-- billing migrations advanced Drizzle's timestamp watermark. Keep history intact.
CREATE TABLE IF NOT EXISTS "project_quotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_quotations_project_key"
  ON "project_quotations" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotation_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "quotation_id" uuid NOT NULL REFERENCES "project_quotations"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "name" varchar(200) NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "origin" varchar(20) DEFAULT 'manual' NOT NULL,
  "ai_review_status" varchar(20),
  "revision" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "edited_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "hourly_rate" numeric(16,4),
  "currency" varchar(3) DEFAULT 'UF' NOT NULL,
  "tax" varchar(10) DEFAULT 'iva19' NOT NULL,
  "draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "total_hours" numeric(14,2) DEFAULT '0' NOT NULL,
  "net_amount" numeric(18,4),
  "total_amount" numeric(18,4),
  "sent_at" timestamptz,
  "approved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "quotation_versions_status_chk" CHECK ("status" IN ('draft','sent','approved')),
  CONSTRAINT "quotation_versions_origin_chk" CHECK ("origin" IN ('manual','copy','ai')),
  CONSTRAINT "quotation_versions_ai_review_chk" CHECK ("ai_review_status" IS NULL OR "ai_review_status" IN ('pending','accepted')),
  CONSTRAINT "quotation_versions_revision_chk" CHECK ("revision" >= 1),
  CONSTRAINT "quotation_versions_number_chk" CHECK ("version_number" >= 1),
  CONSTRAINT "quotation_versions_rate_chk" CHECK ("hourly_rate" IS NULL OR "hourly_rate" >= 0),
  CONSTRAINT "quotation_versions_total_hours_chk" CHECK ("total_hours" >= 0),
  CONSTRAINT "quotation_versions_net_chk" CHECK ("net_amount" IS NULL OR "net_amount" >= 0),
  CONSTRAINT "quotation_versions_total_chk" CHECK ("total_amount" IS NULL OR "total_amount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotation_versions_number_key"
  ON "quotation_versions" ("quotation_id", "version_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotation_versions_status_idx"
  ON "quotation_versions" ("quotation_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL REFERENCES "quotation_versions"("id") ON DELETE CASCADE,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(40) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotation_events_version_idx"
  ON "quotation_events" ("version_id", "occurred_at");
--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD COLUMN IF NOT EXISTS "trigger_module_id" uuid;
--> statement-breakpoint
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'project_payment_milestones'::regclass
      AND conname = 'project_payment_milestones_trigger_module_id_fk'
  ) THEN
    ALTER TABLE "project_payment_milestones"
      ADD CONSTRAINT "project_payment_milestones_trigger_module_id_fk"
      FOREIGN KEY ("trigger_module_id") REFERENCES "project_modules"("id") ON DELETE SET NULL;
  END IF;
END $guard$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_payment_milestones_trigger_module_idx"
  ON "project_payment_milestones" ("trigger_module_id");
--> statement-breakpoint
ALTER TABLE "project_module_segments"
  ADD COLUMN IF NOT EXISTS "estimated_hours" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "closed_at" timestamptz;
--> statement-breakpoint
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'project_module_segments'::regclass
      AND conname = 'project_module_segments_estimated_hours_positive'
  ) THEN
    ALTER TABLE "project_module_segments"
      ADD CONSTRAINT "project_module_segments_estimated_hours_positive"
      CHECK ("estimated_hours" IS NULL OR "estimated_hours" > 0);
  END IF;
END $guard$;
--> statement-breakpoint
ALTER TABLE "project_module_deliveries" ADD COLUMN IF NOT EXISTS "segment_id" uuid;
--> statement-breakpoint
ALTER TABLE "project_module_tasks" ADD COLUMN IF NOT EXISTS "segment_id" uuid;
--> statement-breakpoint
DO $guard$
DECLARE
  source_table text;
  existing_action "char";
BEGIN
  FOREACH source_table IN ARRAY ARRAY['project_module_deliveries', 'project_module_tasks']
  LOOP
    SELECT con.confdeltype INTO existing_action
    FROM pg_constraint con
    JOIN pg_attribute attr ON attr.attrelid = con.conrelid AND attr.attname = 'segment_id'
    WHERE con.conrelid = source_table::regclass
      AND con.confrelid = 'project_module_segments'::regclass
      AND con.contype = 'f' AND con.conkey = ARRAY[attr.attnum]::smallint[]
    LIMIT 1;
    IF existing_action IS NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (segment_id) REFERENCES project_module_segments(id) ON DELETE SET NULL',
        source_table, source_table || '_segment_id_project_module_segments_id_fk'
      );
    ELSIF existing_action <> 'n' THEN
      RAISE EXCEPTION '%.segment_id: expected ON DELETE SET NULL', source_table;
    END IF;
  END LOOP;
END $guard$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_module_deliveries_one_closure_per_segment"
  ON "project_module_deliveries" ("segment_id") WHERE "segment_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_module_tasks_segment_idx" ON "project_module_tasks" ("segment_id");
--> statement-breakpoint
-- Preserve the original migration's exact-match historical attribution, but do
-- not run that backfill again on databases where it already ran successfully.
DO $backfill$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = 1793822400000
  ) THEN
    WITH parsed AS (
      SELECT t.id AS task_id,
        (substring(t.description FROM 'Bloque de trabajo: [^[:cntrl:]]* · ID ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'))::uuid AS target_id
      FROM "project_module_tasks" t
      WHERE t.description ~ 'Bloque de trabajo: [^[:cntrl:]]* · ID [0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
    )
    UPDATE "project_module_tasks" t SET "segment_id" = s.id
    FROM parsed p JOIN "project_module_segments" s ON s.id = p.target_id
    WHERE t.id = p.task_id AND t.module_id = s.module_id AND t.team_id = s.team_id
      AND t.segment_id IS NULL;

    WITH candidates AS (
      SELECT d.id AS delivery_id, MIN(s.id::text)::uuid AS segment_id, COUNT(*) AS matches
      FROM "project_module_deliveries" d
      JOIN "project_module_segments" s ON s.module_id = d.module_id
        AND s.team_id = d.team_id AND s.end_date = d.estimated_date
      GROUP BY d.id
    ), unique_deliveries AS (
      SELECT d.id FROM "project_module_deliveries" d
      WHERE d.team_id IS NOT NULL
        AND (SELECT COUNT(*) FROM "project_module_deliveries" d2
          WHERE d2.module_id = d.module_id AND d2.team_id = d.team_id
            AND d2.estimated_date = d.estimated_date) = 1
    )
    UPDATE "project_module_deliveries" d SET "segment_id" = c.segment_id
    FROM candidates c JOIN unique_deliveries u ON u.id = c.delivery_id
    WHERE d.id = c.delivery_id AND c.matches = 1 AND d.segment_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "project_module_deliveries" linked WHERE linked.segment_id = c.segment_id
      );

    WITH unambiguous AS (
      SELECT t.id AS task_id, MIN(s.id::text)::uuid AS segment_id
      FROM "project_module_tasks" t
      JOIN "project_module_segments" s ON s.module_id = t.module_id
        AND s.team_id = t.team_id AND t.start_date >= s.start_date AND t.date <= s.end_date
      WHERE t.segment_id IS NULL
      GROUP BY t.id HAVING COUNT(*) = 1
    )
    UPDATE "project_module_tasks" t SET "segment_id" = u.segment_id
    FROM unambiguous u WHERE t.id = u.task_id AND t.segment_id IS NULL;

    WITH approved AS (
      SELECT segment_id, MAX(completed_at) AS actual_close, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'done' AND completed_at IS NOT NULL) AS accepted
      FROM "project_module_tasks" WHERE segment_id IS NOT NULL GROUP BY segment_id
    )
    UPDATE "project_module_segments" s SET closed_at = a.actual_close
    FROM approved a WHERE s.id = a.segment_id AND a.total > 0
      AND a.total = a.accepted AND s.closed_at IS NULL;
  END IF;
END $backfill$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_roadmap_reference_exclusions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "module_id" uuid NOT NULL REFERENCES "project_modules"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL,
  "wbs" varchar(160) NOT NULL,
  "role" varchar(160) NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roadmap_ref_exclusion_identity_key"
  ON "project_roadmap_reference_exclusions" ("module_id", "version_id", "wbs", "role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roadmap_ref_exclusion_project_idx"
  ON "project_roadmap_reference_exclusions" ("project_id");
--> statement-breakpoint
ALTER TABLE "project_team_members" ADD COLUMN IF NOT EXISTS "blocked_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "project_module_tasks" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "hour_entries"
  ADD COLUMN IF NOT EXISTS "segment_id" uuid REFERENCES "project_module_segments"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "task_id" uuid REFERENCES "project_module_tasks"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hour_entries_segment_status_idx"
  ON "hour_entries" ("segment_id", "status") WHERE "segment_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hour_entries_task_approved_idx"
  ON "hour_entries" ("task_id") WHERE "task_id" IS NOT NULL AND "status" = 'approved';
--> statement-breakpoint
ALTER TABLE "project_module_deliveries"
  ADD COLUMN IF NOT EXISTS "completed_on" date,
  ADD COLUMN IF NOT EXISTS "completed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "completion_comment" text;
