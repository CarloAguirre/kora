DROP INDEX "support_invoices_plan_period_key";--> statement-breakpoint
ALTER TABLE "support_invoices" ADD COLUMN "position" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "support_invoices_plan_period_position_key" ON "support_invoices" USING btree ("plan_id","period_key","position");