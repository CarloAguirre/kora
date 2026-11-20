# Kora · Roadmap V5.02 · Líder de equipo: bloqueo, tareas y acceso

Fecha: 2026-11-04 · Rama: `feature/calculadora-roadmap-diseno-v5-02`

## Acceso a proyectos tras traspaso de cotización aprobada

**Causa:** las comprobaciones de lectura/listado usaban `project_teams.leader_user_id` como único líder válido, aunque el resto de la aplicación ya utilizaba el líder efectivo `coalesce(project_teams.leader_user_id, teams.leader_user_id)`. Las cotizaciones pueden asignar un equipo a un proyecto sin líder particular: en ese caso debe habilitarse automáticamente el líder habitual.

**Corrección:** `DrizzleProjectTeamRepository.findByProject` expone líder efectivo e identidad; `DrizzleProjectRepository.search` aplica el mismo criterio para `assignedToUserId`. `isTeamLeaderForProject` exige que el equipo esté vinculado a ese proyecto. El frontend reutiliza `project.teams[].leader` sin permisos globales ni filas artificiales en `project_team_members`.

**Precedencia:** una designación explícita por proyecto prevalece sobre el líder habitual. Si ninguno está definido, no se concede acceso implícito.

## Líder de equipo: bloqueo de colaboradores

- En «Editar equipo», `Bloquear` marca la acción pendiente de guardado; `Deshacer` revierte el borrador.
- Guardar invoca la API de desasignación, que ahora bloquea lógicamente en `project_team_members.blocked_at`: no borra registro de participación ni `hour_entries`.
- Las tareas abiertas (`todo`, `in_progress`) del colaborador en ese equipo quedan sin responsable y en `todo` («Por asignar»). Las aprobadas/en revisión mantienen su historia.
- Se sincroniza Forecast, progreso y cierre de bloques dentro de la transacción. La operación conserva trazabilidad de auditoría.
- Los colaboradores bloqueados dejan de contar para los cupos y no aparecen en selectores para asignar tareas/entregas; pueden reincorporarse sin duplicar la relación histórica.

## Tareas del equipo

El menú del líder muestra `Reasignar`, `Editar`, `Eliminar`. Reasignar selecciona un colaborador activo del mismo equipo, preserva HH históricas y deja la tarea pendiente para el nuevo responsable. Editar reutiliza `ExecutionTaskModal` con las fechas, bloque, estado y HH. Eliminar pide confirmación.

Cuando una tarea esté aprobada, en revisión o tenga actividad registrada en su módulo por su colaborador, la API conserva un registro cancelado con `project_module_tasks.cancelled_at` y saca esa tarea del plan activo/Forecast; no elimina registros de horas. No existe `hour_entries.task_id`: por ello la comprobación de actividad es conservadora por proyecto+módulo+usuario, **no** atribuye un número de HH a una tarea específica. Las canceladas siguen disponibles para auditoría, no en listados operativos.

## Migración

`packages/db/migrations/0053_project_member_block_and_task_cancel.sql` agrega dos columnas reversibles `blocked_at` y `cancelled_at` (ambas admiten null). Ejecutar **antes** de iniciar API/Web actualizadas. No se modifican horas históricas ni se borran tareas durante la migración.

## Validación sugerida

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts build
pnpm --filter @kora/core build
pnpm --filter @kora/db build

# DB: configurar DATABASE_URL desde apps/api/.env y ejecutar pnpm db:migrate

pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck
pnpm --filter @kora/api exec vitest run src/modules/projects/application/use-cases/get-project.use-case.spec.ts src/modules/projects/application/use-cases/unassign-project-team-member.use-case.spec.ts src/modules/projects/application/use-cases/delete-project-module-task.use-case.spec.ts src/test/architecture.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/projects/components/ProjectManagerTeamDetailView.test.tsx src/modules/projects/pages/DevelopmentProjectDetailView.test.tsx
pnpm --filter @kora/api build
pnpm --filter @kora/web build
```

Validación manual crítica: crear proyecto desde cotización aprobada asignando equipos sin `leader_user_id` específico; iniciar sesión como su líder habitual; comprobar que aparece en Proyectos, abre la ficha y su equipo, sin acceso a equipos ajenos. Luego bloquear colaborador con tareas pendientes y HH históricas: se libera tarea, se conserva HH. Probar reasignación, edición, cancelación y reapertura sin pérdida de bitácora.

**Nota de verificación:** commit publicado en GitHub, no se ha ejecutado typecheck/tests sobre este HEAD desde esta sesión.
