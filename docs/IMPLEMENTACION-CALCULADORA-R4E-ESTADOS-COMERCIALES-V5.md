# R4-e · Filtros comerciales, versiones, aprobación y traspaso

**Proyecto:** Kora 2.0 · Calculadora de cotizaciones  
**Rama:** `feature/calculadora/carlo`  
**Fecha:** 2026-11-02  
**Estado:** código publicado en GitHub; pendiente de typecheck, build, tests e integración en PostgreSQL local/QA. No se aplicaron migraciones ni despliegues.

## Alineación funcional con especificación y HTML v5

El HTML v5 es referencia **funcional**; se mantiene el diseño existente de Kora (`DataTable`, `MultiSelect`, `Card`, `Button`, `Select`, `Modal`). Se usan 3 ejes diferentes:

- **Tipo de proyecto (etapa comercial):** `projects.sales_stage` = `prospect`, `quoted`, `approved`.
- **Estado operativo:** `projects.status` = `draft`, `active`, `on_hold`, `finished`, `cancelled`.
- **Cotización:** derivado de versiones y eventos, sin inferir aprobación o transferencia de `sales_stage`.

La vista Desarrollo incorpora filtros **Tipo de proyecto** y **Cotización**, así como las columnas `Tipo de proyecto` y **Cotización**. Se agregaron `salesStage` y `quotationStatus` al contrato de filtros, puerto de repositorio, API y mapper. Paginación, ordenamiento y conteo usan consulta SQL real.

El estado se calcula a partir de **la última versión comercial**: Sin cotización, En cotización, Enviada, Traspaso pendiente, Traspasada y el estado de compatibilidad "Planificación preliminar aplicada" para eventos técnicos anteriores. Una versión histórica aprobada o transferida NO sobrescribe el estado observable de una recotización más reciente.

Para usuarios que no son Gerencia, las consultas filtradas por estado comercial se acotan al liderazgo autorizado; la respuesta oculta detalles comerciales de proyectos ajenos.

## Quién puede crear y cómo se versiona

Para proyectos `development` en `sales_stage` Prospecto, Cotización **o Aprobado**, con estado operativo `draft` o `active`, se permite crear una nueva versión. Proyectos detenidos, finalizados o cancelados quedan solo lectura.

Gerencia/PMO con `projects:manage`, y líder asignado con `projects:read_assigned`, pueden usar los mismos casos de uso de calculadora sobre proyectos a los que tienen acceso. Copiar entre proyectos exige autorización **separada** de origen y destino.

Crear una versión en proyecto aprobado **no cambia** las HH ejecutadas, equipos operativos, Roadmap ni pagos históricos. Una recotización puede quedar aprobada comercialmente y **con traspaso pendiente** mientras su conciliación operativa requiere trabajo específico.

## Estados y operaciones del ciclo comercial

| Operación | Precondiciones | Cambios persistidos |
|---|---|---|
| **Aceptar propuesta IA** | `draft`, origen IA, revisión vigente, roles y HH mapeados, EDT disponible | `ai_review_status=accepted`, incremento de revisión, evento `ai_proposal_accepted`; **sin cambios en proyectos** |
| **Marcar como enviada** | Última versión `draft`, valor HH, equipos, plan de pagos 100 %, aceptación IA si aplica y EDT conciliada | `status=sent`, `sent_at`, incremento de revisión, evento `quotation_marked_sent` |
| **Registrar aprobación de cliente** | Última versión `sent`, revisión vigente y comprobaciones comerciales | `status=approved`, `approved_at`, `projects.sales_stage=approved`, evento `quotation_client_approved`; **sin traspaso automático** |
| **Traspasar cotización aprobada** | Última versión `approved`, proyecto Desarrollo **No iniciado**, sin equipos, módulos, ejecución, pagos reales, ni baseline previo | Una transacción crea equipos/HH, fases, nuevo plan de hitos desde la cotización, contrato y evento `quotation_transferred` |

**Marcar como enviada es un registro de envío externo; NO manda correos.** La UI advierte y pide confirmación de que el envío ocurrió.

El traspaso no elimina pagos facturados: solo puede sustituir los dos hitos **predeterminados, intactos, monto cero y sin factura** de un proyecto nuevo. No se habilitó un traspaso automático sobre proyectos activos o ejecutados.

La aprobación histórica permanece en su versión original: un evento `quotation_approval_superseded` indica que una nueva versión la sustituyó **sin reescribir su status histórico**.

Si el usuario cambia equipos o distribución HH **después de aceptar IA**, el backend regresa `ai_review_status` a `pending`, anotándolo en el evento de edición. Si la EDT está divergente de las HH del presupuesto, el envío comercial es bloqueado hasta conciliarla.

Un endpoint antiguo `apply-plan` existe para compatibilidad pero el caso de uso lo rechaza expresamente, para impedir una materialización operativa por mera aceptación IA.

## Lectura de Roadmap y seguridad

