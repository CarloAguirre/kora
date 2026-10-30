# R3-a · Previsualización operativa de una cotización
Fecha: 30-oct-2026 · Rama: feature/calculadora/carlo

## Propósito y frontera

Este corte prepara la conciliación comercial y operativa sin actualizar Proyectos. D04 (EDT/tareas), D05 (recotización) y D06 (montos) siguen pendientes. El campo de respuesta transferEnabled se mantiene siempre en false. No se incluyen endpoints de enviar, aprobar ni transferir.

## Endpoint

GET /api/estimations/projects/:projectId/quotation/versions/:versionId/transfer-preview

Requiere projects:manage o projects:read_assigned para el líder responsable; los IDs se validan como UUID y la versión debe pertenecer a la cotización del proyecto. El caso de uso solo lee:

- projects: salesStage, status, soldHours, usedHours, startDate, contractAmount y contractCurrency.
- project_teams + teams: identificador, nombre, cupos y HH asignadas.
- project_modules, project_module_tasks y project_module_segments: conteos existentes.
- project_payment_milestones: número de hitos en pending, to_invoice, invoiced y paid.

El preflight compara HH propuestas y HH actuales con deltas por equipo, distingue asignación operativa nula de 0, y presenta alertas si hay HH consumidas, módulos/tareas/tramos, hitos facturados y pago pendiente. No se modifica ejecución, Forecast ni facturación. El cálculo de horas cotizadas usa EXCLUSIVAMENTE modo por equipos o por fases, según draft.mode.

## Restricciones y decisiones

Todos los preflight incluyen el bloqueo R3_NOT_IMPLEMENTED. También se evalúan VERSION_NOT_APPROVED, AI_NOT_REVIEWED, SIMULATION, ANALYSIS_MISMATCH, MISSING_RATE, PAYMENT_PLAN_INCOMPLETE, PROJECT_CLOSED, CONTRACT_AMOUNT_BASE_UNCONFIRMED, PROJECT_IN_EXECUTION, HISTORICAL_HOURS, BILLED_MILESTONES, READY_TO_INVOICE, EXISTING_ROADMAP y LEGACY_APPROVED según corresponda.

Por D06, la respuesta no calcula netAmountDelta: el monto contractual del proyecto no tiene una base neta/bruta certificada. Ni la misma moneda habilita una comparación fiable. La reserva técnica y las horas históricas no se transfieren desde esta vista.

La respuesta es una LECTURA PUNTUAL, no un snapshot transaccional apto para aplicar posteriormente. Una futura operación de traspaso debe volver a verificar estado/version/revisión y datos operativos en su propia transacción, con reglas idempotentes y auditoría. Nunca reutilizar un preflight como permiso de escritura.

## Interfaz

Una versión persistida muestra la tarjeta R3 · Previsualización de traspaso. Analizar conflictos activa la consulta; Actualizar lectura recupera la información vigente. Se muestran HH vendidas/cotizadas/consumidas, equipos, plan operativo e hitos por estado, más bloqueos y advertencias. No existe acción para aplicar, aprobar o enviar. Se consulta una versión guardada, no cambios locales pendientes.

## Pruebas añadidas

- apps/api/src/modules/estimation/domain/quotation-transfer-preview.spec.ts: HH por equipo y fases, horas históricas, facturación, bloqueo global, monedas y montos.
- apps/api/src/modules/estimation/application/use-cases/manage-quotation-drafts.use-case.spec.ts: autorización y ausencia de escrituras.
- apps/web/src/modules/estimation/components/QuotationTransferPreviewCard.test.tsx: consulta bajo demanda, HH de equipos, hitos y ausencia de acción de traspaso.

## PowerShell: integrar y validar

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

pnpm --filter @kora/api exec vitest run src/modules/estimation/domain/quotation-transfer-preview.spec.ts src/modules/estimation/application/use-cases/manage-quotation-drafts.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/QuotationTransferPreviewCard.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
~~~

## Validación manual QA

1. Versión borrador: bloqueo VERSION_NOT_APPROVED y transferEnabled false.
2. Simulación IA: bloqueos de origen IA y revisión, sin posibilidad de ejecutar traspaso.
3. Proyecto activo con horas usadas y tareas: HISTORICAL_HOURS y EXISTING_ROADMAP.
4. Hitos pagados/facturados y por facturar: estado contado y advertencias; ninguna transición ni factura nueva.
5. Líder PM ajeno: HTTP 403.
6. Proyecto terminado o cancelado: PROJECT_CLOSED.
7. Dos versiones: preflight por versión guardada; actualización de lectura no modifica BD.

Estado: código publicado en rama. Las pruebas de este corte deben ser ejecutadas en el checkout local; no hay migración nueva, cambios a master, despliegue ni escrituras en PostgreSQL.

Próximas decisiones antes de continuar con R3: D04 módulos/tareas y EDT; D05 proteger proyectos activos y facturas; D06 base de monto, impuestos, redondeos y reserva.