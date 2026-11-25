CREATE TABLE "project_payment_receipts" (
	"milestone_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mime_type" varchar(32) NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_payment_receipts" ADD CONSTRAINT "project_payment_receipts_milestone_id_project_payment_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_payment_milestones"("id") ON DELETE cascade ON UPDATE no action;