# Kora v5.02 — HH reales por tarea del Roadmap

**Rama:** `feature/calculadora-roadmap-diseno-v5-02`

## Problema constatado

La tabla del Roadmap renderizaba `{task.estimatedHours ?? '—'} / —`.
Este **segundo guion era literal en el código**: no consultaba ningún dato.
Una tarea `done` (aprobada por el líder) agrega sus **HH estimadas**
al **avance del trabajo**; eso no significa que se hayan consumido ni
registrado esas horas. El registro de HH y la aprobación de la tarea son
flujos distintos.

## Solución

- Migración **`0056_hour_entry_task_attribution.sql`**: nuevo
  `hour_entries.task_id` nullable, FK a `project_module_tasks.id`,
  con índice parcial para horas aprobadas. **Sin backfill** ni reparto
  inferido de HH históricas.
- Los contratos y el agregado de horas aceptan `taskId` opcional.
  La selección aparece en **registro diario**, **registro semanal** y
  **edición de horas** tras elegir proyecto, fase y bloque.
- El selector solo ofrece tareas activas, asignadas al autor del registro
  y pertenecientes exactamente al bloque seleccionado. La API repite
  esas comprobaciones: no basta modificar el request manualmente.
- Si se cambia el proyecto, fase o bloque se borra la selección anterior.
  Si solo cambia la duración o descripción, la atribución se conserva.
  El fraccionamiento de una jornada en horas normales y extraordinarias
  conserva el mismo `taskId`.
- `DrizzleProjectModuleRepository` suma
  **`SUM(hour_entries.hours) WHERE status = 'approved' GROUP BY task_id`**
  solo para las tareas de la ficha. Este valor sale como
  `task.actualHours` y se usa en la columna `HH est. / reales`.
  No se usa la suma de HH del bloque para cada tarea.
- El formulario invalida el caché del proyecto al crear, editar y
  aprobar/rechazar horas, de modo que el Roadmap refleja los nuevos
  valores sin recargar a mano.
- **Significado del guion:** no existen HH aprobadas asociadas
  explícitamente a esa tarea. **No significa que se trabajaron cero horas**.
  Unas horas pendientes de aprobar tampoco aparecen como reales
  aprobadas hasta su aprobación.

## Importante: tareas y horas existentes

La migración NO modifica horas históricas. Para las tareas que ya están
`done`, revisa los registros reales de bitácora y asócialos a la tarea
**solo cuando exista evidencia cierta de que le corresponden**. Esa
corrección debe hacerla un usuario autorizado y respeta las reglas de
edición de registros del proyecto. No generar registros duplicados
ni deducir 120 HH reales de 120 HH estimadas.

## Auditoría SQL — lectura únicamente

Verificar schema de destino:

```sql
SELECT current_database(), current_schema(),
       to_regclass('public.hour_entries') AS horas,
       to_regclass('public.project_module_tasks') AS tareas;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'hour_entries'
  AND column_name = 'task_id';
```

Identificar tareas con HH aprobadas atribuidas:

```sql
SELECT p.name AS proyecto, m.name AS fase,
       t.name AS tarea, t.status,
       t.estimated_hours AS hh_estimadas,
       COALESCE(SUM(h.hours) FILTER (WHERE h.status = 'approved'), 0) AS hh_reales_aprobadas,
       COUNT(h.id) FILTER (WHERE h.status = 'approved') AS registros_aprobados
FROM projects p
JOIN project_modules m ON m.project_id = p.id
JOIN project_module_tasks t ON t.module_id = m.id
LEFT JOIN hour_entries h ON h.task_id = t.id
WHERE p.slug = 'prueba-dev-2'
GROUP BY p.name, m.id, m.name, t.id, t.name, t.status, t.estimated_hours
ORDER BY m.name, t.name;
```

Ver HH aprobadas atribuidas al proyecto o bloque **pero sin tarea**:

```sql
SELECT h.id, h.date, h.hours, h.user_id, h.module_id,
       h.segment_id, h.task_id, h.status, h.category
FROM hour_entries h
JOIN projects p ON p.id = h.project_id
WHERE p.slug = 'prueba-dev-2'
  AND h.status = 'approved' AND h.task_id IS NULL
ORDER BY h.date DESC, h.id;
```

## Integración y validación (PowerShell desde raíz de repo)

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

# Comprobar apuntar a la BD DEV y usar su .env con ruta ABSOLUTA
$envFile = (Resolve-Path '.\apps\api\.env').Path
pnpm --filter @kora/db exec node --env-file="$envFile" -e "const u=new URL(process.env.DATABASE_URL); console.log(u.hostname,u.pathname)"
# Aplicar migración 0056, ANTES de iniciar el API con el nuevo schema
pnpm --filter @kora/db exec node --env-file="$envFile" --import tsx src/migrate.ts

pnpm exec turbo run typecheck --filter=@kora/api --force
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run src/modules/hours/application/use-cases/create-hour-entry.use-case.spec.ts src/modules/hours/application/use-cases/update-hour-entry.use-case.spec.ts src/modules/hours/domain/entities/hour-entry.entity.spec.ts src/modules/hours/application/mappers/hour-entry.mapper.spec.ts

pnpm --filter @kora/web exec vitest run src/modules/hours/components/DailyEntryForm.segment-validation.test.ts src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx
```

**Estado:** implementación y pruebas unitarias publicadas en GitHub; ejecución
local, aplicación de migración y comprobación contra la BD real pendientes.
