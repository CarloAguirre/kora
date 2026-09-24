CREATE TYPE "public"."project_hito0_source" AS ENUM('auto_invoice', 'manual');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "hito0_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "hito0_source" "project_hito0_source";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "hito0_reason" text;