# Kora 2.0 — Homologación visual del dashboard y tareas de proyectos eliminados (2026-11-05)

Rama: `feature/calculadora-roadmap-diseno-v5-02`

## Solicitud

La referencia del dashboard colaborador v6 debía conservar tarjetas, márgenes y elevación de Kora, no crear un sistema visual paralelo. Además, al pulsar «Empezar» se reportó `PROJECT_NOT_FOUND` para una tarea cuyo `projectId` provenía de `/dashboard/summary`.

## Diagnóstico de código

- `DashboardLayout` ya aplica padding responsivo con `--kora-space-6` (desktop) / `--kora-space-4` (tablet). El dashboard colaborador introducía `max-width:1240px` y `margin:auto`, alterando la alineación con las demás páginas.
- Kora ya ofrece `Card` con `--kora-blue-200`, `--kora-radius-lg`, `--kora-shadow-card` y padding propio. Los KPI, «Mis tareas» y planificación tenían sombras/bordes distintos.
- `listTasksAssignedToUser` hace join a `projects` y entrega un `projectId` real, pero **no filtraba** `projects.deleted_at`. `UpdateProjectModuleTaskUseCase` llama `projects.findById` y responde `PROJECT_NOT_FOUND` si el proyecto está borrado lógicamente. `listDeliveriesAssignedToUser` tenía la misma omisión.
- No se determinó con acceso SQL si el proyecto reportado (`a683b310-99ee-4faa-a03c-a05674a37736`) está borrado. Si no lo está, hay que verificar que GET y PATCH apunten a la misma instancia/BD. La asignación del colaborador **no** explica por sí sola el error, que ocurre antes de verificar la tarea y sus permisos.

## Cambios

- Vista colaborador sin centrado ni ancho máximo interno: utiliza el padding responsivo existente.
- `Card` compartido para KPI, Mis tareas, Planificación Semanal y Mi Equipo. El Historial Reciente ya utilizaba Card y no se modificó.
- Consultas del repositorio filtran `projects.deleted_at IS NULL` para tareas y entregas del dashboard; nunca eliminan ni alteran tareas históricas.
- Test unitario de las condiciones SQL de ambas consultas.

## Auditoría SQL de solo lectura para el proyecto del error

```sql
-- 1. Confirmar existencia y estado real del proyecto.
SELECT id, name, slug, status, deleted_at
FROM projects
WHERE id = 'a683b310-99ee-4faa-a03c-a05674a37736'::uuid;

-- 2. Confirmar que la tarea corresponde a ese proyecto y a qué usuario.
SELECT t.id AS task_id, t.name AS task_name, t.status AS task_status,
       t.assignee_user_id, t.cancelled_at,
       pm.id AS module_id, pm.project_id, p.name AS project_name, p.deleted_at
FROM project_module_tasks t
JOIN project_modules pm ON pm.id = t.module_id
JOIN projects p ON p.id = pm.project_id
WHERE t.id = '72edc36d-9d8f-4439-a155-c87e48035bc5'::uuid;
```

Resultado **no ejecutado**; no presumir que la BD del usuario ya fue auditada.

## Validación mínima (desde raíz; PowerShell)

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw 'Falló typecheck Web' }
pnpm --filter @kora/web exec vitest run src/modules/dashboard/components/CollaboratorDashboard.test.tsx
if ($LASTEXITCODE -ne 0) { throw 'Falló test Dashboard' }

pnpm exec turbo run typecheck --filter=@kora/api --force
if ($LASTEXITCODE -ne 0) { throw 'Falló typecheck API' }
pnpm --filter @kora/api exec vitest run src/modules/projects/infrastructure/persistence/drizzle-project-module.repository.dashboard.spec.ts
if ($LASTEXITCODE -ne 0) { throw 'Falló test de consulta' }
```

No se incluyen migraciones: cambios en frontend, consulta del repositorio y tests, sin DDL. No se ha afirmado PASS local ni validación visual.
