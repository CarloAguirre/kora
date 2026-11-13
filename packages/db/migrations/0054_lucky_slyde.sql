CREATE TABLE "support_invoice_attachments" (
	"invoice_id" uuid PRIMARY KEY NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_invoice_attachments" ADD CONSTRAINT "support_invoice_attachments_invoice_id_support_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."support_invoices"("id") ON DELETE cascade ON UPDATE no action;