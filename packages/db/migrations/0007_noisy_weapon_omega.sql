ALTER TABLE "audit_log" ADD COLUMN "legacy_id" integer;--> statement-breakpoint
ALTER TABLE "ticket_history_entries" ADD COLUMN "legacy_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_log_legacy_id_key" ON "audit_log" USING btree ("legacy_id") WHERE "audit_log"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_history_entries_legacy_id_key" ON "ticket_history_entries" USING btree ("legacy_id") WHERE "ticket_history_entries"."legacy_id" is not null;