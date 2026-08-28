CREATE TYPE "public"."participation_type" AS ENUM('team', 'project_leader');--> statement-breakpoint
CREATE TYPE "public"."project_phase" AS ENUM('discovery', 'development', 'testing', 'pilot', 'closed');--> statement-breakpoint
CREATE TYPE "public"."project_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."project_sales_stage" AS ENUM('prospect', 'quoted', 'approved');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'active', 'on_hold', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('development', 'support');--> statement-breakpoint
CREATE TABLE "project_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"message" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_participation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"team_id" uuid,
	"participation_type" "participation_type" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"project_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"activity" text,
	"assigned_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"consumed_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"project_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"leader_user_id" uuid,
	"assigned_hours" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" integer,
	"name" varchar(300) NOT NULL,
	"client_id" uuid,
	"primary_contact_id" uuid,
	"type" "project_type" NOT NULL,
	"sales_stage" "project_sales_stage",
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"phase" "project_phase",
	"priority" "project_priority",
	"leader_user_id" uuid,
	"developer_user_id" uuid,
	"commercial_manager_user_id" uuid,
	"start_date" date,
	"end_date" date,
	"estimated_delivery_date" date,
	"sold_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"used_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"expected_progress" integer,
	"actual_progress" integer,
	"support_plan_description" text,
	"support_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"overtime_rate_uf" numeric(10, 4) DEFAULT '0' NOT NULL,
	"quotation_link" text,
	"contract_link" text,
	"additional_links" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_participation_history" ADD CONSTRAINT "project_participation_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_participation_history" ADD CONSTRAINT "project_participation_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_participation_history" ADD CONSTRAINT "project_participation_history_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_leader_user_id_users_id_fk" FOREIGN KEY ("leader_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_leader_user_id_users_id_fk" FOREIGN KEY ("leader_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_user_id_users_id_fk" FOREIGN KEY ("developer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_commercial_manager_user_id_users_id_fk" FOREIGN KEY ("commercial_manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_team_members_legacy_id_key" ON "project_team_members" USING btree ("legacy_id") WHERE "project_team_members"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "project_teams_project_team_key" ON "project_teams" USING btree ("project_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_teams_legacy_id_key" ON "project_teams" USING btree ("legacy_id") WHERE "project_teams"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_legacy_id_key" ON "projects" USING btree ("legacy_id") WHERE "projects"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_client_name_key" ON "projects" USING btree (coalesce("client_id"::text, '-'),lower(btrim("name"))) WHERE "projects"."deleted_at" is null;