# Kora V5.02 — Avance del equipo

Fecha: 2026-11-04

## Solicitud

En la ficha existente `/proyectos/:proyecto/equipos/:equipo`, sustituir
el indicador «Avance del proyecto» por «Avance del equipo», con el
acordeón del prototipo: franja real/plan, diagnóstico de atrasos,
explicación de fórmulas y tabla de fases/bloques.

## Implementación

- `apps/web/src/modules/projects/lib/team-progress.ts`: función pura
  `calculateTeamProgress(project, teamId, today)`. Reutilizable por PM/PMO
  y líder. No importa persistencia ni duplica cálculos.
- `apps/web/src/modules/projects/components/TeamProgressCard.tsx` y
  `.module.css`: componente visual, desplegable accesible con
  `aria-expanded`/`aria-controls`, barra real/esperado, tarjetas de
  metodología, causas y desglose.
- `TeamLeaderProjectView.tsx`: ya no usa el avance global
  `project.progress` en su KPI ni en la barra. Utiliza avance del equipo,
  y la fecha objetivo de sus propios segmentos cuando está disponible.
- `ProjectManagerTeamDetailView.tsx`: sustituye su algoritmo propio por
  el mismo cálculo/componente. No altera tareas ni entregas existentes.

## Reglas de cálculo

- **Plan total** = suma de `segments[].estimatedHours` positivos
  vinculados al `teamId` seleccionado. Una fase sin bloques del equipo
  queda fuera del cálculo.
- **Plan a hoy** de cada bloque = HH del bloque ×
  fracción de días calendario transcurridos, desde inicio hasta fin,
  ambos inclusivos (0% antes del inicio, 100% en el último día).
  Se usa el día vigente en `America/Santiago`.
- **Real** de un bloque = HH de tareas `done` (aprobadas) asociadas al
  bloque, acotadas a su presupuesto. Si `closedAt` está definido o su
  entrega `segmentId` está `approved`, se considera 100%. Una entrega
  solo `delivered` está pendiente de aprobación y NO lo cierra.
- **Real del equipo** = suma de HH reales de sus bloques / suma de HH
  planificadas de sus bloques, con tope 100%.
- **Esperado del equipo** = suma de HH esperadas por fechas de bloque /
  suma de HH planificadas, con tope 100%.
- **Brecha por fase** = (HH esperadas − HH aprobadas/cerradas de esa fase)
  dividido por el total de HH planificadas del equipo, en puntos porcentuales
  del total del equipo; no es simplemente la diferencia de porcentajes
  internos de esa fase.
- **Consumo** = suma de `project.members[].consumedHours` del equipo
  (incluidos bloqueados para preservar la historia) / HH asignadas al
  equipo. Es costo real y **nunca** sustituye el avance del trabajo.
- **Atraso** se muestra si real está bajo esperado; cuando
  `status='on_hold'` y `stopsClock`, se muestra «Pausado».
- **Tareas legacy**: asociar por `segmentId`, marcador histórico
  ` · ID <uuid>`, o —solo si el equipo tiene un único bloque en
  esa fase— por `teamId`. Una tarea sin bloque inequívoco en fases
  de varios bloques no se prorratea; se advierte su cantidad.
- **Canceladas** se omiten. Una tarea `in_review` no suma real hasta
  su aprobación. Se informa en las causas de brecha junto con las
  vencidas y pendientes de asignación.
- Sin HH positivas de bloques, el estado es **Sin plan**, con porcentajes
  `null`, no se inventa un 0% definitivo.

## Límite de fuente de datos: HH consumidas por bloque

La tabla `hour_entries` contiene `project_id`, `module_id` y
`user_id`, pero **no** `segment_id` ni `task_id`.
Por eso la captura muestra consumos por bloque que Kora no puede
atribuir con rigor usando los contratos actuales. El nuevo panel
muestra el consumo total real del equipo y «—» a nivel de fase/bloque,
más una explicación visible. No se distribuyen horas por porcentaje,
fecha o similitud de nombre.

Si se quiere ese desglose exacto, la siguiente evolución es registrar
`segment_id` en la captura de HH y definir cómo interpretar los
registros históricos sin segmento. No se introduce esa migración aquí.

## Pruebas añadidas

- `team-progress.spec.ts`: 180 HH en dos bloques, 16 HH aprobadas,
  9% real / 50% esperado en el día de prueba; 77/180 = 43% consumo;
  entregas aprobadas vs presentadas, bloque cerrado, cancelaciones,
  usuario bloqueado, equipo ajeno, sin plan, proyecto pausado y tareas
  antiguas no atribuibles.
- `TeamProgressCard.test.tsx`: indicadores, desplegable, brechas, tabla y
  estado sin plan.
- Fixture `ProjectManagerTeamDetailView.test.tsx` ajustada para usar
  el contrato completo de `deliveries`.

## Integración y validación (PowerShell)

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
pnpm --filter @kora/contracts build
pnpm --filter @kora/core build
pnpm --filter @kora/db build

pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run src/modules/projects/lib/team-progress.spec.ts src/modules/projects/components/TeamProgressCard.test.tsx src/modules/projects/components/ProjectManagerTeamDetailView.test.tsx
pnpm --filter @kora/web build
```

**Sin migración adicional por este panel.** Si no se ha ejecutado la
migración 0053 de la intervención anterior, se debe aplicar antes de
levantar API y web de esta rama.

**No se afirma validación exitosa hasta ejecutar typecheck, tests y build
sobre el HEAD de la rama.**