El Roadmap recupera tareas de referencia mediante evento `quotation_transferred` (o eventos legados `planning_baseline_applied`) y los ID de fases materializadas. Las tareas permanecen en JSONB comercial con nombre/WBS/HH/rol, sin inventar fechas o asignados operativos.

Abrir una nueva recotización **no vuelve a bloquear Hito 0** cuando existe ya un traspaso histórico válido.

La fuente documental actual es **KDM de demostración** y no representa los documentos del proyecto real. Para evitar comercializar o materializar ese documento en producción, `markSent`, `approveClient` y `transferApproved` rechazan cotizaciones KDM cuando `NODE_ENV=production`. El flujo se puede validar en entorno local/QA con datos de prueba, sin desplegar sobre proyectos reales.

## Endpoints

- `GET /api/estimations/projects/:projectId/quotation`
- `POST /api/estimations/projects/:projectId/quotation/versions/:versionId/accept-ai`
- `POST /api/estimations/projects/:projectId/quotation/versions/:versionId/mark-sent`
- `POST /api/estimations/projects/:projectId/quotation/versions/:versionId/approve-client`
- `POST /api/estimations/projects/:projectId/quotation/versions/:versionId/transfer-approved`
- `GET /api/estimations/projects/:projectId/quotation/applied-plan`

Las mutaciones validan `revision` optimista, pertenencia a proyecto, permisos y bloqueos de filas en la misma transacción. Registrar envío/aprobación/traspaso tiene controles separados; una aprobación no equivale a traspaso.

## Comandos de integración/validación — PowerShell

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

pnpm --filter @kora/api exec vitest run src/modules/projects/application/use-cases/list-projects.use-case.spec.ts src/modules/estimation/domain/quotation-commercial-eligibility.spec.ts src/modules/estimation/application/use-cases/manage-quotation-drafts.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/QuotationCommercialLifecycleCard.test.tsx src/modules/estimation/components/NewProjectQuotationModal.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build

git status --short
```

## QA funcional obligatoria (solo local/QA)

1. En `/proyectos`, filtrar Prospecto/Cotización/Aprobado y cada estado de Cotización. Comprobar que los contadores y resultados coinciden con la base y que líderes no ven estados privados de proyectos ajenos.
2. Abrir un Prospecto sin cotizaciones → Nueva cotización IA → cinco etapas → guardar versión. Confirmar que la ficha operativa no cambió.
3. Mapear roles, guardar, aceptar IA; comprobar evento `ai_proposal_accepted` y ausencia de cambios en `projects.sold_hours`, `project_teams`, `project_modules` y `project_payment_milestones`.
4. Configurar valor HH y plan de pagos 100 %, guardar, marcar Enviada; confirmar bloqueo de edición y que no se envió ningún correo.
5. Registrar aprobación; comprobar que queda traspaso pendiente sin modificar aún equipos/HH del proyecto.
6. Traspasar solo en proyecto nuevo y sin historial. Comprobar en una transacción equipos/HH, fases, contrato y plan de pagos. Repetir solicitud: debe rechazar duplicados.
7. Crear nueva versión de proyecto aprobado activo; editar y aprobar nueva versión, y comprobar que la versión histórica conserva su condición anterior. No permitir transferir automáticamente sobre datos históricos.
8. Modificar HH después de aceptar IA: debe invalidar la aceptación y bloquear envío si el desglose EDT no concuerda.
9. Revisión de simultaneidad: dos aprobaciones/traspasos con revisiones obsoletas no deben producir doble escritura.
10. Nunca usar datos reales de producción con la fuente KDM de demostración.

### SQL de comprobación

```sql
SELECT pq.project_id, qv.id, qv.version_number, qv.status,
       qv.ai_review_status, qv.revision, qv.total_hours
FROM project_quotations pq
JOIN quotation_versions qv ON qv.quotation_id = pq.id
WHERE pq.project_id = '47478c22-0e15-4ce7-9664-6b46d185316b'
ORDER BY qv.version_number DESC;

SELECT qe.action, qe.occurred_at, qe.actor_user_id, qe.metadata
FROM quotation_events qe
JOIN quotation_versions qv ON qv.id = qe.version_id
JOIN project_quotations pq ON pq.id = qv.quotation_id
WHERE pq.project_id = '47478c22-0e15-4ce7-9664-6b46d185316b'
ORDER BY qe.occurred_at DESC;
```

## Límites abiertos

- La aprobación de cliente es un **registro manual auditado**, no evidencia externa integrada ni correo electrónico.
- La recotización **no modifica operaciones históricas**. Su traspaso requiere futura conciliación específica (D05).
- Los detalles comerciales de impuestos, costos recurrentes y pagos siguen sujetos a definición D06; validar con negocio antes de producción.
- El conector GitHub no ejecuta tests ni despliegues. No se afirma verificación de TypeScript/SQL/QA hasta ejecutar localmente.
