# R3-d — Actas de conciliación guardadas con historial auditable
**Fecha:** 30-10-2026 · **Rama:** feature/calculadora/carlo · **Estado:** código implementado, pendiente de pruebas locales.

## Alcance

R3-c generaba actas locales descargables. R3-d permite **guardar el borrador de discusión en Kora** y consultar las últimas 25 actas de una versión. Este guardado no es una aprobación del módulo, de la EDT, del presupuesto ni del contrato. Sigue bloqueado el envío/aprobación/traspaso a ejecución y el retorno `transferEnabled:false`.

## Decisión de persistencia (sin migración)

Se reutiliza la tabla existente `quotation_events` (migración 0048) como registro append-only del evento `reconciliation_review_saved`. Cada POST inserta un evento nuevo con:

- `version_id` y `actor_user_id` del servidor (token autenticado).
- `occurred_at` desde PostgreSQL.
- `metadata.review`: JSON validado completo con `schemaVersion=kora.quotation.reconciliation-review.v1`, `status=draft_for_discussion`, `transferEnabled:false`, versión y revisión, snapshot del estado operativo, decisiones por módulo y WBS, observaciones y D04-D06.
- `metadata.versionRevision` y `metadata.status` para auditoría e inspección SQL.

No se modifican `quotation_versions`, `projects`, `project_teams`, módulos, tareas, Forecast ni hitos comerciales u operativos. Una edición produce OTRO evento, no un UPDATE de una revisión histórica. Los eventos tienen FK con borrado en cascada al eliminar definitivamente versiones/proyectos; por ello su retención depende de que no se haga un borrado físico. No prometer auditoría legal inmutable independiente de la vida del proyecto.

**No ejecutar migraciones nuevas.** Es imprescindible que la migración previa `0048_project_quotations.sql` ya esté aplicada en el ambiente de prueba antes de invocar el endpoint.

## Endpoints

GET `/api/estimations/projects/:projectId/quotation/versions/:versionId/reconciliation-reviews`

- Permisos: projects:manage o projects:read_assigned del líder responsable (mismo control que cotizaciones).
- Verifica que la versión pertenece al proyecto. Devuelve últimas 25 actas con ID, usuario, fecha y `review` íntegra.

POST `/api/estimations/projects/:projectId/quotation/versions/:versionId/reconciliation-reviews`

- Mismos permisos comerciales; adicionalmente solo proyectos `development` elegibles para borrador (`prospect|quoted`, `draft|active`) y versiones `draft`.
- Body = objeto validado con `quotationReconciliationReviewSchema` (no es `simulation`, no es traspaso).
- Rechaza actas de otra versión o revisión, y actas mayores a 90.000 caracteres de JSON.
- Recalcula **desde la API** el preflight operativo real y reconstruye el acta canónica con la misma función pura compartida con React.
- Compara el snapshot, HH, módulos/WBS, referencias, notas y advertencias contra el estado operativo actual. No permite esconder conflictos ni cambiar destinatarios UUID por ID ajeno.
- Si los datos cambiaron, responde 409 y exige refrescar el preflight. Un bloqueo `FOR UPDATE` sobre la versión verifica de nuevo `status=draft` y `revision` dentro de la transacción antes de insertar el evento.
- Permite actas incompletas o con advertencias, porque son **borradores para discusión**, nunca decisiones ratificadas. No autoriza aplicación.

Advertencia de concurrencia: la consulta de datos operativos no es un bloqueo transaccional completo de todas las tablas del proyecto. Esto es apropiado para registrar evidencia de discusión, NO para usar esta operación como base de un traspaso. La acción transaccional futura debe revalidar estado, recursos, versión y D04-D06 en su propia transacción.

## Interfaz

Desde Calculadora → Cotizaciones → versión → Analizar conflictos → Preparar acta:

