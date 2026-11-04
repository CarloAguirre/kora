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

## Ajustes de fidelidad UI del 04-11 — cabecera y acciones de tareas

- El header de fase en modo **Planificar** mantiene el nombre editable, fechas y HH en una sola línea en escritorio (en anchos reducidos permite saltos controlados), con los controles de progreso, crear bloque y borrar fase alineados a la derecha.
- La última columna de tareas **no tiene texto «Asignar tarea»**. Todas las filas presentan **lápiz** y **basurero**.
- Tareas operativas existentes: lápiz = `ExecutionTaskModal` (`Editar tarea`), basurero = confirmación con `useConfirmAction` y `DELETE /projects/:id/modules/:moduleId/tasks/:taskId`.
- Referencias EDT aún no convertidas: lápiz = `QuotationReferenceTaskModal mode=edit`, con nombre, descripción, horas y bloque precargados si es único. Guardar crea la tarea operativa con `sourceMarker` trazable, conservando intacta la versión comercial.
- Basurero de referencia EDT no convertida = confirmación `Eliminar tarea` y exclusión **operativa** persistida por `(moduleId,versionId,wbs,role)`, sin tocar el artefacto comercial ni simular una tarea guardada.
- Al borrar una tarea operativa que se originó en una referencia EDT, el backend persiste la exclusión de esa referencia **en la misma transacción** del borrado, evitando que reaparezca inmediatamente como tarea por asignar.
- Se incluye endpoint de restauración programática de exclusión, sin acción visual nueva en esta iteración.

### Migración adicional 0052
`packages/db/migrations/0052_roadmap_reference_exclusions.sql` crea
`project_roadmap_reference_exclusions` y sus índices de unicidad/consulta.
**Aplicar también migración 0052** antes de iniciar API/Frontend (además de 0051).

### Validación puntual (PowerShell)
```powershell
pnpm --filter @kora/contracts build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck
pnpm --filter @kora/api exec vitest run src/modules/projects/application/use-cases/delete-project-module-task.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx src/modules/projects/components/QuotationReferenceTaskModal.test.tsx
pnpm --filter @kora/api build
pnpm --filter @kora/web build
# Tras backup y comprobación de DATABASE_URL:
pnpm db:migrate
```

Comprobar con dos escenarios: (a) fase que ya tiene tareas operativas con dates/HH y
(b) fase con tareas aún referenciales procedentes de una versión de cotización aplicada.
En ambos, el lápiz abre «Editar tarea» y el basurero confirma «Eliminar tarea»;
no deben regresar filas eliminadas tras refrescar la página.

## Ajuste adicional — duplicación, creación de fases y arquitectura (04-11-2026)

- Tabla: a toda tarea **persistida con responsable asignado** (`assigneeUserId` presente), sin importar si está Pendiente, En curso, En revisión o Aprobada, se le muestra el icono «Duplicar tarea» entre lápiz y basurero. Abre el `DuplicateTaskModal` ya existente con título, persona y HH. Crea una nueva tarea `todo` sin copiar aprobaciones ni consumo de horas y preserva bloque/fechas/alcance. Las referencias EDT y tareas sin responsable siguen con dos iconos.
- Botón «+ Agregar fase»: modal **«Nueva fase»** de un solo campo obligatorio «Nombre de la fase», texto de ayuda «La etapa macro del plan. Después le agregas bloques de trabajo por equipo.», y acciones «Cancelar / Crear fase».
- Contrato de alta de módulo: `estimatedHours` opcional al crear; el caso de uso guarda `null` cuando todavía no hay estimación. No se inventan HH ni fechas. Las altas de otros flujos que envían HH conservan su comportamiento.
- Al confirmar `createModule` se utiliza el ID retornado para abrir inmediatamente «Nuevo bloque de trabajo» de la fase creada. Se presenta el toast **«Fase creada. Ahora agrega su primer bloque de trabajo.»**. Si la consulta del proyecto aún no trae la fase recién creada, el modal usa solo el ID y nombre retornados (sin inventar un registro de ejecución); al refrescar se muestra el registro persistido. Si el proyecto no tiene equipo disponible, se informa y no se abre un formulario inusable.
- `NewWorkBlockModal`: el encabezado identifica «Fase N: nombre», y para creación nueva propone la fecha local de hoy como inicio; la fecha final sigue pendiente.
- Corrección de `architecture.spec.ts`: `ProjectRoadmapReferenceExclusionsService` dejó de importar `@kora/db` (y tipos de presentación HTTP). Se inyecta el puerto `ROADMAP_REFERENCE_EXCLUSION_STORE`; el adaptador `DrizzleRoadmapReferenceExclusionStore` se ubica exclusivamente en `infrastructure/persistence`, registrado en `ProjectsModule`. No se desactivaron tests ni reglas arquitectónicas.
- **No hay migraciones nuevas en este ajuste:** se mantienen las migraciones `0051` y `0052` de los commits anteriores, que deben aplicarse si aún no estaban en el entorno.

### Verificación sugerida
```powershell
pnpm --filter @kora/contracts build
pnpm --filter @kora/core build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run src/test/architecture.spec.ts src/modules/projects/application/services/project-roadmap-reference-exclusions.service.spec.ts src/modules/projects/application/use-cases/create-project-module.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx src/modules/projects/components/NewWorkBlockModal.test.tsx

pnpm --filter @kora/api build
pnpm --filter @kora/web build
pnpm test
```

Validación manual: abrir Planificar → «+ Agregar fase» → nombre «Cierre» → Crear fase → toast → modal «Nuevo bloque de trabajo» con fase N, equipo, nombre, inicio sugerido, HH y entrega. Cancelar el bloque debe conservar la fase creada. En otra fase, probar duplicar desde la fila de una tarea asignada y comprobar que nueva tarea pasa a `todo` sin duplicar aprobaciones.
