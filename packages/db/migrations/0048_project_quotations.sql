CREATE TABLE "project_quotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_quotations_project_key" ON "project_quotations" USING btree ("project_id");
--> statement-breakpoint
ALTER TABLE "project_quotations" ADD CONSTRAINT "project_quotations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_quotations" ADD CONSTRAINT "project_quotations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "quotation_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "quotation_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "name" varchar(200) NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "origin" varchar(20) DEFAULT 'manual' NOT NULL,
  "ai_review_status" varchar(20),
  "revision" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "edited_by_user_id" uuid,
  "hourly_rate" numeric(16,4),
  "currency" varchar(3) DEFAULT 'UF' NOT NULL,
  "tax" varchar(10) DEFAULT 'iva19' NOT NULL,
  "draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "total_hours" numeric(14,2) DEFAULT '0' NOT NULL,
  "net_amount" numeric(18,4),
  "total_amount" numeric(18,4),
  "sent_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
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
CREATE UNIQUE INDEX "quotation_versions_number_key" ON "quotation_versions" USING btree ("quotation_id","version_number");
--> statement-breakpoint
CREATE INDEX "quotation_versions_status_idx" ON "quotation_versions" USING btree ("quotation_id","status");
--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotation_id_project_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."project_quotations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "quotation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "action" varchar(40) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "quotation_events_version_idx" ON "quotation_events" USING btree ("version_id","occurred_at");
--> statement-breakpoint
ALTER TABLE "quotation_events" ADD CONSTRAINT "quotation_events_version_id_quotation_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotation_events" ADD CONSTRAINT "quotation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
