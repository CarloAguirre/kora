# R3-c · Acta de conciliación EDT → ejecución (revisión humana, no ejecutable)
**30 de octubre de 2026** · Rama: `feature/calculadora/carlo`

## Objetivo y alcance

Extender la comparación R3-b para que un responsable registre en la interfaz una propuesta **explícita** de asociación entre módulos/actividades WBS del EDT y módulos/tareas operativos de Kora, y pueda descargar un acta JSON para discutir D04 con el equipo. No se modifica la BD.

**Este corte NO aprueba ni traspasa** versiones; no implementa los endpoints de envío/aprobación de R3. Las decisiones D04 (EDT y tareas), D05 (re-cotización y horas históricas) y D06 (montos) siguen abiertas. Un acta completa es evidencia para la conversación, nunca autorización para escribir.

## Flujo de usuario

1. Abrir Calculadora → Cotizaciones → versión existente → **Analizar conflictos**.
2. En Conciliación granular EDT / ejecución, pulsar **Preparar acta**.
3. Por cada módulo del EDT, escoger: pendiente, proponer vínculo a módulo existente, proponer módulo nuevo o proponer no transferir.
4. Si se elige vínculo, indicar explícitamente el UUID de un módulo de la **lectura actual del mismo proyecto** (selección por nombre + ID corto). No se usa automáticamente el candidato coincidente por nombre.
5. Expandir actividades WBS del módulo para proponer vínculos a tareas existentes, altas propuestas, no transferir o mantener pendientes; escribir una justificación para cada selección cuando sea necesario.
6. **Exportar acta JSON de revisión**. El archivo indica `schemaVersion`, `status=draft_for_discussion`, `transferEnabled=false`, proyecto, versión, revisión, fecha del preflight, HH y estado de facturación del momento, decisiones por módulo/WBS, IDs operativos seleccionados, notas y advertencias.

El editor es local al navegador. **NO se guarda en Kora**: antes de cambiar de versión, cerrar el análisis o actualizar el preflight, se debe descargar el JSON. El archivo tampoco se re-importa ni aprueba automáticamente. Esta es una herramienta de trabajo para recoger decisiones y negociar reglas D04; la persistencia auditable de decisiones aprobadas pertenece a un corte posterior.

## Cambios implementados

- `packages/contracts/src/estimation/quotation-transfer-preview.contract.ts`: campo `edtReconciliation.availableExistingModules` para mostrar **todos** los posibles destinos del proyecto, no solo nombres parecidos; nuevo contrato `quotationReconciliationReviewSchema` con estado fijo `draft_for_discussion` y `transferEnabled:false`.
- `apps/api/src/modules/estimation/domain/quotation-edt-reconciliation.ts`: incluye el catálogo operativo disponible en la respuesta GET, sin introducir escritura.
- `apps/web/src/modules/estimation/lib/quotation-reconciliation-review.ts`: generador determinista y validado del acta, que no permite elegir un UUID de módulo ajeno a los módulos consultados, ni vincular WBS a tareas de otro módulo; si un destino se usa repetidamente genera advertencia, nunca fusión automática.
- `apps/web/src/modules/estimation/components/QuotationReconciliationReviewCard.tsx` y `.module.css`: editor local de decisiones y notas por módulo y WBS; exportador JSON.
- `apps/web/src/modules/estimation/components/QuotationTransferPreviewCard.tsx`: integra el acta bajo la conciliación granular, con ciclo de vida asociado al snapshot/version/revisión.
- Pruebas puras y UI: `apps/web/src/modules/estimation/lib/quotation-reconciliation-review.test.ts`, y ampliación de `QuotationTransferPreviewCard.test.tsx`.

## Controles

- Todas las decisiones son **propuestas de revisión**, no acciones imperativas de BD.
- Los IDs de destino deben existir en `availableExistingModules` del preflight actual; una tarea destino debe pertenecer al módulo seleccionado.
- No se reutilizan vínculos previos de tareas si cambia la decisión del módulo.
- Si el módulo se propone como no transferible, las actividades se etiquetan provisionalmente como no transferibles.
- El JSON siempre declara hora del preflight y hora de exportación, para que ningún equipo suponga que es una lectura actual.
- El JSON marca HH históricas, hitos facturados/pagados, EDT modificada y HH divergentes, y mantiene D04–D06 explícitamente pendientes.
- No se generan ni alteran `projects`, `project_teams`, `project_modules`, `project_module_tasks`, `project_payment_milestones`, `quotation_versions`, `quotation_events` ni Forecast.
- Sin nueva migración SQL ni cambio de autorizaciones; el GET de preflight usa los mismos permisos que R3-b.

## Ejercicios de QA

1. Abrir una versión del ejemplo Zurich con EDT: comprobar 7 módulos y 45 actividades como fuente (si el fixture se cargó en esa versión).
2. Revisar uno de los módulos sin coincidencias: `Proponer elemento nuevo`, documentar justificación y exportar acta.
3. Asignar módulo a otro módulo operativo EXISTENTE, aunque su nombre sea distinto: debe poder seleccionarse manualmente por ID; no se elige nada por defecto.
4. Probar vínculo WBS a tarea: solo ofrece tareas reales del módulo operativo elegido.
5. Cambiar de módulo destino: comprobar que se limpian vínculos de tareas ya seleccionados.
6. Con HH usadas o hitos pagados, exportar: el JSON debe advertir esas condiciones y mantener `transferEnabled:false`.
7. Refrescar el preflight: se reinicia el acta local; no se conserva ni se escribe en la BD.
8. Versión sin EDT: mostrar mensaje de imposibilidad para asociar WBS, sin crear tareas falsas.
9. Verificar que `GET /transfer-preview` no tiene efectos operativos y que los permisos siguen impidiendo acceso ajeno.

## Integración y validación PowerShell

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

pnpm --filter @kora/web exec vitest run src/modules/estimation/lib/quotation-reconciliation-review.test.ts src/modules/estimation/components/QuotationTransferPreviewCard.test.tsx
pnpm --filter @kora/api exec vitest run src/modules/estimation/domain/quotation-edt-reconciliation.spec.ts

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
~~~

## Siguiente corte / decisiones

La siguiente etapa segura es usar las actas resultantes como insumo de la definición de negocio D04–D06. Solo después de acordar reglas para proyectos nuevos vs existentes y una persistencia auditable de revisiones aprobadas debería desarrollarse el `POST` transaccional y el traspaso operativo.

**Estado:** archivos y commits publicados; el conector GitHub no ejecuta pruebas ni compila el checkout del usuario. No afirmar que R3-c pasó hasta recibir resultados.