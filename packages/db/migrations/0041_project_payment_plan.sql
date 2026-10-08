CREATE TYPE "public"."project_contract_currency" AS ENUM('UF', 'CLP', 'USD');--> statement-breakpoint
CREATE TYPE "public"."project_payment_trigger" AS ENUM('approval', 'phase', 'date', 'manual');--> statement-breakpoint
-- `ALTER TYPE ... ADD VALUE 'to_invoice'` no sirve acá: el migrador corre todo en una transacción y un valor
-- recién agregado no puede usarse en ella (el backfill de abajo lo usa). Se recrea el tipo con el valor nuevo.
ALTER TYPE "public"."project_payment_status" RENAME TO "project_payment_status_old";--> statement-breakpoint
CREATE TYPE "public"."project_payment_status" AS ENUM('pending', 'to_invoice', 'invoiced', 'paid');--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ALTER COLUMN "status" TYPE "public"."project_payment_status" USING "status"::text::"public"."project_payment_status";--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
DROP TYPE "public"."project_payment_status_old";--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD COLUMN "due_at" date;--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD COLUMN "trigger_type" "project_payment_trigger" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD COLUMN "trigger_phase" "project_phase";--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD COLUMN "trigger_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_currency" "project_contract_currency" DEFAULT 'UF' NOT NULL;--> statement-breakpoint
-- Los tramos del cronograma por defecto (Inicio / Marcha blanca, ver 0035) toman su hito; el resto queda manual.
UPDATE "project_payment_milestones" SET "trigger_type" = 'approval' WHERE "name" ~* '^\s*inicio';--> statement-breakpoint
UPDATE "project_payment_milestones" SET "trigger_type" = 'phase', "trigger_phase" = 'pilot' WHERE "name" ~* 'marcha\s+blanca';--> statement-breakpoint
-- Tramos pendientes cuyo hito ya se cumplió: quedan por facturar (sin correo — es el estado de partida). Igual
-- regla que la app: un tramo en 0 (cronograma por defecto sin completar) no tiene nada que facturar todavía.
UPDATE "project_payment_milestones" m SET "status" = 'to_invoice'
FROM "projects" p
WHERE m."project_id" = p."id" AND m."status" = 'pending' AND m."amount" > 0 AND p."deleted_at" IS NULL AND (
  (m."trigger_type" = 'approval' AND p."sales_stage" = 'approved')
  OR (m."trigger_type" = 'phase' AND p."phase" IS NOT NULL AND p."phase" >= m."trigger_phase")
);--> statement-breakpoint
-- Facturas ya emitidas: vencimiento a 30 días de la emisión, el mismo plazo por defecto que se propone al facturar.
UPDATE "project_payment_milestones" SET "due_at" = "issued_at" + 30 WHERE "issued_at" IS NOT NULL AND "status" IN ('invoiced', 'paid');
