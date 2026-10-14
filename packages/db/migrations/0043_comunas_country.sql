ALTER TABLE "comunas" ADD COLUMN "country_id" uuid;--> statement-breakpoint
ALTER TABLE "comunas" ADD CONSTRAINT "comunas_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comunas_country_id_idx" ON "comunas" USING btree ("country_id");--> statement-breakpoint
-- Backfill: v1 no relacionaba comunas con países. Las únicas no chilenas son las ciudades extranjeras
-- que trajo v1; se asignan por nombre y todo lo demás (incluidas las 346 de 0039) queda en Chile.
-- La comparación ignora mayúsculas y tildes, igual que en 0039.
UPDATE "comunas" c
SET "country_id" = co."id"
FROM (VALUES
  ('Bogotá', 'Colombia'),
  ('Ciudad de Panamá', 'Panamá'),
  ('Guadalajara', 'México'),
  ('Lima (Cercado de Lima)', 'Perú'),
  ('Miraflores', 'Perú'),
  ('Mendoza', 'Argentina'),
  ('Presidente Franco', 'Paraguay'),
  ('Quito', 'Ecuador')
) AS m("comuna", "country")
JOIN "countries" co
  ON translate(lower(btrim(co."name")), 'áéíóúüñ', 'aeiouun') = translate(lower(m."country"), 'áéíóúüñ', 'aeiouun')
WHERE translate(lower(btrim(c."name")), 'áéíóúüñ', 'aeiouun') = translate(lower(m."comuna"), 'áéíóúüñ', 'aeiouun');
--> statement-breakpoint
UPDATE "comunas"
SET "country_id" = (SELECT "id" FROM "countries" WHERE lower(btrim("name")) = 'chile' LIMIT 1)
WHERE "country_id" IS NULL
  AND translate(lower(btrim("name")), 'áéíóúüñ', 'aeiouun') NOT IN (
    'bogota', 'ciudad de panama', 'guadalajara', 'lima (cercado de lima)', 'miraflores', 'mendoza',
    'presidente franco', 'quito'
  );
