# Kora 2.0 · Dashboard colaborador v6 — homologación de referencia

Fecha: 2026-11-05
Rama: feature/calculadora-roadmap-diseno-v5-02
Ruta: /dashboard (actor con rol collaborator)

## Objetivo

Homologar la pantalla del colaborador con la referencia visual aportada por producto,
conservando Kora (color, tarjetas, tipografía, botones, permisos y consultas reales).

## Modificaciones

1. Cabecera «Mi Panel de Actividad», saludo contextual, equipo, proyectos y CTA
   «Registrar horas» solo cuando hours:register está autorizado.
2. Cuatro KPI de /dashboard/summary:
   - Progreso Diario (8 HH como referencia de jornada, mismas HH registradas
     que devuelve el backend, visualización circular);
   - HH registradas esta semana (meta semanal descontando feriados);
   - Horas extra este mes y esta semana;
   - Atención requerida: tareas en revisión de líder, tareas devueltas y
     registros de horas rechazados, sin confundir estos estados.
3. Mis Tareas: cinco filtros (Todas, Pendiente, En curso, Completada, Aprobada),
   chips combinables (devuelta/vencida), barras de HH registradas con datos
   approvedHours + pendingHours contra estimatedHours, sin asignación
   ficticia de HH por aprobación de tarea. Empezar lleva a in_progress
   y Marcar completada lleva a in_review; done queda reservado al líder.
4. Planificación Semanal + Mi Equipo en columnas adaptativas. Reutilizan el
   payload autorizado DashboardMyPlanning, proveniente de forecast; los
   montos son HH **planificadas**, no consumidas de compañeros. Se mantiene
   paginación de miembros y estados de datos vacíos.
5. Historial Reciente: muestra por defecto los últimos 21 días, con filtro de semana/rango, paginación, vínculo visible a
   fase, bloque y tarea (si la tarea está entre las autorizadas), aprobador,
   actividad, HH, estado y botón Ver que abre detalle de solo lectura.
   La edición continúa en /horas con sus reglas existentes.

## Archivos

- apps/web/src/modules/dashboard/pages/DashboardPage.tsx
- apps/web/src/modules/dashboard/components/CollaboratorDashboard.tsx
- apps/web/src/modules/dashboard/components/CollaboratorDashboard.module.css
- apps/web/src/modules/dashboard/components/CollaboratorOverviewSections.tsx (nuevo)
- apps/web/src/modules/dashboard/components/CollaboratorOverviewSections.module.css (nuevo)
- apps/web/src/modules/dashboard/components/RecentHistoryCard.tsx
- apps/web/src/modules/dashboard/components/RecentHistoryCard.module.css
- apps/web/src/modules/dashboard/components/CollaboratorDashboard.test.tsx

## Datos y seguridad

- Solo datos propios para las entradas de horas (filtro userId desde sesión).
- Los integrantes del equipo usan los datos de planificación del actor,
  **no** lectura directa de bitácoras ajenas ni permiso especial de forecast.
- HH registradas por tarea = aprobadas + pendientes vinculadas, no HH
  estimadas ni tarea aprobada = consumo.
- hour_entries.task_id sigue opcional y reutiliza el modelo existente.
- Se respeta invalidación de caché en mutaciones de tareas y bitácora.
- No se cambian contratos, API, modelo de BD ni migraciones.

## Comandos PowerShell de integración + validación

Desde la raíz del monorepo:

~~~powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
git rev-parse --short HEAD

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Falló typecheck Web" }

pnpm --filter @kora/web exec vitest run src/modules/dashboard/components/CollaboratorDashboard.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Fallaron pruebas del dashboard colaborador" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Falló build Web" }

Write-Host "Dashboard colaborador validado en compilación y tests." -ForegroundColor Green
~~~

## Validación funcional pendiente

- Sesión colaborador en /dashboard: 4 KPIs + 5 tabs + planificación + equipo +
  historial, sin duplicaciones ni datos de otros actores.
- Comprobar visualmente la captura de referencia en escritorio y móvil.
- Cambiar entre tabs y confirmar conteos de tareas reales.
- Comprobar una tarea devuelta/vencida, una completada y una aprobada con
  HH aún menores que su estimación.
- Al pulsar Empezar la tarea pasa a En curso; al pulsar Marcar
  completada queda por aprobar, jamás aprobada unilateralmente.
- Confirmar filtro de historial, detalle Ver y cambios de período.
- Verificar que los KPI de HH varían tras un registro nuevo sin recargar
  manualmente la página.

**Estado:** implementado y publicado en GitHub, revisado estáticamente.
La ejecución de TypeScript, Vitest y la revisión visual local depende de
la integración del desarrollador. No se ha modificado master ni fusionado PR.


## Ajuste posterior: Historial Reciente, edición y detalle

- Añadido botón lápiz para entradas propias pendientes/rechazadas, reutilizando
  HourEntryFormDialog. Entradas aprobadas no ofrecen edición al colaborador.
- Las entradas de meses cerrados conservan el lápiz deshabilitado y explican
  la restricción mensual impuesta por UpdateHourEntryUseCase (excepto admin/PMO).
  No se alteró la política de períodos cerrados.
- El ojito ahora abre «Detalle del registro» compacto con Fecha (día de la
  semana), Asignación, Proyecto, Fase, Bloque de trabajo, Tarea (si existe),
  Actividad, Horas trabajadas, Descripción, Bloqueo o problema y Estado.
  Los casos de rechazo incluyen el motivo, y las horas extra se identifican.
- Se consulta GET /hour-entries/:id al abrir el detalle para exponer
  decisionBy y decisionAt reales; no se atribuye una aprobación al líder actual
  del proyecto si no fue quien decidió.
- Para registros sin tarea se muestra «Otro trabajo», sin inventar referencias.
  Si hay taskId pero su tarea no está en el resumen autorizado del colaborador,
  se mantiene el vínculo sin inventar su nombre.
- Pruebas nuevas: RecentHistoryCard.details.test.tsx; test anterior de
  CollaboratorDashboard actualizado para el detalle.
- Sin migraciones ni cambios de backend.

### Validación puntual

~~~powershell
pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Falló typecheck Web" }

pnpm --filter @kora/web exec vitest run src/modules/dashboard/components/RecentHistoryCard.details.test.tsx src/modules/dashboard/components/CollaboratorDashboard.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Fallaron pruebas del historial" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Falló build Web" }
~~~
