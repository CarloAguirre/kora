CREATE TYPE "public"."support_period_status" AS ENUM('active', 'expired', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."support_plan_status" AS ENUM('active', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."support_plan_type" AS ENUM('monthly', 'bundle', 'on_demand');--> statement-breakpoint
CREATE TYPE "public"."support_surplus_policy" AS ENUM('accumulate', 'expire');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."ticket_service_type" AS ENUM('incident', 'inquiry', 'improvement', 'bug');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('pending', 'in_progress', 'in_testing', 'done', 'closed');--> statement-breakpoint
CREATE TABLE "support_monthly_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"plan_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"surplus_policy" "support_surplus_policy" NOT NULL,
	"contracted_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"reused_balance_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"consumed_hours_start" numeric(10, 2) DEFAULT '0' NOT NULL,
	"consumed_hours_end" numeric(10, 2),
	"consumed_hours_period" numeric(10, 2) DEFAULT '0' NOT NULL,
	"surplus_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" "support_period_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"plan_type" "support_plan_type" NOT NULL,
	"surplus_policy" "support_surplus_policy",
	"status" "support_plan_status" DEFAULT 'active' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"contracted_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"plan_value_uf" numeric(12, 2) DEFAULT '0' NOT NULL,
	"extra_hour_value_uf" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_history_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" varchar(20),
	"client_id" uuid,
	"project_id" uuid,
	"development_project_id" uuid,
	"title" varchar(300) NOT NULL,
	"service_type" "ticket_service_type",
	"description" text,
	"evidence_url" text,
	"assignee_user_id" uuid,
	"priority" "ticket_priority",
	"estimated_hours" integer,
	"status" "ticket_status" DEFAULT 'pending' NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"used_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "support_monthly_periods" ADD CONSTRAINT "support_monthly_periods_plan_id_support_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."support_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_monthly_periods" ADD CONSTRAINT "support_monthly_periods_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_history_entries" ADD CONSTRAINT "ticket_history_entries_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_history_entries" ADD CONSTRAINT "ticket_history_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_development_project_id_projects_id_fk" FOREIGN KEY ("development_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_monthly_periods_legacy_id_key" ON "support_monthly_periods" USING btree ("legacy_id") WHERE "support_monthly_periods"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "support_plans_legacy_id_key" ON "support_plans" USING btree ("legacy_id") WHERE "support_plans"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_legacy_id_key" ON "tickets" USING btree ("legacy_id") WHERE "tickets"."legacy_id" is not null;