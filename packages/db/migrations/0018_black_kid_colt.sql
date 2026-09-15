CREATE TYPE "public"."project_observation_status" AS ENUM('abierto', 'resuelto', 'pendiente', 'cumplido', 'activo');--> statement-breakpoint
CREATE TYPE "public"."project_observation_type" AS ENUM('hito', 'incidente', 'compromiso', 'atencion', 'observacion');--> statement-breakpoint
ALTER TABLE "project_observations" ADD COLUMN "type" "project_observation_type" DEFAULT 'observacion' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_observations" ADD COLUMN "title" varchar(200);--> statement-breakpoint
ALTER TABLE "project_observations" ADD COLUMN "status" "project_observation_status";--> statement-breakpoint
ALTER TABLE "project_observations" ADD COLUMN "module_id" uuid;--> statement-breakpoint
ALTER TABLE "project_observations" ADD COLUMN "date" date DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_module_id_project_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."project_modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_observations_module_idx" ON "project_observations" USING btree ("module_id");