- Continuar editando decisiones locales por módulo y WBS.
- **Guardar acta en Kora** crea un registro auditado en quotation_events y muestra el ID corto de confirmación.
- **Exportar acta JSON de revisión** sigue funcionando sin guardar.
- **Historial guardado en Kora** lista fecha, usuario, revisión y cantidad de observaciones, con descarga del JSON registrado.
- Sin permisos de escritura, o fuera de una versión elegible, el botón de guardar queda deshabilitado. La API vuelve a verificar los permisos.
- Si se actualiza el preflight o se cambia de versión, las decisiones que no se hayan guardado siguen perdiéndose como antes. Las actas ya persistidas quedan disponibles en el historial.

## Cambios de código

- Contratos: `packages/contracts/src/estimation/quotation-reconciliation-review.ts` centraliza el generador puro de acta; `quotation-transfer-preview.contract.ts` añade `savedQuotationReconciliationReviewSchema`.
- Persistencia: `DrizzleQuotationRepository.listReconciliationReviews()` y `appendReconciliationReview()` con evento append-only y revisión protegida por lock.
- Aplicación: `ManageQuotationDraftsUseCase.listReconciliationReviews()` y `saveReconciliationReview()` con autorización, recomputación canónica y rechazo de cambios de versión/snapshot.
- Controller: GET/POST reconciliation-reviews, con validación Zod y respuesta tipada.
- Web: nuevas operaciones en `quotation.api.ts`, hooks React Query en `quotation.queries.ts`, guardado e historial en `QuotationReconciliationReviewCard.tsx`.
- Se mantiene el wrapper de imports en `apps/web/src/modules/estimation/lib/quotation-reconciliation-review.ts` para compatibilidad.

## Escenarios QA

1. Abrir un proyecto de desarrollo elegible con versión `draft` y EDT importada: guardar acta pendiente. Debe retornar 201 con ID y aparecer en historial.
2. Guardar una segunda revisión de decisiones: debe existir **un nuevo evento**; el anterior no se reemplaza.
3. Cambiar las HH de la versión en otra sesión (incrementa `revision`) y después intentar guardar el acta anterior: debe devolver 409.
4. Cambiar módulos/tareas/HH en el proyecto después del preflight: el servidor debe rechazar acta desactualizada cuando el cambio altere el snapshot o las referencias del acta.
5. Intentar enviar targetModuleId de otro proyecto o targetTaskId de un módulo distinto: 409, sin inserción.
6. Eliminar `HITOS_FACTURADOS` o alterar HH del JSON: 409, sin inserción.
7. Líder PM ajeno al proyecto: 403 tanto en GET como en POST.
8. Proyecto fuera de etapa comercial elegible: historial legible para usuario autorizado, POST bloqueado.
9. Revisar que el frontend no muestre ninguna acción de aprobación o transferencia.
10. Comprobar que al guardar el único INSERT sea en `quotation_events` y que Forecast, HH usadas, tareas e hitos sigan inalterados.

## Consulta SQL opcional, solamente lectura

~~~sql
SELECT id, version_id, actor_user_id, action, occurred_at,
       metadata->>'status' AS estado_acta,
       metadata->>'versionRevision' AS revision_cotizacion,
       metadata->'review'->>'transferEnabled' AS traspaso_habilitado
FROM quotation_events
WHERE action = 'reconciliation_review_saved'
ORDER BY occurred_at DESC
LIMIT 25;
~~~

## Comandos PowerShell

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

pnpm --filter @kora/api exec vitest run src/modules/estimation/application/use-cases/quotation-reconciliation-reviews.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/lib/quotation-reconciliation-review.test.ts src/modules/estimation/components/QuotationReconciliationReviewCard.test.tsx src/modules/estimation/components/QuotationTransferPreviewCard.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
~~~

## Próxima etapa

Acordar con producto/diseño el modelo de revisión/ratificación de D04-D06, la política de vigencia de una revisión cuando el proyecto cambia, y una retención auditable independiente de borrados de versiones si se requiere. Un eventual traspaso transaccional tiene que mantenerse como un caso de uso separado, con nuevas pruebas de seguridad e idempotencia.

**Verificación:** commits publicados en GitHub. Las pruebas de este corte no se han ejecutado desde el conector. No hubo migraciones, despliegues ni cambio a master.