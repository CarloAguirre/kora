-- Columnas nullable por ahora: se backfillean con `pnpm --filter @kora/db run backfill:slugs`
-- (usa la misma función `slugify`/`withUniqueSuffix` que usarán los registros nuevos) antes de
-- que la migración 0025 les agregue NOT NULL + el índice único.
ALTER TABLE "teams" ADD COLUMN "slug" varchar(90);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "slug" varchar(90);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "slug" varchar(90);--> statement-breakpoint
ALTER TABLE "support_plans" ADD COLUMN "slug" varchar(90);
