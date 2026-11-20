# Kora V5.02 — Correcciones de asignación, refetch y progreso global

Fecha: 2026-11-04. Rama de trabajo: `feature/calculadora-roadmap-diseno-v5-02`.

## 1. Error HTTP POST al asignar una tarea

Evidencia: petición `POST /api/projects/e96d8c62-179f-44a5-a333-f4bb5c7718be/modules/2c1eb4fb-a08a-4595-8dab-588c826dbb10/tasks` falló en
`DrizzleProjectModuleRepository.refreshSegmentClosure`, durante el SQL
`UPDATE project_module_segments AS segment SET closed_at = CASE ...`.

**Importante:** el log adjunto muestra el mensaje encapsulado `Failed query`
y la pila de ejecución, **no el mensaje PostgreSQL original del `cause`**.
Por lo tanto la causa SQL precisa no fue confirmada con código `SQLSTATE`
de PostgreSQL. El cambio elimina el uso de un UPDATE correlacionado
con el alias de la tabla destino y reemplaza esa expresión por:

- `SELECT` de cantidad de tareas activas y no aprobadas del segmento;
- `UPDATE` Drizzle ORM parametrizado del mismo segmento;
- ambos dentro de la transacción proporcionada por el caso de uso;
- conserva `closed_at` previo con `COALESCE` cuando todas las tareas
  activas están aprobadas, y reabre con NULL si existen pendientes o no
  hay tareas activas.

Se preserva el rollback atómico: la tarea, su auditoría y el cierre de
bloque se confirman juntos.

Se añadió la suite `drizzle-project-module.repository.spec.ts` con
casos sin tareas, con pendientes y con todas aprobadas.

**Validación real pendiente:** volver a crear/asignar la tarea en la UI
con API actualizada; si falla, obtener el `cause` / código PostgreSQL
para distinguir error de SQL de una migración previa incompleta.

## 2. Bloque recién creado sin recargar la página

`useInvalidateProjectsAndForecast` lanzaba el refetch de React Query,
pero retornaba `undefined`. Por eso `mutateAsync` del nuevo bloque
terminaba **antes** de que el proyecto en pantalla incluyese el segmento,
y `NewOperationalTaskModal` veía `module.segments` antiguos.

Ahora se espera `invalidateProjects()` (refetch de detalle activo) antes
de resolver la mutación. El Forecast se invalida sin bloquear el diálogo.
`projects.queries.test.tsx` contiene una prueba con GET del proyecto
demorado que demuestra que la mutación no termina antes del refetch.

## 3. Progreso: unificar backend y frontend

El problema previo: `project.progress` y `projects.actual_progress`
seguían calculándose por las tareas/entregas de cada fase, con fallback
por cantidad; la tarjeta interna del proyecto, el Roadmap y Avance del
equipo ya se habían cambiado a HH de bloques.

La solución es utilizar el cálculo de **bloques operativos reales** en
`calculateProjectProgress` y `calculateModuleProgress` cuando la
fuente trae `segments` (siempre desde los lectores reales del API).
Reglas alineadas con `calculateTeamProgress`:

- Denominador: suma de `segment.estimatedHours` válidas.
- Real: HH estimadas de tareas aprobadas `done` inequívocamente
  vinculadas al bloque, con tope en HH de bloque; o HH completas si el
  bloque tiene cierre registrado o entrega `approved`.
- Esperado: HH por días calendario inclusivos de inicio a fin del bloque,
  tomando la fecha actual en `America/Santiago`.
- Tareas canceladas excluidas. Tareas legacy sin vínculo explícito solo
  se asignan cuando el equipo tiene un único bloque en esa fase. Tareas
  sin bloque o con equipo incorrecto no contribuyen al avance.
- HH consumidas siguen siendo costo y no cambian el porcentaje real.
- Cuando faltan bloques/HH, el avance es `null` (Sin plan), nunca un
  0% ficticio basado en las HH comerciales.

