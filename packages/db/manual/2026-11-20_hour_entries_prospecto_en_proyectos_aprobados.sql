-- Corrige la asignación de horas registradas en Kora v2 como "Prospecto" en
-- proyectos que ya están aprobados (o son de soporte): pasan a "Proyecto".
--
-- Origen: hasta el 2026-11-12 (commit 45fcc060) el formulario de horas dejaba
-- elegir "Prospecto" con cualquier proyecto y el backend no lo validaba. Ej.:
-- Eduardo Aranda en "Motor de comisiones" (Siegfried), 04, 05 y 09/11.
--
-- Alcance: SOLO registros nacidos en v2 (legacy_id IS NULL). Los migrados de
-- la v1 no se tocan: pueden ser horas reales de preventa de un proyecto que
-- después se aprobó.
--
-- Respaldo: guarda id + asignación previa en
-- _bk_hour_entries_assignment_20261120 para poder revertir:
--   UPDATE hour_entries h SET assignment = b.assignment
--   FROM _bk_hour_entries_assignment_20261120 b WHERE b.id = h.id;
--
-- Idempotente: una segunda ejecución no encuentra filas que corregir.
BEGIN;

CREATE TABLE IF NOT EXISTS _bk_hour_entries_assignment_20261120 (
  id uuid PRIMARY KEY,
  assignment text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

WITH targets AS (
  SELECT h.id, h.assignment
  FROM hour_entries h
  JOIN projects p ON p.id = h.project_id
  WHERE h.legacy_id IS NULL
    AND h.assignment = 'Prospecto'
    AND (p.type = 'support' OR p.sales_stage = 'approved')
),
backup AS (
  INSERT INTO _bk_hour_entries_assignment_20261120 (id, assignment)
  SELECT id, assignment FROM targets
  ON CONFLICT (id) DO NOTHING
)
UPDATE hour_entries h
SET assignment = 'Proyecto'
FROM targets t
WHERE h.id = t.id;

COMMIT;
