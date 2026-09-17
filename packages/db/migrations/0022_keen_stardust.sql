CREATE TABLE "project_billing_settings" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"auto_activate_first_payment" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ALTER COLUMN "percent" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "pending_management_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_billing_settings" ADD CONSTRAINT "project_billing_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;