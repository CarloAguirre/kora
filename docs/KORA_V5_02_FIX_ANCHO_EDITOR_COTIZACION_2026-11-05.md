# Kora v5.02 · Editor de proyecto fiel al prototipo

Fecha: 2026-11-05
Rama: `feature/calculadora-roadmap-diseno-v5-02`

## Problema verificado

El editor de desarrollo activo es `EditDevelopmentProjectDialog`, no `EditProjectDialog`.
La intervención anterior amplió únicamente el segundo, dejando el primero con el
ancho por defecto de 560px. Además, `PaymentPlanEditor.module.css` forzaba
una rejilla de dos filas con `@container (max-width: 780px)`, por lo que sus
columnas saltaron de línea incluso en pantallas de escritorio.

## Correcciones de presentación

- Nueva variante `projectEditSide` en `Modal`, específica del editor de desarrollo.
  Su panel tiene un máximo de **600px**, alto completo, scroll vertical y pie fijo.
  Encabezado, campos, paddings y botonera utilizan proporciones compactas del HTML v5.02.
- El monto y los botones **Agregar tramo / Cuotas mensuales** comparten fila.
  El monto usa una base flexible de 260px para dejar espacio a la botonera.
- Las filas del plan mantienen **seis columnas** (tramo, %, monto, hito,
  fase/fecha y acciones) mientras el contenedor tenga más de 515px. Las
  columnas usan `minmax(0,...)`, controles con `min-width:0` y `width:100%`
  para que el texto no desborde.
- Sólo si el contenedor real mide **515px o menos** se reorganizan las celdas;
  a **430px o menos** se muestran en una sola columna.
- El caso de un hito vinculado a un módulo comercial conserva su información
  mediante el `title` de la fase, pero ya **no inserta una séptima celda**.

## Banner de cotización con información real

- `EditDevelopmentProjectDialog` consulta `useProjectQuotation(project.id, open)`.
- La API de cotizaciones incorpora un campo opcional `transferredAt`.
- `DrizzleQuotationRepository.getByProjectId` lee ese valor del evento auditable
  `quotation_events.action = 'quotation_transferred'`, el mismo evento que
  determina `transferredVersionId`. No utiliza `createdAt`, `updatedAt` o
  la fecha de inicio como sustitutos.
- Si hay versión + evento, el aviso muestra, por ejemplo:
  **Cotización · v1 traspasada el 02 sept 2026**.
- Si falta fecha, el aviso **no inventa** una; muestra versión y estado.
- El enlace **Ver cotizaciones** conserva la navegación a la pestaña
  `cotizaciones` mediante `quotationTabRequestId`.

## Alcance técnico

Archivos de UI: `EditDevelopmentProjectDialog.tsx`, `EditProjectDialog.module.css`,
`PaymentPlanEditor.module.css`, `PaymentPlanEditor.tsx`,
`PaymentTriggerFields.tsx`, `Modal.tsx`, `Modal.module.css`.

Contrato: `packages/contracts/src/estimation/quotation.contract.ts`.
Backend: `apps/api/src/modules/estimation/infrastructure/persistence/drizzle-quotation.repository.ts`.

Pruebas: `EditProjectDialog.test.tsx`,
`PaymentPlanEditor.layout.test.tsx`,
`quotation.contract.spec.ts`.

**Sin migraciones**: `transferredAt` se calcula desde una columna de evento
existente. Sin escrituras comerciales ni cambios en el flujo de traspaso.

## Validación local (PowerShell)

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts build
if ($LASTEXITCODE -ne 0) { throw "Contratos fallaron" }
pnpm exec turbo run typecheck --filter=@kora/api --force
if ($LASTEXITCODE -ne 0) { throw "API typecheck falló" }
pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Web typecheck falló" }

pnpm --filter @kora/web exec vitest run src/modules/projects/components/EditProjectDialog.test.tsx src/modules/projects/components/PaymentPlanEditor.layout.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Pruebas Web fallaron" }

pnpm --filter @kora/contracts exec vitest run src/estimation/quotation.contract.spec.ts
if ($LASTEXITCODE -ne 0) { throw "Pruebas contrato fallaron" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Build Web falló" }
```

Con la API local iniciada, recargar la ficha y abrir el editor. Comprobar
visualmente que no hay desplazamiento horizontal, que el plan conserva la
tabla de seis columnas y que el enlace dirige a Cotizaciones. La ejecución
de pruebas locales queda pendiente; los cambios se verificaron de forma
estática contra la rama publicada.
