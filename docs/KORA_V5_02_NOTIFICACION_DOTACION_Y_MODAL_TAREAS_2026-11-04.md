# Kora V5.02 — Líder de equipo: aviso de dotación y asignación de tareas

Fecha: 2026-11-04. Rama: `feature/calculadora-roadmap-diseno-v5-02`.

## Solicitudes implementadas

1. Al aprobar y traspasar una cotización, cuando los equipos reciban HH de
   ejecución, la campanita del **líder efectivo** de cada equipo debe mostrar
   un recordatorio accionable si faltan colaboradores en ese proyecto.
   El enlace abre directamente `/proyectos/:projectSlug/equipos/:teamSlug`.
2. En la vista del líder de equipo, retirar el resumen **Avance del proyecto**
   y conservar **Avance del equipo**.
3. Convertir el modal **Asignar tareas** en una tabla ancha que muestre a la vez
   nombre, HH, asignación, fecha de inicio y fecha límite, como en el prototipo
   aprobado; evitar barra horizontal en escritorio. Un selector de bloque solo
   aparece si hay más de un bloque en esa fase/equipo.

## Diseño del recordatorio

Se amplió el contrato de `GET /reminders/me` con `teamsAwaitingStaffing`.
La campanita ya usa este endpoint para los avisos dinámicos de la primera
captura. Por coherencia, **no se insertan registros persistentes por cada
consulta**: el aviso aparece mientras haya trabajo pendiente y desaparece al
resolverlo. Esto impide duplicados y notificaciones obsoletas.

El lector SQL selecciona solo equipos:
- vinculados a un proyecto de desarrollo no cancelado ni finalizado;
- con `project_teams.assigned_hours > 0`;
- cuyo proyecto posea el evento **`quotation_transferred`** de una versión
  comercial (no basta editar `sales_stage`);
- cuyo líder efectivo sea el usuario autenticado:
  `COALESCE(project_teams.leader_user_id, teams.leader_user_id)`;
- cuya cantidad de colaboradores activos, no bloqueados y todavía miembros
  del equipo sea menor a `project_teams.member_count` si se definió, o menor
  a 1 si no se definió cantidad.

Así, el aviso también sirve para proyectos ya traspasados antes de este cambio.
El frontend de cotizaciones invalida el recordatorio tras el traspaso; cuando
el líder asigna colaboradores, las mutaciones existentes de proyecto ya
invalidan `['notifications','reminders']`. Adicionalmente, el endpoint se
reconsulta cada 60 segundos y al volver a la pestaña.

La URL usa la función existente `projectTeamPath` y los slugs persistidos,
no una ruta improvisada.

## Cambios visuales

- `TeamLeaderProjectView.tsx`: se quitó la tarjeta redundante de
  `ProjectTimeline`; se mantuvo `TeamProgressCard`.
- `AssignBlockTasksModal.tsx`: `Modal wide` y selector del bloque solo si
  hay múltiples alternativas. La asignación sigue usando las mismas
  mutaciones, validación de fechas, HH, `segmentId` y manejo de errores
  parciales; no se cambian las reglas.
- `AssignBlockTasksModal.module.css`: tabla de 5 columnas distribuidas,
  800px de ancho máximo, campos de fechas visibles en escritorio. En pantallas
  pequeñas permite desplazamiento horizontal como fallback accesible.

## Pruebas y validación

Se actualizaron las pruebas de recordatorios de la API y de asignación;
se añadió una suite para navegación de la campanita al equipo.

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
pnpm --filter @kora/contracts typecheck
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck
pnpm --filter @kora/api exec vitest run src/modules/reminders/application/use-cases/get-leader-reminders.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/notifications/components/NotificationBell.test.tsx src/modules/projects/components/AssignBlockTasksModal.test.tsx
```

**No se crearon migraciones**. Se usa la tabla de cotizaciones y los equipos
existentes, y el endpoint de recordatorios existente. Aún debe ejecutarse
localmente el typecheck y Vitest; no se afirma PASS desde GitHub.
