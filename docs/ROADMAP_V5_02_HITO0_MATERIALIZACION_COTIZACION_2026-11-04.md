# Kora V5.02 — Inicio de proyecto y materialización del Roadmap

Fecha: 2026-11-04. Rama: `feature/calculadora-roadmap-diseno-v5-02`.
Auditoría después de integrar cambios desde otro remoto en la rama.

## Alcance solicitado

1. Retirar la **Hoja de ruta** antigua de etapas dentro del Roadmap interno.
2. Cuando una cotización está aprobada por el cliente y **traspasada** al proyecto,
   y este tiene estado `active` con fecha de inicio o Hito 0,
   los bloques comerciales con semanas y HH deben materializarse en la línea temporal.

## Código auditado

- `drizzle-quotation.repository.ts / transferApproved`: guarda `project_teams`,
  fases con `project_modules.estimated_hours` y evento inmutable
  `quotation_transferred` con IDs de las fases.
- `quotation-transfer-references.ts`: expone `relativeTeamBlocks` con
  `teamId`, `hours`, `startWeek`, `durationWeeks`, basados en
  `draft.phases`. No inventa fechas en modo solo-referencia.
- `drizzle-approved-project-calendar.ts / ensure`: con proyecto iniciado y
  evento `quotation_transferred` no materializado, calcula fechas usando
  `approvedCalendarPeriod`, inserta `project_module_segments` con
  `estimatedHours = effort.hours` y una entrega planificada. Es transaccional
  e idempotente. Conserva segmentos existentes del mismo equipo y fase.
- `GetProjectUseCase`: verificaba además `snapshot.salesStage==='approved'`.
  Ese filtro duplicaba la condición comercial a pesar de que el generador
  autentica su origen mediante el evento de traspaso. Si la etapa comercial
  de la ficha cambió después del traspaso, no se llamaba al generador.
- `ProjectModulesCard`: dibujaba `PhaseProgressBar` en modo `embedded`
  bajo cada fase y un panel redundante de etapa actual/inicial. Son la antigua
  Hoja de ruta que se pidió retirar.

## Correcciones

- Se retiró `PhaseProgressBar embedded` y el cuadro redundante de etapas
  del Roadmap interno. No se toca el portal cliente ni se cambian las tareas,
  entregas o el Gantt operativo.
- `GetProjectUseCase` invoca el calendario para cualquier proyecto
  `development` activo y con fecha/Hito 0. El repositorio del calendario
  valida su evento `quotation_transferred`, por lo que una planificación
  preliminar `planning_baseline_applied` NO autoriza barras reales.
- Se diferencia en la referencia del Roadmap una planificación preliminar
  aún sin traspasar de un bloque efectivamente traspasado pendiente de
  materialización.
- Pruebas de regresión: `get-project.use-case.spec.ts` verifica que se
  intenta la materialización tras activar el proyecto incluso si luego
  cambió `salesStage`, y que se recargan los módulos generados; el test
  `ProjectModulesCard.phase-controls.test.tsx` verifica que desaparezca
  la Hoja de ruta sin ocultar las HH de la fase.

**Sin migración, sin UPDATE de datos existentes y sin merge de PR.**
No se afirma que el caso real esté resuelto en BD sin la verificación
del evento de traspaso y la materialización tras actualizar API y recargar.

## SQL de auditoría de un proyecto real

Sustituir el slug por el proyecto de la captura:

```sql
SELECT p.slug, p.status, p.sales_stage, p.start_date, p.hito0_at,
       v.id AS version_id, v.status AS version_status,
       e.action, e.occurred_at, e.metadata
FROM projects p
LEFT JOIN project_quotations pq ON pq.project_id = p.id
LEFT JOIN quotation_versions v ON v.quotation_id = pq.id
LEFT JOIN quotation_events e ON e.version_id = v.id
    AND e.action IN (
      'planning_baseline_applied',
      'quotation_transferred',
      'roadmap_calendar_materialized'
    )
WHERE p.slug = 'SLUG_DEL_PROYECTO'
ORDER BY e.occurred_at, v.id;
```

Interpretación:

- `quotation_transferred` + proyecto `active` + fecha/Hito 0:
  debe generarse el cronograma en el siguiente GET autorizado.
- `roadmap_calendar_materialized`: ya hubo un intento de materialización.
  Revisar `metadata.generatedBlocks`. No se repite automáticamente para
  no reintroducir bloques borrados manualmente.
- Solo `planning_baseline_applied`: no consta traspaso comercial definitivo;
  se muestran referencias, pero no se deben generar bloques reales.
- Las fases con `estimated_hours` no implican que los segmentos preexistentes
  tengan `estimated_hours` definidos; no copiar las HH de la fase a
  varios bloques de un mismo equipo.

## Validación de integración (PowerShell)

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck
pnpm --filter @kora/api exec vitest run src/modules/projects/application/use-cases/get-project.use-case.spec.ts src/modules/projects/infrastructure/persistence/drizzle-approved-project-calendar.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx
```

Para comprobar la persistencia real, reiniciar la API local (no basta
con refrescar la web), abrir el detalle del proyecto y verificar que
`project_module_segments` tenga fechas y HH por bloque.

## Ajuste posterior: sin recargar y limpieza visual (04-11-2026)

Tras confirmar en la UI que recargar el navegador mostraba correctamente los
bloques creados al activar un proyecto, se resolvió la sincronización de React
Query: `useInvalidateProjects` ahora devuelve la promesa de
`queryClient.invalidateQueries({ queryKey: projectKeys.all })`, y
`useChangeProjectStatus` espera esa promesa en `onSuccess`.
En `EditProjectDialog`, el guardado de datos (incluyendo fecha inicial) y
el cambio de estado son operaciones secuenciales. El segundo `mutateAsync`
ahora termina cuando la consulta activa del proyecto ya se actualizó con
los módulos que devolvió `GetProjectUseCase`. No se agrega polling ni se
utiliza recarga forzada.

La sección interna `Entregas y tareas en el cronograma · N entregas,
M tareas` fue retirada de `OperationalPhaseCard` en `PhaseRoadmap.tsx`.
No se quitó la información de tareas, ni los diamantes de cierre sobre
las barras; el portal cliente sigue utilizando su Roadmap independiente.

Los avisos morados del Roadmap que describen pendientes de asignación
ocultan `Asignar tareas` mientras ese equipo no tenga miembros con
`userStatus === 'active'` y `blockedAt` vacío. Cuando haya un miembro
elegible, aparece el botón habitual.

Pruebas de regresión añadidas/actualizadas:
- `apps/web/src/modules/projects/api/projects.queries.test.tsx`:
  secuencia fecha + activación y actualización del mismo observador activo
  sin desmontarlo o recargar la página.
- `apps/web/src/modules/client-portal/components/PhaseRoadmap.header-actions.test.tsx`:
  ausencia del subcronograma operativo, conservación del resto.
- `apps/web/src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx`:
  botón ausente sin dotación o con colaborador bloqueado y presente al
  existir colaborador activo.

Validación local pendiente:
```powershell
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run src/modules/projects/api/projects.queries.test.tsx src/modules/client-portal/components/PhaseRoadmap.header-actions.test.tsx src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx
```
No hay cambios de esquema ni migraciones; no se alteró PostgreSQL.
