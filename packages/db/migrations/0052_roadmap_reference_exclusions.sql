-- Una referencia comercial descartada deja de mostrarse en el Roadmap,
-- sin alterar el documento/versión de cotización que la originó.
CREATE TABLE "project_roadmap_reference_exclusions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "module_id" uuid NOT NULL REFERENCES "project_modules"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL,
  "wbs" varchar(160) NOT NULL,
  "role" varchar(160) NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "roadmap_ref_exclusion_identity_key"
  ON "project_roadmap_reference_exclusions"("module_id","version_id","wbs","role");
--> statement-breakpoint
CREATE INDEX "roadmap_ref_exclusion_project_idx"
  ON "project_roadmap_reference_exclusions"("project_id");
