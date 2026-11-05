# Kora 2.0 · Mis proyectos del colaborador (2026-11-05)

Rama: `feature/calculadora-roadmap-diseno-v5-02`
Estado: implementación publicada en GitHub; compilación, Vitest y validación visual en DEV aún pendientes.

## Objetivo

Vista de proyectos personales del colaborador según prototipo v6, conservando los tokens, layout, Card, DataTable, Pagination y controles de Kora, sin inventar permisos de gestión.

## API y permisos

- `GET /api/projects/my`: exige `hours:read_own` y fuerza búsqueda por usuario autenticado. Solo expone nombre, cliente, líder, etapa, fechas, progreso y HH propias (aprobadas + pendientes, no rechazadas) en semana corriente. Ignora filtros de otros usuarios y equipos.
- `GET /api/projects/my/:id`: exige `hours:read_own` y valida participación mediante `GetProjectUseCase` sin propagar `projects:read`. Devuelve proyección de roadmap/observaciones sin facturación, cotización ni datos de clientes privados.
- Bitácora: solo horas aprobadas de los participantes, más observaciones y entregas. Se devuelve `activityTruncated` si hay más de 500 eventos de horas; no se dice que el historial completo está cargado.
- Puerto `ProjectHourEntryReader` extendido en `DrizzleProjectHourEntryReader`; no se importa `HoursModule` dentro de `ProjectsModule` para evitar la dependencia circular.
- No existen endpoints de mutación nuevos. Los flags `canEdit`, `canResolve`, `canDelete` y `canManage` del payload se fuerzan a `false`.

## Frontend

- Menú `Mis proyectos` solo en rol `collaborator`, ruta `/mis-proyectos`.
- Tabla propia con avance operativo y HH personales reales por semana, paginada, enlace `/mis-proyectos/:projectId`.
- Ficha informativa con `ProjectProgressOverview` y dos tabs: Roadmap / Bitácora.
- Roadmap operativo `PhaseRoadmap`, sin toolbar planificar ni callbacks de edición; zoom y selección de tareas, entregas y bloques solo muestran detalles.
- Bitácora de consulta con filtros, búsqueda, fechas, paginación y modal de detalle; sin acciones de alta/edición/aprobación.

## Integración y validación — PowerShell

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts build
if ($LASTEXITCODE -ne 0) { throw "Falló contratos" }
pnpm exec turbo run typecheck --filter=@kora/api --force
if ($LASTEXITCODE -ne 0) { throw "Falló API" }
pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Falló Web" }

pnpm --filter @kora/api exec vitest run src/modules/projects/application/services/collaborator-project-activity.service.spec.ts src/modules/projects/presentation/projects.controller.my-projects.spec.ts
if ($LASTEXITCODE -ne 0) { throw "Fallaron pruebas API: agregación o permisos" }
pnpm --filter @kora/web exec vitest run src/modules/projects/pages/MyProjectsPage.test.tsx src/modules/projects/pages/MyProjectDetailPage.test.tsx src/modules/projects/components/SegmentDrawer.test.tsx src/modules/projects/components/ProjectPhaseTasksTable.test.tsx src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Fallaron pruebas de vistas" }