`listProgressInputsForProjects` ahora trae segmentos, equipo y
`segment_id` de tareas/entregas para listados y Dashboard. El mapper
de detalle pasa los segmentos a `project.progress` y a
`project.modules[].progress`. `ProjectProgressRecalculator` se
ejecuta después de crear, modificar y eliminar bloques, tras el cierre
automático de tareas, y luego de materializar inicialmente la
cotización en `GetProjectUseCase` para refrescar `projects.actual_progress`.

Los callers legacy que no proporcionen `segments` mantienen la fórmula
anterior de ítems por fase para compatibilidad; el lector real SIEMPRE
envía `segments`, incluso `[]`.

## 4. Filtro de fechas antiguo al pie del Roadmap

Se eliminó el bloque `Opciones de cronograma · rango de fechas` que
aparecía después de `+ Agregar fase` **solo en la vista interna
operativa**. El portal cliente conserva sus controles anteriores.
También se retiró el CSS específico de ese bloque y se actualizó su
prueba de regresión.

## Seguridad y despliegue

- No hay migraciones nuevas ni operaciones `UPDATE` ejecutadas contra
  PostgreSQL desde este agente.
- Se modificó la lógica de la API: **reiniciar/recompilar API además de
  refrescar la web**.
- Los cambios están publicados en la rama; el `typecheck`, Vitest y
  la prueba real contra PostgreSQL requieren ejecución local.
- No hacer merge a `master` desde este conjunto de correcciones.

## Comandos de validación (PowerShell)

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run src/modules/projects/infrastructure/persistence/drizzle-project-module.repository.spec.ts src/modules/projects/application/services/project-progress.spec.ts src/modules/projects/application/use-cases/get-project.use-case.spec.ts src/modules/projects/application/use-cases/create-project-module-segment.use-case.spec.ts src/modules/projects/application/use-cases/update-project-module-segment.use-case.spec.ts

pnpm --filter @kora/web exec vitest run src/modules/projects/api/projects.queries.test.tsx src/modules/client-portal/components/PhaseRoadmap.header-actions.test.tsx src/modules/projects/lib/project-execution-progress.test.ts

pnpm --filter @kora/api build
pnpm --filter @kora/web build
```

## Diagnóstico PostgreSQL opcional, solo si sigue fallando

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'project_module_segments' AND column_name IN ('closed_at','estimated_hours'))
    OR
    (table_name = 'project_module_tasks' AND column_name IN ('segment_id','cancelled_at'))
  )
ORDER BY table_name, column_name;
```

## 5. Bloque de origen de la EDT visible antes de asignar tareas

Solicitud: en el Roadmap, la tabla `Tareas` mostraba
«Pendiente de planificar» en la columna **Bloque de trabajo** para
referencias de la cotización que aún no tenían colaborador asignado,
aunque la EDT comercial ya identificaba su fase y equipo.

Se corrigió la presentación en `ProjectModulesCard.tsx`:

- Una referencia `AppliedQuotationPlanning.modules[].tasks[]` con
  `teamId` muestra **`nombre de fase · nombre de equipo`** como
  **bloque comercial de origen** y conserva «Sin asignar» y
  «Por asignar» en sus columnas respectivas.
- Se utiliza la atribución original por fase/equipo de la versión de
  cotización, no el colaborador ni una fecha operacional inventados.
  Las referencias de la EDT no traen `segmentId` de PostgreSQL;
  el enlace con el segmento operativo se establece posteriormente al
  convertir o asignar la tarea.
- Para tareas ya convertidas que conservan el marcador
  `Referencia cotización <versionId> · WBS <wbs> · <rol>` pero todavía
  no tienen `segmentId`, se recupera ese **origen comercial**. Si
  existe `segmentId` efectivo, se sigue priorizando su nombre de
  bloque operativo; no se sobrescribe.
- Una referencia sin equipo de origen no se asocia por conjetura:
  aparece «Sin bloque de origen identificado».
- No se crean ni modifican tareas, bloques, asignaciones o datos de
  PostgreSQL. No hay migraciones.

Pruebas incorporadas en
`apps/web/src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx`:
dos tareas de una fase para UX-UI y Desarrollo sin colaborador,
una tarea convertida sin `segmentId` y una referencia sin `teamId`.

Validación mínima:

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx
```
