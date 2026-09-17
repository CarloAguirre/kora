CREATE TYPE "public"."support_plan_scope" AS ENUM('single', 'consolidated');--> statement-breakpoint
CREATE TABLE "support_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"period_key" varchar(7) NOT NULL,
	"amount_uf" numeric(12, 2) NOT NULL,
	"hours_billed" numeric(10, 2),
	"folio" varchar(50) NOT NULL,
	"invoiced_at" date NOT NULL,
	"due_at" date,
	"paid_at" date,
	"attachment_name" text,
	"monthly_period_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_plan_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"development_project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_monthly_periods" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "support_plans" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "scope" "support_plan_scope" DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "leader_user_id" uuid;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "primary_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "quotation_link" text;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "contract_link" text;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "additional_links" text;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "due_day_of_month" integer;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "target_hours_critical" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "target_hours_high" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "target_hours_medium" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "target_hours_low" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "closed_at" date;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "close_reason" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "support_invoices" ADD CONSTRAINT "support_invoices_plan_id_support_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."support_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_invoices" ADD CONSTRAINT "support_invoices_monthly_period_id_support_monthly_periods_id_fk" FOREIGN KEY ("monthly_period_id") REFERENCES "public"."support_monthly_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_plan_projects" ADD CONSTRAINT "support_plan_projects_plan_id_support_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."support_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_plan_projects" ADD CONSTRAINT "support_plan_projects_development_project_id_projects_id_fk" FOREIGN KEY ("development_project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_invoices_plan_period_key" ON "support_invoices" USING btree ("plan_id","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "support_plan_projects_plan_project_key" ON "support_plan_projects" USING btree ("plan_id","development_project_id");--> statement-breakpoint
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_leader_user_id_users_id_fk" FOREIGN KEY ("leader_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_invoice_id_support_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."support_invoices"("id") ON DELETE set null ON UPDATE no action;