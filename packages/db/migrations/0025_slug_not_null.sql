-- Requiere haber corrido `pnpm --filter @kora/db run backfill:slugs` después de 0024.
ALTER TABLE "teams" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "support_plans" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "teams_slug_key" ON "teams" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_slug_key" ON "clients" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_key" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "support_plans_slug_key" ON "support_plans" USING btree ("slug");
