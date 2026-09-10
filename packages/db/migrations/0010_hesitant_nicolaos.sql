ALTER TABLE "ticket_hh_requests" ADD COLUMN "is_overtime" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "allows_overtime" boolean DEFAULT false NOT NULL;