CREATE TABLE "project_invoice_attachments" (
	"milestone_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_invoice_attachments" ADD CONSTRAINT "project_invoice_attachments_milestone_id_project_payment_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_payment_milestones"("id") ON DELETE cascade ON UPDATE no action;