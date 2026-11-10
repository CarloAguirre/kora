-- Enlaces de hitos de cotización a módulos operativos reales. Sin cambios en pagos históricos.
ALTER TABLE "project_payment_milestones"
  ADD COLUMN IF NOT EXISTS "trigger_module_id" uuid;
--> statement-breakpoint
ALTER TABLE "project_payment_milestones"
  ADD CONSTRAINT "project_payment_milestones_trigger_module_id_fk"
  FOREIGN KEY ("trigger_module_id") REFERENCES "public"."project_modules"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_payment_milestones_trigger_module_idx"
  ON "project_payment_milestones" ("trigger_module_id");
