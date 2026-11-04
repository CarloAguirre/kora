# Roadmap v5.02 — cierre de bloques, entrega y asignación de tareas
Fecha: 2026-11-04 · Rama: `feature/calculadora-roadmap-diseno-v5-02`

## Problema original y regla de negocio
La fecha final (`project_module_segments.end_date`) indica **cierre planificado**; no acredita un cierre efectivo.
Al aprobar la última tarea realmente asociada al bloque (`status='done'`), Kora registra
`closed_at` (momento real, no deducido de fechas de calendario ni del estado del módulo).
Si se vuelve a revisión una tarea vinculada, se borra `closed_at` en la misma transacción.
Un bloque sin entrega puede cerrarse manualmente si todas sus tareas vinculadas están aprobadas;
la reapertura por el líder borra `closed_at`. Esta regla **no equivale** a aprobar automáticamente
la entrega: `project_module_deliveries.status` mantiene el flujo `planned → delivered → approved`
con sus permisos, comentarios y auditoría ya existentes.

## Relación estructural (migración 0051)
- `project_module_segments.closed_at TIMESTAMPTZ NULL`: cierre real.
- `project_module_tasks.segment_id UUID NULL REFERENCES project_module_segments(id) ON DELETE SET NULL`.
- `project_module_deliveries.segment_id UUID NULL REFERENCES project_module_segments(id) ON DELETE SET NULL`.
- Índice único parcial de entrega por bloque (máximo una entrega de cierre).
- Las tareas anteriores se vinculan solo si tienen marcador de ID explícito de bloque compatible
  con la fase/equipo o un único bloque de mismo equipo que contenga TODAS las fechas de la tarea.
- Las entregas históricas solo se vinculan cuando `module_id + team_id + estimated_date` da
  coincidencia exclusiva tanto para bloque como para entrega; las ambiguas quedan `NULL`.
- Un bloque antiguo solo recupera `closed_at` si TODAS sus tareas vinculadas ya tienen
  `done` y `completed_at`, usando `MAX(completed_at)`. No se inventan cierres.
- No se alteran cotizaciones, HH vendidas, pagos ni aprobaciones históricas.

## API y validaciones
- Crear bloque + entrega opcional en una transacción; entrega recibe el `segment_id` creado.
- Editar bloque + nombre/fecha de entrega en una transacción; cambio de fecha actualiza
  `estimated_date` de su entrega vinculada. No permite borrar ni mover una entrega aprobada.
- No se permite reducir fechas ni cambiar equipo si hay tareas vinculadas que resultarían inválidas.
- Crear/editar tareas con `segment_id` exige misma fase/equipo y fechas contenidas.
- Aprobar/revertir aprobación, borrar o mover tarea recalcula `closed_at` del bloque afectado.
- El borrado de un bloque con dependencias explícitas queda bloqueado para impedir huérfanos.

## Frontend
- El Gantt dibuja el diamante planificado sobre `endDate`, rojo cuando pasó sin cierre, y
  el diamante real sobre `closedAt`. Si las fechas difieren, se ven ambos; si coinciden,
  se muestra uno relleno, sin superposición.
- Clic en la barra abre el panel lateral con equipo, fechas, HH, avance de tareas aprobadas,
  entrega de cierre, cierre real, lista de tareas y acciones.
- «Editar bloque» reutiliza el formulario completo (equipo, nombre, fechas, HH, entrega de cierre).
  La gestión existente de colaboradores/dedicación/Forecast sigue disponible por separado.
- «Asignar tarea» en la fila comercial y «Asignar tareas» en aviso morado abren
  asignación de referencias EDT y tareas operativas no asignadas, con elección masiva o individual
  de colaborador y fechas; las HH se conservan.
- Un error parcial no repite tareas ya publicadas dentro de la sesión de asignación.

## Limitaciones explícitas
- Las HH consumidas hoy están por módulo, no por bloque: no se fabrican consumos.
- Las entregas antiguas sin vínculo verificable requieren decisión/manualización posterior.
- La aprobación del cierre real del bloque por tareas no sustituye la aprobación de la
  entidad «Entrega». No se fabrican estados `approved` ni fechas reales de entrega.
- La asignación de varias tareas usa los casos de uso uno a uno; no es una transacción de lote.
  Se informan fallas parciales y se pueden reintentar las filas no guardadas.

## Integración local (PowerShell, raíz del monorepo)
```powershell
git status --short --branch
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm install --frozen-lockfile
pnpm --filter @kora/contracts build
pnpm --filter @kora/core build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck
pnpm --filter @kora/api build
pnpm --filter @kora/web build

# REQUIERE RESPALDO Y DATABASE_URL CONFIRMADA.
# Migrar ANTES de iniciar la API que consulta las nuevas columnas.
pnpm db:migrate

pnpm --filter @kora/api exec vitest run src/modules/projects/application/use-cases/update-project-module-segment.use-case.spec.ts src/modules/projects/application/use-cases/update-project-module-task.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/projects/components/AssignBlockTasksModal.test.tsx src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx src/modules/client-portal/components/PhaseRoadmap.header-actions.test.tsx
```
