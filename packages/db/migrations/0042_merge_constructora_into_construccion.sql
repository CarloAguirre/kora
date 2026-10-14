-- El catálogo de giros heredado de v1 tenía "Construcción" y "Constructora" como dos giros distintos
-- para lo mismo. Se deja solo "Construcción": los clientes con "Constructora" pasan a "Construcción"
-- y se elimina "Constructora". Si en algún ambiente no existiera "Construcción", se renombra
-- "Constructora" en su lugar. Se busca por nombre porque los ids son distintos en cada ambiente.
UPDATE "clients"
SET "industry_id" = construccion."id", "updated_at" = now()
FROM "industries" constructora, "industries" construccion
WHERE "clients"."industry_id" = constructora."id"
  AND lower(btrim(constructora."name")) = 'constructora'
  AND lower(btrim(construccion."name")) = 'construcción';
--> statement-breakpoint
DELETE FROM "industries"
WHERE lower(btrim("name")) = 'constructora'
  AND EXISTS (SELECT 1 FROM "industries" WHERE lower(btrim("name")) = 'construcción');
--> statement-breakpoint
UPDATE "industries"
SET "name" = 'Construcción', "updated_at" = now()
WHERE lower(btrim("name")) = 'constructora';
