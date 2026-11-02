# Calculadora · EDT Gemini y aplicación inicial de planificación (R4-c)

**Rama:** feature/calculadora/carlo  
**Fecha:** 2026-11-02  
**Estado:** código publicado en GitHub; pruebas y builds deben ejecutarse localmente. **Sin despliegue ni migraciones.**

## 1. Correcciones del log entregado

- Backend Nest: se agregaron los imports de EstimationPocProposal, SubmitEstimationAnswerInput y EstimationQuestion en el puerto QuotationRepository (TS2304).
- Frontend Vitest: se cambió la expectativa de la antigua etiqueta R4-a por el texto vigente "Confirma F01–F05 antes de generar la propuesta Gemini", sin modificar el comportamiento.
- El log original reportaba 100 pruebas aprobadas, una fallida, y build API detenido por tres imports. Los nuevos resultados no pueden afirmarse hasta la ejecución local.

## 2. Generación real de EDT (con fuente temporal KDM)

El flujo anterior guardaba roles y HH, sin módulos/tareas. Ahora, durante POST versions/ai-poc, el servidor:

1. Autoriza Gerencia, valida proyecto y respuestas fijas/dinámicas.
2. Genera la propuesta real con Gemini sobre el documento KDM de demostración; la fuente se identifica siempre como kdm_demo (no es Drive de cliente).
3. Envía una segunda solicitud a Gemini: estimation.poc.reference-edt con el mismo documento, propuesta de roles y respuestas.
4. Gemini devuelve módulos y tareas con WBS, título, descripción, rol y peso relativo de esfuerzo; NO fechas ni colaboradores.
5. Kora distribuye matemáticamente las HH cotizadas de cada rol según los pesos, ajustando la última tarea de cada rol para conservar exactamente su total de HH (2 decimales). Rechaza roles desconocidos, tareas sin HH, WBS duplicados, fases duplicadas y totales inconsistentes.
6. Almacena el snapshot en quotation_versions.draft.aiPoc.edt junto con propuesta, preguntas dinámicas, respuestas y fuente KDM. El guardado de la versión y draft_created siguen siendo transaccionales.

La EDT se visualiza en QuotationPlanningAcceptanceCard antes de aplicar. Se utilizan Card, Button, Select, Modal y estilos existentes de Kora; el HTML v5 sigue siendo referencia de navegación, no fuente de componentes.

## 3. Aceptación de planificación y materialización transaccional

Endpoints:

- GET /api/estimations/projects/:projectId/quotation/applied-plan (projects:manage o líder asignado).
- POST /api/estimations/projects/:projectId/quotation/versions/:versionId/apply-plan (projects:manage).
  Body: { "revision": 2, "confirmation": "APLICAR_PLANIFICACION_KDM_DEMO" }.

El botón **Aceptar estimación y crear planificación** solicita confirmación explícita de que se aplica el archivo de prueba KDM sobre el proyecto y NO aprueba comercialmente una oferta.

El backend abre transacción y bloquea fila de projects y quotation_versions antes de leer datos vigentes. Rechaza:

- Proyecto que no sea desarrollo, no esté en Prospecto/Cotización o esté detenido, terminado o cancelado.
- Proyecto con HH vendidas/consumidas distintas de cero, fecha de inicio, monto de contrato, equipos, módulos o hitos de pago preexistentes.
- Versión histórica, revisión obsoleta, estado no draft u origen no IA.
- Otra planificación ya aplicada en el proyecto (se evita duplicar ante reintentos).
- Evidencia IA que no sea Gemini/KDM, EDT ausente, perfiles sin equipos, mapeo no conciliado, diferencias de HH entre tareas, roles, versión y propuesta.
- Equipos inactivos o eliminados.

En la **misma transacción**:

- Inserta filas project_teams (team_id, member_count y assigned_hours según EDT y mapeo).
- Inserta filas project_modules (nombre y HH de cada módulo/fase Gemini; fechas nulas).
- Actualiza projects.sold_hours, conservando projects.used_hours, pagos, contrato, timestamps de Hito 0, estado y sales_stage.
- Marca quotation_versions.ai_review_status = accepted, sin poner status = approved ni enviar la propuesta al cliente.
- Inserta evento append-only quotation_events.action = planning_baseline_applied, con versión/revisión, autor, moduleIds, HH, fuente KDM y commercialApproval:false.

Una vez aplicada, la versión original no admite nuevas ediciones: el PATCH comprueba el evento bajo lock. Nuevas propuestas pueden abrir otra versión, pero NO sobreescribir el baseline existente automáticamente.

## 4. Roadmap: tareas de referencia vs tareas operativas

Los módulos/fases sí se insertan en project_modules; por lo tanto son visibles en la ficha y Roadmap existentes.

Cada fase muestra un bloque expandible con las tareas reales *propuestas por Gemini*, WBS, rol y HH, recuperadas del JSONB de la versión aplicada mediante los moduleIds registrados en el evento. **Estas son tareas de referencia sin fechas ni responsables**, como muestra el HTML v5. No se crean registros falsos en project_module_tasks, cuyo esquema exige start_date y date y representa tareas operativas con planificación/Forecast.

