-- Los bloques antiguos conservan NULL; el editor v5.02 registra HH explícitas.
ALTER TABLE "project_module_segments"
  ADD COLUMN "estimated_hours" numeric(10,2);
ALTER TABLE "project_module_segments"
  ADD CONSTRAINT "project_module_segments_estimated_hours_positive"
  CHECK ("estimated_hours" IS NULL OR "estimated_hours" > 0);
