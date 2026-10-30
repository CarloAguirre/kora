# R3-b — Conciliación de EDT granular contra ejecución (solo lectura)
Fecha: 30 de octubre de 2026 · Rama: feature/calculadora/carlo

## Objetivo
Preparar la revisión humana D04 con la EDT estructurada y el estado REAL de módulos/tareas en Kora, manteniendo separados los artefactos fuente y la ejecución.
Este corte extiende el GET implementado en R3-a; no crea endpoints de aprobación ni mutaciones ni cambia el contrato de permisos.

## Endpoint reutilizado
GET /api/estimations/projects/:projectId/quotation/versions/:versionId/transfer-preview

El repositorio ahora agrega a su snapshot operacional executionModules: identificador, nombre, HH estimadas, tareas (id, nombre, estado, HH). Los datos provienen de project_modules y project_module_tasks, sin joins que alteren el proyecto. Las horas usadas siguen obteniéndose desde projects.used_hours y NO se recalculan por nombre de tarea.

## Campo adicional de respuesta: edtReconciliation
- source = analysis, modified_analysis o no_analysis.
- activityCount, proposedModuleCount, proposedHours provienen del artefacto EDT guardado en la versión.
- modules[] incluye nombre, HH base EDT, actividades WBS y posibles módulos operativos coincidentes.
- existingCandidates guarda ID real, nombre, HH estimadas y cantidad de tareas del módulo.
- matchStatus = no_match, possible_match o ambiguous; una coincidencia NUNCA se considera identidad confirmada.
- deltaVsExisting sólo se calcula cuando hay un único candidato operativo y HH del módulo definidas; si hay varios o no hay HH, es null.
- activities[] conserva código WBS, descripción, rol, HH y posibles tareas existentes por nombre (con id, status y horas).
- notes[] documenta que no hay escritura ni asociación operativa definitiva.

## Política de seguridad
El emparejamiento usa nombres normalizados para comparar candidatos (espacios, mayúsculas, tildes), nunca enlaza por identidad ni modifica filas. Una coincidencia puede ser falsa positiva; dos módulos homónimos se marcan ambiguos y NO se elige el primero. Si falta análisis EDT granular, NO se traducen fases comerciales a módulos/tareas. Si analysisProjectionStatus=modified, el desglose se muestra como EDT original desincronizado respecto al presupuesto actual.

El resultado devuelve transferEnabled=false incondicionalmente. Se mantienen controles D04, D05 y D06, incluyendo la protección de HH consumidas y hitos pagados/facturados. NO se modifican projects, project_teams, project_modules, project_module_tasks, segment_members, Forecast ni project_payment_milestones.

## Interfaz
En Calculadora → proyecto → Cotizaciones → Previsualización → Analizar conflictos se añadió Conciliación granular EDT / ejecución. Se muestran módulos propuestos, HH originales, posibles módulos existentes y diferencias, además de actividades WBS desplegables. Se muestran advertencias de nombres ambiguos y tareas posiblemente repetidas, sin ofrecer botones de creación, actualización ni traspaso.

## Casos de prueba
- EDT Zurich con módulos y actividades: desglosar desde analysis, no desde la suma de fases.
- Proyecto con módulo de nombre similar pero distinta acentuación: informar candidato, no actualizar.
- Proyecto con módulos homónimos: marcar ambiguous y deltaVsExisting null.
- Actividad con nombre coincidente de tarea: informar posible duplicado; nunca fusionar automáticamente.
- Proyecto con task status done: preservar y mostrar condición histórica.
- Versión con análisis modificado: destacar que EDT/HH comerciales no están conciliadas.
- Versión sin análisis: devolver no_analysis y sin tareas inventadas.
- Sin HH estimadas de módulo: no comparar contra cero, delta null.
- Validación de permisos existentes: Líder PM no asignado no puede consultar datos operativos.

## Integración PowerShell
~~~powershell
git switch feature/calculadora/carlo
git status --short
git fetch kora
git pull --ff-only kora feature/calculadora/carlo
git rev-parse --short HEAD

pnpm install --frozen-lockfile
pnpm --filter @kora/contracts build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run src/modules/estimation/domain/quotation-edt-reconciliation.spec.ts src/modules/estimation/domain/quotation-transfer-preview.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/QuotationTransferPreviewCard.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
~~~

## QA y pendientes
Verificar que el GET no produce DML, que los nombres de tareas existentes coincidentes sean exclusivamente informativos y que un usuario sin permisos reciba 403. La revisión manual de coincidencias es imprescindible antes de definir tablas de equivalencia / decisiones D04–D06.
**Sin migración nueva.** Este corte sólo amplía la información de un GET y la presentación React. Las pruebas de este corte fueron añadidas al repositorio, pero deben ejecutarse localmente: el conector GitHub no proporciona proceso pnpm ni instancia QA.