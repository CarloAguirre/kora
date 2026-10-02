-- La lista de responsables comerciales de v1 no salía de `usuario.es_responsable_comercial` (solo 4
-- personas lo tenían), sino del catálogo `responsable_comercial` filtrado por `visible_en_selector`.
-- El ETL migró solo el flag, así que en v2 faltaban 6 comerciales. Se marcan aquí las 10 personas
-- visibles en el selector de v1, identificadas por su `usuario.id_usuario` (= `users.legacy_id`).
-- Solo suma marcas: no desmarca a nadie que ya se haya marcado a mano en v2.
UPDATE "users"
SET "is_commercial_manager" = true, "updated_at" = now()
WHERE "legacy_id" IN (67, 167, 169, 216, 217, 218, 220, 221, 222, 223)
  AND "is_commercial_manager" = false;
