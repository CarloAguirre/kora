CREATE SEQUENCE "public"."tickets_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
--> statement-breakpoint
-- Arranca después del máximo código "TK-####" ya migrado desde la v1, para que los tickets nuevos nunca choquen con uno importado.
SELECT setval('"public"."tickets_code_seq"', COALESCE((SELECT max(substring(legacy_id from '\d+')::int) FROM "public"."tickets" WHERE legacy_id ~ '^TK-\d+$'), 0) + 1, false);