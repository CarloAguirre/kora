CREATE TYPE "public"."project_payment_status" AS ENUM('pending', 'invoiced', 'paid');--> statement-breakpoint
CREATE TABLE "project_payment_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"invoice_number" varchar(50),
	"issued_at" date,
	"status" "project_payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "period_report_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "period_report_achievements" text[];--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD CONSTRAINT "project_payment_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;