# Kora v5.02 · Restauración de marcadores de tareas y zoom del Roadmap

Fecha: 2026-11-05
Rama: `feature/calculadora-roadmap-diseno-v5-02`

## Objetivo de diseño

En la ficha interna de proyectos se conserva el visor operativo v5.02:
las fases y los bloques de trabajo continúan representados por sus barras,
sus entregas por diamantes y el progreso por el motor vigente.

Se restauran, **dentro de ese mismo visor y sin volver al antiguo
subcronograma redundante**:

1. Marcadores/checks de tareas, posicionados según su **fecha límite real**;
2. estado visual **aprobada** (check oscuro), **próxima** (contorno) y
   **atrasada** (marcador rojo). La fecha vencida no se infiere de HH consumidas;
3. clic o teclado sobre el marcador abre el **detalle de la tarea por su ID
   real** (`renderSelectionDetail` → `TaskDetail`), con nombre, asignado,
   fecha, HH estimadas, descripción y estado; volver a pulsar lo deselecciona;
4. marcadores de entregas planificadas, entregadas y atrasadas;
5. zoom por fase **Semanas → Días**, con slider 0–100 y botones −/+;
6. el zoom ensancha **el mismo eje** (100%–400%) para barras de bloques,
   diamantes y marcadores; transición CSS de 260 ms, scroll horizontal y
   etiquetas de días cuando se acerca la vista;
7. cada fase conserva su propio estado de zoom; una fase sin fechas no genera
   marcadores ni zoom artificiales.

## Reutilización, sin duplicación de entidades

- `PhaseRoadmap.tsx`: se reutilizan `taskItemSymbol`,
  `MarkerTrackRow`, `DELIVERY_STATE_LABEL`, `TASK_ITEM_STATE_LABEL`,
  `barGeometry`, `buildTimelineAxis` y el callback de selección del
  Roadmap operativo.
- `PhaseRoadmap.module.css`: estilo y animación por contenedor;
  nombres de los bloques quedan visualmente fijos al desplazarse por la pista.
- `project-detail.adapter.ts`: no se modificó. Ya genera `taskItems`
  desde `module.tasks` y los estados `done / upcoming / delayed` a
  partir de la aprobación de la tarea y su fecha límite.
- `ProjectModulesCard.tsx`: no necesita cambios; ya resuelve
  `selection.kind === 'task'` contra la tarea operativa existente y muestra
  `TaskDetail`.

La funcionalidad es **solo de visualización**, no crea tareas, no aprueba,
no modifica planes, cotizaciones ni HH y **no necesita migraciones**.

## Pruebas de regresión

`apps/web/src/modules/client-portal/components/PhaseRoadmap.header-actions.test.tsx`:
- Marcadores de tareas aprobadas, próximas y atrasadas;
- selección/deselección y detalle por ID;
- entregas recuperadas;
- slider y botones de zoom (100% → 400%) y cuadrícula diaria;
- zoom por fase independiente;
- referencias sin fecha sin marcadores inventados;
- conservación del portal cliente y del Gantt operativo.

## Integración PowerShell

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Error de typecheck web" }

pnpm --filter @kora/web exec vitest run src/modules/client-portal/components/PhaseRoadmap.header-actions.test.tsx src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Error en pruebas del Roadmap" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Error en build web" }
```

Validar visualmente en `/proyectos/prueba-dev-2`, pestaña Roadmap:
marcadores por fecha debajo de los bloques, rojo para tarea atrasada, 
detalle al hacer clic, slider días/semanas y scroll que mantiene el contexto
de etiquetas.

**Estado:** cambios publicados en GitHub y verificación estática del código;
TypeScript, Vitest y renderización local aún requieren ejecución en la
instalación del desarrollador. No integrado a `master`.
