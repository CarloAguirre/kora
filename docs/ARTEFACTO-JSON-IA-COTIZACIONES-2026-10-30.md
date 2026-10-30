# Artefacto de IA estructurado para cotizaciones · 30-10-2026

**Estado:** PoC de importación y persistencia JSON. **IA real:** pendiente (no se llama a Gemini).

## Fuentes y prototipo
- ERS_Zurich_MJE_Portal(1).docx: requisitos, historias, criterios, exclusiones, decisiones.
- EDT_Zurich_MJE_Portal(2).xlsx: 45 WBS, 6 tramos, 7 módulos, 69 asignaciones diarias, 5 semanas, costos expresados como HH por perfil.
- kora-proyectos-cotizacionesv3.html: el fichero recibido es **byte a byte idéntico** a kora-proyectos-cotizaciones-v2.html. SHA-256 e96e94ccefb152f8878cce204d452b7b5f693e6cacd5a3512f92d8860cb1a806. No implementar cambios visuales sin un HTML realmente distinto.

## Dos capas, sin perder detalle
1. Artefacto analítico con schemaVersion, provenance, project, scope, sourceRequirements, userStories, pendingDecisions, roles, modules, tranches, activities, dailyPlan, weeklyPlan, milestones, assumptions, summary, commercial, roleTeamMappings y renderBlueprints.
2. Proyección comercial editable en quotation_versions.draft (JSONB): equipos reales y sus IDs, fases, HH, costos, hitos, supuestos, exclusiones, respuestas, sourceRefs y análisis original completo (analysis).

Mantener el artefacto para generar ERS/EDT desde templates posteriormente; no usar un DOCX/XLSX como fuente única de datos. Los documentos originales **no se almacenan automáticamente**, pero se incluyen identificadores, hashes y referencias de filas/secciones. La generación DOCX/XLSX sigue pendiente de acordar la presentación con Diseño.

## Datos exactos del ejemplo Zurich
- 45 actividades WBS, 7 módulos, 6 tramos y 21 días hábiles.
- 257 HH base: Fullstack 148; UX/UI 52; QA 33; Tech Lead 20; PMO 4.
- Reserva técnica 10% = 25,7 HH **separadas**, no incorporadas automáticamente. Con reserva, 282,7 HH teóricas.
- 15 requisitos, 10 historias, 7 decisiones pendientes, 69 asignaciones en Plan_Diario, 6 hitos.
- Termina en aprobación dentro del portal; no incluye robot RPA, SAP/Fiori, contabilización ni OK/NOK.
- Valor HH, moneda definitiva, impuesto y plan comercial: no definidos en los documentos; la simulación no los inventa.

El ejemplo estructurado se entregó al usuario como archivo JSON en la conversación. Su origen se etiqueta simulated_fixture (NO model_generated).

## Uso en el frontend
1. Abrir Calculadora → cotizaciones de un proyecto elegible (desarrollo; etapa prospect/quoted; estado draft/active).
2. En Importar análisis estructurado, seleccionar el archivo JSON de ejemplo Zurich.
3. Revisar las HH base y las reservas diferenciadas.
4. Asociar **cada perfil** del EDT con un equipo activo de Kora. Se sugieren los nombres Fullstack→Desarrollo, UX/UI→UX-UI y QA→QA cuando coincidan; Tech Lead y PMO requieren selección explícita. Los perfiles NO son automáticamente equipos.
5. Confirmar que se trata de una DEMO del proyecto Zurich, distinto del proyecto Kora seleccionado.
6. Se llama a POST /api/estimations/projects/:projectId/quotation/versions con body:
   {"simulation":{"analysis":{...artefacto JSON...},"roleTeamIds":{"Fullstack":"uuid-1","UX/UI":"uuid-2","QA":"uuid-3","Tech Lead":"uuid-4","PMO":"uuid-5"}}}
7. El backend valida esquema, reconciliación HH/WBS, roles mapeados y equipos activos; inserta una versión con origin=ai, aiReviewStatus=pending, estado draft y evento de auditoría. La conversión de tramos a fases es determinística; perfiles que comparten equipo se agregan solo a nivel de proyección y se preservan individualmente en el análisis.
8. La reserva no se añade a las HH cotizadas. La tarifa queda nula, por completar manualmente.
9. Si se modifican fases, equipos, costos, hitos o supuestos, analysisProjectionStatus pasa a modified. No generar documentación definitiva sin revisar el cambio humano.

## Límites de seguridad
- No se escribe en projects ni en las tablas de ejecución, Forecast, facturas ni hitos operativos.
- No se habilitan envío, aprobación ni traspaso a la ficha.
- No requiere una migración nueva: el campo draft JSONB ya forma parte de 0048, pendiente de validación y ejecución en QA.
- El esquema de importación limita arrays y exige una consistencia interna de HH. El frontend limita el JSON a 1 MB; la configuración del servidor HTTP puede imponer un límite inferior.
- El flujo simulado es intencionadamente independiente del flujo IA real de la PoC anterior.
- No usar el ejemplo para una propuesta comercial auténtica.

## Integración y validación en PowerShell

~~~
git switch feature/calculadora/carlo
git fetch kora
git pull --ff-only kora feature/calculadora/carlo

pnpm install --frozen-lockfile
pnpm --filter @kora/contracts build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck
pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
~~~

**Nota sobre las pruebas previas:** el último log reportó 37 contratos y 457 API aprobadas; de 63 pruebas web, 59 aprobadas y 4 fallidas por una consulta sin QueryClientProvider en DevelopmentProjectDetailView. Se introdujo un mock del hook de cotizaciones en esa prueba, pero **no se han ejecutado pruebas nuevas aquí**. No aplicar la migración 0048 a producción antes de revisar QA.

## Capacidad informativa de equipos

En el modo por fases, los equipos muestran número de colaboradores de los perfiles agrupados y una dedicación promedio orientativa derivada de HH base / (personas x semanas x 40). La dedicación por semana real se conserva en weeklyPlan y dailyPlan del análisis. El cálculo monetario y las HH comerciales siempre se determinan por la suma de HH por fase, **no** por multiplicar nuevamente esta dedicación media.
