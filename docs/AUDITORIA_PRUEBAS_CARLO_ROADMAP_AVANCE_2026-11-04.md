# Kora V5.02 — Auditoría real de `pruebas-carlo`

Fecha: 2026-11-04. Evidencia: salidas de cuatro consultas `SELECT` ejecutadas por el responsable del proyecto en su PostgreSQL. No representan una ejecución autónoma ni acceso directo a la BD por parte de este agente.

## Estado persistido observado

- Proyecto **Pruebas Carlo**, estado `draft`, 900 HH vendidas y 0 HH consumidas a nivel de proyecto.
- Presupuesto por equipo: Desarrollo 640 HH, QA 140 HH, UX-UI 120 HH. Total **900 HH**, consistente con la venta.
- Colaboradores asignados: Desarrollo 0 HH, QA 0 HH, UX-UI 100 HH; faltan **20 HH UX-UI por distribuir a personas** si el objetivo es distribuir la totalidad del presupuesto. Un presupuesto de equipo no es automáticamente una asignación individual.
- Bloques operativos:
  - Desarrollo / S3 Frontend PWA: `e93020c5-3394-4c3e-ac22-e2f3a7d23c98`, 2026-11-05 a 2026-11-15, `estimated_hours=NULL`.
  - UX-UI / S1 Diseño: `debf9336-ff01-40fa-8327-8a8d3ef20d5a`, 2026-11-02 a 2027-03-28, `estimated_hours=NULL`.
  - UX-UI / S1 Diseño: `a88318e4-33d2-45e0-a29f-892b636a6b86`, 2026-12-25 a 2027-04-25, `estimated_hours=NULL`.
  - QA: **ningún bloque** registrado en los resultados.
- El primer bloque UX-UI tiene **una tarea vinculada de 2 HH, estado `todo`**; ninguna tarea `done` en los bloques listados. No hay entrega aprobada ni bloque cerrado en esos resultados.
- No se obtuvieron registros de HH aprobadas históricas sin bloque (Q3 vacío); tampoco se observaron HH consumidas por bloque.
- Existe tarea operativa de **160 HH sin `segment_id`** en S3, registrada bajo **UX-UI**, con referencia comercial `WBS-10 · Desarrollador Frontend PWA`. La pertenencia a UX-UI es potencialmente inconsistente con el rol; **no se corrige automáticamente** sin validar quién debe ejecutarla. Su presupuesto supera las 120 HH asignadas a UX-UI.

## Diagnóstico

1. **No se puede calcular avance real/esperado por HH de los bloques**, porque todos los segmentos persistidos tienen presupuesto `NULL`. El sistema debe mostrar *Sin plan operativo*, nunca 0% como porcentaje definitivo. Las HH vendidas/asignadas a un equipo no equivalen a HH de cada bloque, especialmente cuando UX-UI tiene dos tramos.
2. **Una referencia EDT fue convertida en tarea sin bloque**, por lo que no participa en el avance del Roadmap; no se deben sumar 160 HH a un segmento supuesto.
3. **QA tiene 140 HH comerciales y ningún bloque de ejecución** según la consulta, lo que requiere completar el calendario operativo o confirmar que la planificación aún no ha comenzado.
4. El proyecto está en `draft`: esto no equivale por sí solo a actividad real o a avance, y debe distinguirse de datos operativos completos.

## Correcciones de aplicación publicadas en la misma rama

- Fix del `typecheck`: variable sin usar en vista PM y literal `'done' as const` en prueba.
- La suite `team-progress.spec.ts` no era descubierta por `vitest.config.ts` (solo `*.test.ts[x]`); se renombró a `team-progress.test.ts`.
- Formularios nuevos de tarea operativa y conversión desde referencia requieren seleccionar un bloque del mismo equipo/fase; asignación masiva tampoco puede dejar una tarea fuera de un bloque.
- En **Editar tarea**, el PM puede cambiar el **equipo responsable** aunque el equipo destino no tenga colaboradores; luego vincula el bloque y puede dejar la persona sin asignar. Si existe `allowedTeamId`, el selector de equipo permanece bloqueado. La edición de una tarea originada en cotización exige un bloque válido.
- Se agregaron pruebas para el guard de conversión, la creación de tareas con bloque y la reasignación de tarea histórica.
- El contador de tareas sin bloque del Avance del equipo ahora incluye tareas de fases en las que el equipo **no tiene ningún bloque** (situación real de la referencia de 160 HH); antes se omitían al saltar la fase completa.

## Conciliación de datos pendiente (sin UPDATE automático)

1. Validar y cargar manualmente **HH estimadas por cada bloque** en el Roadmap. Especialmente decidir cómo repartir las 120 HH UX-UI entre sus dos segmentos; no es correcto asignarles 120 HH a ambos.
2. Revisar la referencia `WBS-10` de 160 HH: decidir si el dueño operativo es Desarrollo, asignar esa tarea al equipo correcto, asociarla al bloque S3 correspondiente y verificar que sus fechas caigan dentro del rango del bloque. La interfaz permite cambiar equipo sin exigir una persona antes de completar la dotación.
3. Definir si y cuándo se planifica un bloque operativo para QA.
4. Revisar las 20 HH restantes por asignar a colaboradores de UX-UI, si deben distribuirse.
5. Ejecutar las pruebas y `typecheck` del web en el repositorio local. No se afirma PASS sin el resultado real.

**Seguridad:** no hay migraciones ni modificación de filas de PostgreSQL en este conjunto de correcciones. Las tareas históricas se preservan para que una persona autorizada las concilie.

## Verificación del traspaso comercial y las HH

La captura recibida es del prototipo local `kora-proyectos-v5_02.html` (607 HH: PMO 36, QA 110, RPA 461), no de las tablas reales de `pruebas-carlo` (900 HH: Desarrollo 640, QA 140, UX-UI 120).

El caso `applyPlanningBaseline` de `drizzle-quotation.repository.ts` valida las sumas EDT y guarda horas en `project_teams` y `project_modules`, pero no crea tareas ni bloques de ejecución. El traspaso de cotización cliente-aprobada guarda presupuestos comerciales; `drizzle-approved-project-calendar.ts` materializa nuevos segmentos con `estimatedHours = effort.hours` al iniciar el proyecto, preservando los segmentos previos del PM. En estado `draft`, esa materialización no ocurre. Los segmentos creados por operación permiten HH opcionales, que quedan en NULL si no se definen. La suma de tareas operativas solo puede determinar un presupuesto completo si se confirma que el desglose de ese bloque está terminado.

## Validación de la integración recibida

La salida adjunta muestra 7 tests fallidos, 18 aprobados y build web completado con aviso de tamaño de bundle. El contenido está recortado a la parte final; los fallos visibles corresponden a búsqueda literal de la etiqueta obligatoria Bloque de trabajo. Los tests nuevos se ajustaron a etiquetas con asterisco requerido. También se clarificó que los bloques sin estimación tienen HH sin definir, no presupuesto real cero. Pendiente repetir los checks sobre el HEAD actualizado.
