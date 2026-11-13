-- Kora 2.0: auditoría posterior a la migración 0054.
-- SOLO CONSULTAS: NO actualiza, distribuye ni elimina registros históricos.
-- Requiere hour_entries.segment_id y project_module_segments disponibles.

-- A) Consumo aprobado vinculado por FK exacta, por proyecto, fase y bloque.
SELECT p.name AS proyecto, m.name AS fase, s.name AS bloque,
       s.id AS segment_id, s.team_id,
       COALESCE(SUM(h.hours), 0) AS hh_aprobadas
FROM project_module_segments s
JOIN project_modules m ON m.id = s.module_id
JOIN projects p ON p.id = m.project_id
LEFT JOIN hour_entries h ON h.segment_id = s.id AND h.status = 'approved'
GROUP BY p.name, m.name, s.name, s.id, s.team_id
ORDER BY p.name, m.name, s.name;

-- B) Histórico sin segmento: cuánto queda por conciliar por proyecto y fase.
-- (Las horas con status pending/rejected no cuentan como consumidas.)
SELECT p.name AS proyecto, COALESCE(m.name, 'Sin fase') AS fase,
       h.project_id, h.module_id,
       COUNT(*) AS registros_historicos,
       COALESCE(SUM(h.hours), 0) AS hh_aprobadas_sin_bloque
FROM hour_entries h
JOIN projects p ON p.id = h.project_id
LEFT JOIN project_modules m ON m.id = h.module_id
WHERE h.segment_id IS NULL AND h.status = 'approved'
GROUP BY p.name, m.name, h.project_id, h.module_id
ORDER BY hh_aprobadas_sin_bloque DESC;

-- C) Candidatos para conciliación, sin elegir el bloque automáticamente.
-- Se cruza el autor histórico con una pertenencia al equipo de ese proyecto,
-- la fase exacta y la fecha. Aun con un candidato, requiere revisión humana:
-- un autor pudo trabajar transversalmente o fuera del intervalo planificado.
WITH posibles AS (
  SELECT DISTINCT h.id AS hour_entry_id, s.id AS segment_id
  FROM hour_entries h
  JOIN project_module_segments s ON s.module_id = h.module_id
     AND h.date BETWEEN s.start_date AND s.end_date
  JOIN project_modules m ON m.id = s.module_id AND m.project_id = h.project_id
  JOIN project_team_members ptm ON ptm.project_id = h.project_id AND ptm.team_id = s.team_id
  JOIN team_members tm ON tm.id = ptm.team_member_id AND tm.user_id = h.user_id
  WHERE h.segment_id IS NULL AND h.status = 'approved'
)
SELECT h.id, h.date, h.hours, h.project_id, h.module_id,
       COUNT(DISTINCT p.segment_id) AS candidatos,
       ARRAY_AGG(DISTINCT p.segment_id) FILTER (WHERE p.segment_id IS NOT NULL) AS posibles_bloques
FROM hour_entries h LEFT JOIN posibles p ON p.hour_entry_id = h.id
WHERE h.segment_id IS NULL AND h.status = 'approved' AND h.project_id IS NOT NULL
GROUP BY h.id, h.date, h.hours, h.project_id, h.module_id
ORDER BY candidatos DESC, h.date DESC;

-- Una vez validado un registro individual por quien conoce el proyecto:
-- UPDATE hour_entries SET segment_id = '<UUID BLOQUE>'
-- WHERE id = '<UUID REGISTRO>' AND segment_id IS NULL;
-- La API valida las nuevas altas; esta consulta administrativa debe revisarse
-- antes de ejecutar y comprobar la pertenencia a proyecto/fase/equipo.