Si más adelante el líder programa una tarea, debe usar el flujo actual de tareas operativas. Las tareas de referencia no generan Forecast, vencimientos ni progreso ejecutado.

No se modifican project_payment_milestones, facturación, horas ya registradas ni acuerdos contractuales. La aceptación es **técnica para planificación inicial**, no es status aprobado por el cliente. D02, D05 y D06 comerciales siguen pendientes.

## 5. Pruebas incorporadas

- tests de generación EDT real usando proveedor Gemini simulado en unit tests (sin llamadas externas), con verificación de distribución exacta HH por rol, módulos y rechazo de roles inexistentes.
- test del controlador de creación IA: pide la segunda generación de EDT y entrega el resultado al guardado.
- test de use case: solo projects:manage puede aceptar; un líder no; un proyecto comercial aprobado no puede aplicar; acceso de lectura limitado.
- test de componente QuotationPlanningAcceptanceCard: revisión WBS, confirmación, token de operación, bloqueo de doble aplicación y cambios sin guardar.
- test de ficha de proyecto actualizado por nueva consulta de planificación aplicada.

**Falta prueba de integración SQL contra PostgreSQL real:** simular concurrencia, comprobar rollback e idempotencia, y verificar triggers/validaciones de tablas operativas. No declarar ese escenario como probado solo con unit tests.

## 6. Comandos PowerShell (local)

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

pnpm --filter @kora/api exec vitest run src/modules/estimation/application/use-cases/generate-estimation-poc-proposal.use-case.spec.ts src/modules/estimation/presentation/quotation.controller-ai-poc.spec.ts src/modules/estimation/application/use-cases/manage-quotation-drafts.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/pages/EstimationWorkspacePage.test.tsx src/modules/estimation/components/QuotationPlanningAcceptanceCard.test.tsx src/modules/projects/pages/DevelopmentProjectDetailView.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build

git status --short
~~~

## 7. Validación manual con BD QA (NO producción)

1. Crear prospecto de desarrollo SIN HH, fecha de inicio, equipos, módulos ni pagos; generar una nueva versión KDM con Gemini (requiere GEMINI_API_KEY).
2. Revisar la EDT detallada por fases/tareas y sus HH antes del mapeo.
3. Mapear cada perfil a un equipo activo y pulsar **Aplicar distribución de HH**; **Guardar borrador**. La suma del presupuesto debe coincidir con las HH del expediente EDT.
4. Pulsar **Aceptar estimación y crear planificación**, confirmar. Comprobar creación en proyectos de HH vendidas, project_teams y project_modules y referencias en Roadmap.
5. Intentar repetir aceptación o editar la misma versión después: debe responder conflicto; no duplicar filas.
6. Repetir en un prospecto con horas consumidas, fecha de inicio, equipos, módulos o pagos preexistentes: debe fallar íntegramente, sin crear ni alterar registros.
7. Confirmar que project_module_tasks no se rellena con fechas inventadas y que facturación/Forecast/hours consumidas siguen intactas.
8. Comprobar que la UI sigue el diseño propio de Kora, no estilos copiados del HTML.

Consultas útiles:

~~~sql
SELECT id, name, sales_stage, status, sold_hours, used_hours, contract_amount
FROM projects WHERE id = :project_id;

SELECT team_id, assigned_hours, member_count
FROM project_teams WHERE project_id = :project_id ORDER BY created_at;

SELECT id, name, estimated_hours, estimated_start_date, estimated_end_date
FROM project_modules WHERE project_id = :project_id ORDER BY created_at;

SELECT qv.id, qv.version_number, qv.ai_review_status, qv.draft->'aiPoc'->'edt' AS reference_edt
FROM quotation_versions qv
JOIN project_quotations pq ON pq.id = qv.quotation_id
WHERE pq.project_id = :project_id ORDER BY qv.version_number DESC;

SELECT qe.action, qe.occurred_at, qe.actor_user_id, qe.metadata
FROM quotation_events qe
JOIN quotation_versions qv ON qv.id = qe.version_id
JOIN project_quotations pq ON pq.id = qv.quotation_id
WHERE pq.project_id = :project_id AND qe.action = 'planning_baseline_applied';
~~~

Sustituir :project_id por el UUID del proyecto en el cliente SQL.

## Límites y decisiones

- Sin integración real Google Drive: la documentación temporal KDM es de demostración. Aunque el modelo sea Gemini, NO describe necesariamente el proyecto prospectado.
- La aceptación materializa un *baseline técnico* en proyectos nuevos, sin activar contratos, pagos, estados de venta aprobados ni transferencia de proyectos en ejecución.
- No hay migración nueva (los campos de EDT y vínculos de evento están en JSONB existente); no se añadió entidad relacional específica para tareas de referencia.
- Una recotización de un proyecto ya iniciado requiere D05 y conciliación explícita; no se reemplaza el baseline en automático.
- El conector GitHub no ejecuta pnpm, no valida servicios ni aplica migraciones. Ejecutar build, pruebas y QA antes de integrar o desplegar.
