-- Baja lógica histórica: las cuentas eliminadas antes de este fix
-- conservaron por error sus vínculos y grants del portal externo.
-- Liberar esos contactos sin borrar fichas comerciales, usuarios ni
-- recibos de entregas. Las FK ON DELETE CASCADE revocan ambos grants.
DELETE FROM "client_portal_accounts" AS account
USING "users" AS person
WHERE account."user_id" = person."id"
  AND person."deleted_at" IS NOT NULL;
