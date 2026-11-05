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
pnpm --filter @kora/web exec vitest run src/modules/projects/pages/MyProjectsPage.test.tsx src/modules/projects/pages/MyProjectDetailPage.test.tsx
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
