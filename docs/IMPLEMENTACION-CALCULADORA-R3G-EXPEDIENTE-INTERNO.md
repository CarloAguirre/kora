# R3-g · Expediente interno de revisión comercial
**Fecha:** 2026-11-01 · **Rama:** `feature/calculadora/carlo` · **Estado:** commits publicados; pruebas locales pendientes.

## Objetivo

Preparar un archivo JSON de revisión interna **a partir de la versión guardada**, vinculado al resultado recién calculado de R3-f. Permite entregar un expediente de trabajo al equipo para revisar alcance, horas, costos, pagos y pendientes de negocio **sin habilitar el envío comercial**.

El documento no es una oferta para el cliente ni un contrato aprobado. Tiene `documentStatus = internal_review_only`, `deliveryEnabled = false`, `commercialApprovalEnabled = false` y `transferEnabled = false` de forma literal y obligatoria en el contrato Zod.

## Endpoint

`GET /api/estimations/projects/:projectId/quotation/versions/:versionId/commercial-dossier`

- Requiere `projects:manage` o `projects:read_assigned` del líder asignado, con validación de pertenencia de proyecto y versión.
- Lee una única versión persistida y consulta estado operativo + catálogo actual de equipos (incluso si están inactivos).
- Vuelve a ejecutar `buildQuotationCommercialPreflight` y genera el expediente con el mismo snapshot. No confía en un preflight previamente cacheado por el frontend.
- El GET no crea registros en `quotation_events` ni ejecuta escrituras sobre `projects`, `quotation_versions`, equipos, Forecast, hitos, tareas o HH usadas.
- Como la lectura se realiza con consultas ordinarias y sin una transacción de snapshot global, el expediente identifica la revisión y fecha de generación pero **no constituye una certificación inmutable de toda la BD**.

## Contenido del JSON

`schemaVersion: kora.quotation.commercial-dossier.v1`:

- Identificadores de proyecto, versión, revisión, `updatedAt` de la versión y fecha `generatedAt`.
- Nombre, estado, origen, revisión IA, modo equipos/fases, moneda, impuesto, tarifa, HH, neto y total **según el cálculo del preflight**.
- Equipos por UUID con nombre si existe, vigencia, colaboradores, semanas/días, dedicación, capacidad referencial y HH efectivamente cotizadas por modo.
- Fases con semanas relativas y distribución de HH por equipo; costos únicos, mensuales y anuales **sin alterar** su frecuencia; plan de pagos con condición de activación, supuestos y exclusiones.
- Evidencia resumida del análisis IA (modo `none`/`simulated_fixture`/`model_generated`, proveedor, modelo, nombre y número de archivos).
- Preflight R3-f completo con bloqueos, advertencias y decisiones D02/D05/D06.
- Listado explícito de puertas de negocio **pendientes**, no aprobadas, y notas que prohíben interpretar el expediente como envío, aprobación o transferencia.

**Privacidad y minimización:** el JSON no incorpora `draft.answers`, URLs/IDs de `sourceRefs` (solo cantidad), archivos de Drive, texto completo del artefacto IA ni el contenido de sus documentos. Se incluyen los campos comerciales deliberadamente visibles para responsables autorizados. No se persiste copia en el servidor: cada descarga solicita una lectura nueva.

El expediente puede descargarse aun con bloqueos de contenido: sirve precisamente para discutirlos. `contentChecksPassed:true` **no** autoriza entregar la cotización.

## Interfaz

En **Cotizaciones → R3-f · Validación comercial → Validar cotización** se añadió **Expediente de revisión interna** y el botón **Descargar expediente interno JSON**.

- Si hay modificaciones en el editor sin guardar, el botón queda inhabilitado y se explica que primero deben guardarse.
- La descarga consulta el nuevo GET, comprueba que los UUID y la revisión coincidan con la cotización abierta, y genera un archivo `kora-expediente-interno-<proyecto>-v<número>-r<revisión>.json`.
- Si hubo una edición concurrente, muestra un error para recargar. Si el servidor no responde, también informa el fallo.
- No hay botones de enviar, aprobar, enviar correo ni transferir al proyecto.

## Archivos relevantes

- `packages/contracts/src/estimation/quotation-commercial-dossier.contract.ts`: schema y tipo.
- `apps/api/src/modules/estimation/domain/quotation-commercial-dossier.ts`: constructor puro, referenciado por R3-g.
- `apps/api/src/modules/estimation/application/use-cases/manage-quotation-drafts.use-case.ts`: lectura compartida de contexto para R3-f/R3-g y método `getCommercialDossier`.
- `apps/api/src/modules/estimation/presentation/quotation.controller.ts`: ruta GET protegida.
- `apps/web/src/modules/estimation/api/quotation.api.ts` y `QuotationCommercialPreflightCard.tsx`: descarga.
- `apps/api/src/modules/estimation/domain/quotation-commercial-dossier.spec.ts`, `quotation-commercial-preflight.use-case.spec.ts`, `apps/web/src/modules/estimation/components/QuotationCommercialPreflightCard.test.tsx`: casos de prueba.

## QA

1. Un gerente y el líder asignado pueden descargar; líder ajeno recibe 403, sin revelar equipos/versión.
2. Proyecto correcto con `versionId` de otro proyecto: 404 antes de consultar tablas operativas.
3. La respuesta trae `deliveryEnabled:false`, `commercialApprovalEnabled:false` y `transferEnabled:false`, aunque no exista ningún bloqueo del preflight.
4. Archivo con HH/modo fases/moneda/tarifa/hitos correctos; las HH por equipo se distinguen de capacidad referencial.
5. Si falta tarifa o equipo, el expediente conserva observaciones y **no** se convierte en oferta enviable.
6. Si cambian los datos del formulario local, se deshabilita descargar hasta guardar.
7. Si el backend devuelve versión/revisión diferentes de la pantalla, se informa error y no se genera archivo.
8. Revisar que no se exporten respuestas del cuestionario, contenido bruto del análisis ni enlaces privados de fuentes.
9. No se han implementado comandos de transición de estados `sent`/`approved` ni cambios en ejecución.
10. Revisar Network: botón de descarga llama solo al GET `commercial-dossier` y no envía POST/PATCH.

## Comandos PowerShell

```powershell
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

pnpm --filter @kora/api exec vitest run src/modules/estimation/domain/quotation-commercial-dossier.spec.ts src/modules/estimation/application/use-cases/quotation-commercial-preflight.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/QuotationCommercialPreflightCard.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
```

## Próximo paso

Resolver formalmente D02 (quién puede enviar/aprobar), D05 (recotización sobre ejecución/hitos existentes) y D06 (cálculo de montos, impuestos, UF y costos recurrentes). Solo entonces diseñar el envío contractual como comando transaccional, con receptor, auditoría, seguridad e idempotencia, distinto del GET documental. La aceptación real de propuestas IA (R4) debe resolverse antes de permitir el envío de versiones originadas por IA.

**No hay migración ni despliegue; `master` no se tocó.** El conector GitHub no ejecuta tests ni builds; requieren validación local.
