CREATE TYPE "public"."ticket_hh_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "ticket_hh_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"hours" numeric(10, 2) NOT NULL,
	"note" text,
	"status" "ticket_hh_request_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"hour_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_hh_requests" ADD CONSTRAINT "ticket_hh_requests_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_hh_requests" ADD CONSTRAINT "ticket_hh_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_hh_requests" ADD CONSTRAINT "ticket_hh_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_hh_requests" ADD CONSTRAINT "ticket_hh_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_hh_requests" ADD CONSTRAINT "ticket_hh_requests_hour_entry_id_hour_entries_id_fk" FOREIGN KEY ("hour_entry_id") REFERENCES "public"."hour_entries"("id") ON DELETE set null ON UPDATE no action;