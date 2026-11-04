# Kora V5.02 — Avance global desde los bloques del Roadmap

Fecha: 2026-11-04. Rama `feature/calculadora-roadmap-diseno-v5-02`.

## Problema confirmado

La ficha interna del proyecto mostraba «Avance del proyecto» mediante
`DevelopmentProjectDetailView → ProjectTimeline → ProjectProgressOverview`
usando el objeto `project.progress`.

El backend calcula `project.progress` en
`apps/api/src/modules/projects/application/services/project-progress.ts`:
pondera las **tareas y entregas de la fase**, con fallback por cantidad, y
calcula lo esperado con las fechas de vencimiento de esos ítems.
Este modelo es **distinto** al de los bloques operativos materializados en
`project_module_segments`.

En contraste, «Avance del equipo» y las barras del Roadmap usan
`calculateTeamProgress` / `indexTeamBlockProgress`, considerando:
- denominador: `segment.estimatedHours`;
- avance real: HH estimadas de tareas con estado `done` vinculadas al bloque
  (capadas a las HH del bloque);
- un bloque cerrado (`closedAt`) o con entrega `approved`: 100%;
- avance esperado: prorrata lineal por días calendario inclusivos entre
  `startDate` y `endDate`, usando fecha actual de Chile;
- tareas canceladas excluidas, tareas sin atribución inequívoca no suman;
- HH consumidas: **costo separado** de la medición de avance.

Por eso la barra global podía mostrar cifras incompatibles con la vista de
equipo y el Roadmap, incluso para proyectos recién traspasados y con barras
válidas pero sin tareas operativas aprobadas.

## Solución aplicada a la ficha interna

**No se replica la fórmula**: se creó
`apps/web/src/modules/projects/lib/project-execution-progress.ts` para
reutilizar `indexTeamBlockProgress`. Se suman las HH (no porcentajes) de
todos los bloques del proyecto:

```text
HH planificadas globales = suma segment.estimatedHours (válidas)
HH reales globales       = suma bloque.actualHours
HH esperadas globales    = suma bloque.expectedHours
Avance real %            = HH reales / HH planificadas * 100
Avance esperado %        = HH esperadas / HH planificadas * 100
```

El indicador devuelve `null` cuando no hay ningún bloque con HH
planificadas. Para un plan parcialmente materializado, calcula sobre las HH
definidas y **advierte la diferencia** respecto de las HH comerciales de las
fases y del proyecto. No inventa un 0% ni distribuye HH vendidas a bloques.

`ProjectExecutionProgressCard` reutiliza los estilos y el desglose del
`TeamProgressCard`, adaptado a **todos los equipos**: barra, marca esperada,
estado, metodología, bloques con mayor contribución al atraso (en puntos
del porcentaje TOTAL), cierre aprobado/manual, tabla por fase y bloque
con HH consumidas atribuidas explícitamente. El pie de HH vendidas,
consumidas, restantes y fechas de la ficha original se conserva.

`DevelopmentProjectDetailView` usa el nuevo agregador. `ProjectTimeline`
y el objeto `project.progress` no se utilizan para esta tarjeta.

## Ejemplo de la imagen aportada

La referencia muestra:
- Fase Bot de conciliación: 24 PMO + 80 QA + 360 RPA = 464 HH,
  todos sus bloques cerrados/aprobados: **464 HH completadas**.
- Fase Reportería: 12 PMO + 30 QA + 101 RPA = 143 HH
  sin aprobación/cierre: **0 HH completadas**.
- Total 607 HH planificadas; 464 / 607 = **76% real**; todas las
  fechas ya vencidas: **100% esperado**; brecha de 24 puntos.
- Retrasos ponderados: RPA 101 / 607 ≈ 17 pts;
  QA 30 / 607 ≈ 5 pts; PMO 12 / 607 ≈ 2 pts.
- Las 273,5 HH consumidas del pie son independientes del avance.
- **Inconsistencia en la referencia:** el pie dice 606,5 HH vendidas,
  pero el plan suma 607. La implementación reporta diferencia, no "igual".

## Limitación de alcance

Esta intervención corrige específicamente **la ficha interna principal**.
El backend y otros consumidores de `project.progress` (por ejemplo
algunas vistas externas/listados) aún conservan el cálculo anterior.
No se modificaron allí por tratarse de contratos y reglas que afectan
más pantallas; no se debe afirmar una unificación global de toda la app.

## Pruebas incorporadas

- `project-execution-progress.test.ts`: agregado global ponderado, 607 HH
  de la referencia, cierre/aprobación, tareas canceladas, atribución errónea,
  bloques con HH NULL, pausas y tareas sin bloque.
- `ProjectExecutionProgressCard.test.tsx`: barra 76/100, diferencia
  y desglose, estado, cierre aprobado, modo sin plan y toggle.
- `DevelopmentProjectDetailView.test.tsx`: prueba de integración de que
  la tarjeta no consume el antiguo `project.progress`.

## Integración / validación

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run src/modules/projects/lib/project-execution-progress.test.ts src/modules/projects/components/ProjectExecutionProgressCard.test.tsx src/modules/projects/pages/DevelopmentProjectDetailView.test.tsx src/modules/projects/lib/team-progress.test.ts
pnpm --filter @kora/web build
```

Cambios limitados al frontend y documentación: **sin migraciones, UPDATE
ni modificaciones de PostgreSQL**. Validación local pendiente de ejecutar.
