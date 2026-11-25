-- Ajuste puntual solicitado por cliente: Dashboard Alertas, 34 -> 66 HH.
-- IMPORTANTE: aplicar primero la migración 0070 y desplegar el backend actualizado.
-- Ejecutar en una ventana sin escrituras concurrentes; SOLO una vez.
-- No crea entradas HH ni tareas/fases, no modifica HH vendidas ni avance.
BEGIN;

DO $$
DECLARE
  target_id uuid := '308f4c81-bdd0-483b-a5ff-341ec787a08d';
  original_used numeric(10,2);
  sold numeric(10,2);
  old_adjustment numeric(10,2);
  approved numeric(10,2);
BEGIN
  SELECT p.used_hours, p.sold_hours, p.historical_hours_adjustment
    INTO STRICT original_used, sold, old_adjustment
  FROM projects p
  WHERE p.id = target_id
    AND p.slug = 'dashboard-alertas'
    AND p.name = 'Dashboard Alertas'
  FOR UPDATE;

  SELECT COALESCE(SUM(h.hours), 0)
    INTO approved
  FROM hour_entries h
  WHERE h.project_id = target_id AND h.status = 'approved';

  IF original_used <> 34 OR sold <> 110 OR approved <> 34 OR old_adjustment <> 0 THEN
    RAISE EXCEPTION 'Ajuste cancelado por diferencias: used=%, sold=%, aprobadas=%, ajuste=%',
      original_used, sold, approved, old_adjustment;
  END IF;

  UPDATE projects
  SET historical_hours_adjustment = 32,
      used_hours = approved + 32,
      updated_at = NOW()
  WHERE id = target_id;

  INSERT INTO audit_log (action, entity_type, entity_id, changes, metadata)
  VALUES (
    'update', 'project', target_id::text,
    jsonb_build_object(
      'historical_hours_adjustment', jsonb_build_object('before', 0, 'after', 32),
      'used_hours', jsonb_build_object('before', original_used, 'after', approved + 32)
    ),
    jsonb_build_object(
      'source', 'client_requested_historical_hours_adjustment',
      'reason', 'Incorporación de saldo histórico no registrado en bitácora; autorizado por cliente',
      'approved_entry_hours', approved,
      'sold_hours_unchanged', sold,
      'script', '2026-11-12_dashboard_alertas_34_to_66'
    )
  );
END $$;

COMMIT;

-- Verificación (esperado: 110 / 66 / 32 / 34):
SELECT p.slug, p.sold_hours, p.used_hours,
       p.historical_hours_adjustment,
       COALESCE(SUM(h.hours) FILTER (WHERE h.status = 'approved'), 0) AS hh_aprobadas,
       p.used_hours - (COALESCE(SUM(h.hours) FILTER (WHERE h.status = 'approved'), 0)
         + p.historical_hours_adjustment) AS diferencia
FROM projects p
LEFT JOIN hour_entries h ON h.project_id = p.id
WHERE p.id = '308f4c81-bdd0-483b-a5ff-341ec787a08d'
GROUP BY p.id;
