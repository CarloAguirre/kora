CREATE TYPE "public"."holiday_type" AS ENUM('national', 'regional', 'company');--> statement-breakpoint
CREATE TYPE "public"."hour_entry_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"region_code" varchar(10) DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"type" "holiday_type" DEFAULT 'national' NOT NULL,
	"is_working_day" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hour_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" uuid,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"assignment" text,
	"category" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"date" date NOT NULL,
	"is_overtime" boolean DEFAULT false NOT NULL,
	"project_stage_at_entry" text,
	"status" "hour_entry_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"decision_user_id" uuid,
	"decision_at" timestamp with time zone,
	"designated_approver_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hour_entries" ADD CONSTRAINT "hour_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_entries" ADD CONSTRAINT "hour_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_entries" ADD CONSTRAINT "hour_entries_decision_user_id_users_id_fk" FOREIGN KEY ("decision_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_entries" ADD CONSTRAINT "hour_entries_designated_approver_user_id_users_id_fk" FOREIGN KEY ("designated_approver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_unique_key" ON "holidays" USING btree ("country_code","region_code","date","name");--> statement-breakpoint
CREATE UNIQUE INDEX "hour_entries_legacy_id_key" ON "hour_entries" USING btree ("legacy_id") WHERE "hour_entries"."legacy_id" is not null;