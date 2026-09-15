CREATE TYPE "public"."project_module_delivery_status" AS ENUM('planned', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."project_module_stage" AS ENUM('discovery', 'development', 'production', 'pilot', 'closed');--> statement-breakpoint
CREATE TABLE "project_module_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"estimated_date" date NOT NULL,
	"status" "project_module_delivery_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"initial_stage" "project_module_stage" NOT NULL,
	"current_stage" "project_module_stage" NOT NULL,
	"estimated_hours" numeric(10, 2),
	"estimated_start_date" date,
	"estimated_end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "on_hold_reason" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "stops_clock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "scope_notes" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "delivery_documentation" text;--> statement-breakpoint
ALTER TABLE "project_module_deliveries" ADD CONSTRAINT "project_module_deliveries_module_id_project_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."project_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_modules" ADD CONSTRAINT "project_modules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;