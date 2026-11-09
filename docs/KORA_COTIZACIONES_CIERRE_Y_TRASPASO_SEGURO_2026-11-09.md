# Kora 2.0 — Cierre de cotización y traspaso inicial seguro
**Fecha:** 09-11-2026  
**Rama:** `feature/calculadora-roadmap-diseno-v5-02`

## Estados comerciales visibles
- **Borrador:** en el tab Cotizaciones se puede abrir la versión y registrar aprobación; las propuestas IA pendientes muestran el chip `✦ Por revisar`.
- **Aprobada por el cliente:** estado `approved`. Se presenta como aprobada, con acción **Traspasar ahora** y una advertencia de que el traspaso todavía no se aplicó. La aprobación no implica mutación del Roadmap.
- **Traspasada:** el evento persistido `quotation_transferred` identifica la versión de la cotización efectiva. La cotización completa queda **cerrada**: solo lectura de todas las versiones y sin botones para crear IA, copiar, crear en blanco, editar, aprobar o eliminar. El servidor rechaza nuevas mutaciones en `ManageQuotationDraftsUseCase.authorize(write=true)` y comprueba la carrera de creación en el repositorio bajo lock. No se requiere migración.

## Traspaso y proyectos Activos
El mensaje `El proyecto no está en «No iniciado»` respondía a una restricción de interfaz y de repositorio. La aprobación comercial está permitida en proyectos Activos, pero el traspaso inicial antes solo aceptaba `project.status = draft`.

Ahora el traspaso puede **intentarse** tanto desde `draft` (No iniciado) como desde `active` (Activo). **No equivale a aceptar una recotización sobre ejecución existente.** Cuando el proyecto está Activo, el servidor exige `commercialPreparationOnly`: sin módulos de ejecución, sin compromisos de pagos alterados y con registros de horas exclusivamente de preparación comercial, según las funciones ya existentes `hasOnlyCommercialPreparationHours` y `hasOnlyUntouchedDefaultPaymentMilestones`. Los bloqueadores adicionales de `initialQuotationTransferBlockers` continúan aplicando. Si hay ejecución o datos irreconciliables, se devuelve conflicto y **no cambia nada** de HH, fechas, equipos, Roadmap ni pagos.

Para proyectos con ejecución, la conciliación D04 sigue siendo una revisión técnica **no habilitante de traspaso**; no se debe presentar el acta como solución automática ni usar SQL manual para reemplazar históricos.

## Verificaciones recomendadas
1. Crear borrador manual e IA (por revisar) y comprobar badges, acciones y versiones en el tab.
2. Registrar aprobación del cliente; confirmar que aparece **Aprobada por el cliente** y que se ofrece traspaso pendiente en ambas vistas.
3. Proyecto No iniciado sin ejecución: confirmar traspaso y actualización de HH/equipos/fases; al recargar debe verse como **cerrada y traspasada**, sin opción de generar versiones, sin posibilidad de modificar mediante API.
4. Proyecto Activo sin ejecución, con preparación comercial admisible: confirmar aprobación y luego intentar traspasar, conservando registros preexistentes. Si tiene ejecución, debe informar bloqueo específico y conservar todos los datos originales.
5. Proyecto Activo con módulos/tareas/horas operativas o pagos modificados: el traspaso se bloquea sin escritura parcial; puede permanecer `approved` y pendiente.

## Comandos PowerShell
```powershell
cd C:\Users\carlo\Desktop\a\kora2.0
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts build
if ($LASTEXITCODE -ne 0) { throw 'Error contracts build' }
pnpm --filter @kora/api typecheck
if ($LASTEXITCODE -ne 0) { throw 'Error api typecheck' }
pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw 'Error web typecheck' }

pnpm --filter @kora/api exec vitest run src/modules/estimation/application/use-cases/manage-quotation-drafts.use-case.spec.ts
if ($LASTEXITCODE -ne 0) { throw 'Error tests API' }
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/ProjectQuotationCard.test.tsx src/modules/estimation/components/QuotationCommercialLifecycleCard.test.tsx
if ($LASTEXITCODE -ne 0) { throw 'Error tests Web' }

pnpm --filter @kora/api build
if ($LASTEXITCODE -ne 0) { throw 'Error API build' }
pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw 'Error Web build' }
git status --short
```

**Importante:** probar la acción en datos de QA, no ejecutar una transferencia experimental sobre un proyecto activo con ejecución productiva. El flujo no cambia facturas históricas ni aprueba automáticamente cotizaciones.