pnpm --filter @kora/api build
if ($LASTEXITCODE -ne 0) { throw "Falló build API" }
pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Falló build Web" }
```

## Recorrido manual

1. Autenticar como colaborador que participa en un proyecto con avance/hours.
2. Menú «Mis proyectos»: solo proyectos propios, HH de esta semana, progreso y acceso al detalle.
3. Abrir proyecto: revisar cabecera y avance real/esperado.
4. Roadmap: fases, bloques, tareas, entrega, zoom e información; **ningún** botón Planificar, editar, aprobar o reasignar.
5. Bitácora: filtros y detalle; ningún botón agregar/editar/aprobar.
6. Abrir URL de proyecto ajeno: la API debe devolver `PROJECT_NOT_ASSIGNED` (sin datos).
7. Intentar modificar tarea por API con rol colaborador fuera de su propia tarea: deben mantenerse las restricciones existentes.

No hay migraciones, backfill ni cambios de datos históricos.

## Ajuste de fidelidad visual — 05/11/2026 (detalle de bloques y tareas)

Se aplicaron las referencias de las imágenes del colaborador v6, reutilizando
componentes reales del producto y sin reemplazar las vistas internas.

- Al pulsar la barra de un bloque operativo dentro de un `PhaseRoadmap`, el
  colaborador abre **`SegmentDrawer`**: exactamente el mismo panel lateral que
  Líder/PMO, con datos del equipo, líder, fechas, HH, avance, entrega de cierre,
  integrantes y tareas del bloque. Se eliminó el resumen de bloque que antes
  se mostraba debajo del gráfico.
- `SegmentDrawer` ahora admite `readOnly`. En ese modo neutraliza la UI y
  los callbacks de cerrar, reabrir, entregar, crear, editar, duplicar o eliminar.
  No se crearon rutas de mutación para esta funcionalidad.
- `ProjectPhaseTasksTable` extraída desde `ProjectModulesCard` se comparte
  con el colaborador: tabla abierta por fase **Tareas N, M aprobadas**, con tarea,
  responsable, bloque, estado y fecha límite. La vista interna conserva sus
  columnas de HH, referencias EDT y acciones originales.
- La cabecera de cada fase muestra las mismas fechas, HH y comparación
  real/plan con los estilos de `ProjectModulesCard`. La función
  `phaseHeaderMeta` se comparte entre vistas.
- El avance del drawer y la barra se calcula con
  `calculateOperationalBlockProgress`, que reutiliza la función interna
  `blockDetail` del líder. No se infieren ni inventan progresos a partir del
  consumo de horas.
- El endpoint del colaborador solo agrega `teams: [{ teamId, leader }]`
  para identificar al líder del bloque. **No** entrega información adicional
  de cotización, presupuesto, facturación ni otros datos internos.

**Pruebas incorporadas:** interacción del Roadmap que abre el drawer, tabla
operativa read-only sin acciones aun recibiendo callbacks, y
`SegmentDrawer.test.tsx` verificando la ausencia de todas las acciones de
gestión. Incluye `ProjectModulesCard.phase-controls.test.tsx` para regresión
de la vista de Líder/PMO.

**Estado de validación:** cambios confirmados en GitHub. Las pruebas TypeScript,
Vitest y builds deben ejecutarse en el monorepo; no se reportan aprobados sin
ejecutarlos. Sin migraciones de base de datos.

## Corrección del Dashboard y tarjeta de tarea — 05/11/2026

**Atención requerida (colaborador):**
- Se elimina el conteo de tareas `in_review`: el colaborador ya las completó y el
  siguiente paso depende del líder aprobador.
- El KPI cuenta **sus tareas devueltas**: `status in ('todo','in_progress')`
  con `rejectionReason`, indicando «N tarea(s) por revisar» y «N devuelta(s)
  por el líder».
- Continúan los registros de horas rechazados del propio colaborador. Si no
  hay tareas devueltas ni HH rechazadas, muestra «Todo al día».
- Los datos ya estaban disponibles en `DashboardMyTask` y
  `DashboardHoursSummary`; no hubo cambios de API ni migraciones.

**Roadmap, detalle al seleccionar una tarea:**
- Se extrajeron `DetailPanel`, `Facts`, `Fact`, `Description` y
  `TaskDetail` desde `ProjectModulesCard.tsx` a
  `ProjectRoadmapTaskDetail.tsx`, manteniendo **el mismo CSS Module y
  estructura visual** del Roadmap de Líder/PMO.
- `ProjectModulesCard` y `MyProjectDetailPage` usan ahora la misma
  `ProjectRoadmapTaskDetail`, con título, equipo, responsable, estado,
  fecha de inicio/límite, ámbito, HH estimadas y descripción.
- El colaborador no recibe callbacks de edición, aprobación ni mutación.
  El drawer de bloques y la Bitácora no se modificaron.

**Regresiones añadidas/actualizadas:**
- `CollaboratorDashboard.test.tsx`: tarea enviada a aprobación no figura como
  acción requerida; tarea devuelta y horas rechazadas sí figuran.
- `MyProjectDetailPage.test.tsx`: selección de tarea muestra la tarjeta
  compartida, con datos completos y únicamente acción de cerrar.
- Mantener `ProjectModulesCard.phase-controls.test.tsx` para detectar cambios
  no deseados en la vista del Líder/PMO.

**Estado:** publicado en GitHub, a validar con Vitest y typecheck local.
Sin migraciones de base de datos.

