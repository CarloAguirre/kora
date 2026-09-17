CREATE TYPE "public"."support_plan_currency" AS ENUM('UF', 'CLP', 'USD');--> statement-breakpoint
-- Toda factura existente es de antes de que existiera otra moneda: se congela como UF.
ALTER TABLE "support_invoices" ADD COLUMN "currency" "support_plan_currency" DEFAULT 'UF' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_invoices" ALTER COLUMN "currency" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "currency" "support_plan_currency" DEFAULT 'UF' NOT NULL;