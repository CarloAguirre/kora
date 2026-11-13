# Kora · Integración no destructiva del traspaso comercial (HTML v5)
**Fecha:** 2026-11-03 · **Rama:** `feature/calculadora-cotizacion-ui-v5` · **Estado:** auditoría y ejecución por cortes verificables.
**Fuentes mandatarias:** `kora-proyectos-v5(1).html` adjunto al hilo y seis capturas 20261103-171446/171502/171540/171600/171624/171904. Las imágenes pertenecen a la referencia recibida; no suponer que ya están en este repositorio. **No copiar la implementación simulada del HTML dentro de React.** Conservar componentes, capacidades y estilos operativos existentes.

> **Actualización de criterio (04-11-2026):** las afirmaciones de este
> documento sobre «esperar planificación manual para asignar fechas» solo
> aplican mientras el proyecto está **No iniciado** o la cotización no fue
> aprobada y traspasada. Cuando la cotización ya fue aprobada por cliente/PM,
> traspasada y el proyecto pasa a **Activo con fecha de inicio**, Kora
> materializa automáticamente las semanas comerciales como
> `project_module_segments` y entregas de cierre con fechas reales,
> persistidas y editables. **No se solicita otra aprobación.** El proceso
> idempotente está detallado en
> `docs/ROADMAP-V5_02-CIERRE-BLOQUE-ASIGNACION-2026-11-04.md`.

## 1. Hallazgo: por qué falla el POST transfer-approved
El payload `{ "revision": 12, "confirmation": "TRASPASAR_COTIZACION_APROBADA" }` es conforme al contrato. El `409` surge de la protección transaccional de `DrizzleQuotationRepository.transferApproved`, no de ese body.
Actualmente exige proyecto `draft` + `salesStage=approved` y rechaza cuando hay *cualquier* `sold_hours`, `used_hours`, `start_date`, `contract_amount`, `project_teams`, `project_modules`, `hour_entries` o plan de pagos no predeterminado. **No eliminar esa salvaguarda para aparentar éxito**: podría sobrescribir datos reales, pagos, ejecución o resultados de Forecast.
Las capturas del caso App Walvy exhiben 2.489 HH vendidas y 5.143,75 consumidas. Se trata de historia operativa, no de proyecto inicial vacío. No utilizar ese caso como prueba de traspaso inicial.

## 2. Efecto mandante del prototipo auditado
En el HTML final, `confirmAprob` (líneas aproximadas 1091–1096) registra aprobación y permite traspaso ahora/después. `confirmApply` invoca `doTraspaso` (1295–1308), que produce:
1. HH vendidas y duración comercial estimada en el proyecto, **sin inventar fechas de inicio**.
2. Equipos reales habilitados con cupos y HH por equipo; líderes conservados y colaboradores asignables posteriormente.
3. Fases por nombre; bloques de referencia por equipo con HH, inicio/duración en **semanas relativas**. Las fechas reales se asignan al planificar el proyecto.
4. Tareas EDT como **referencias** con nombre, equipo y HH, sin assignee ni fechas. Botón contextual *Crear tarea* para iniciar la creación operativa después, no importación automática de tareas ejecutables.
5. Plan comercial, vínculo de la versión transferida, bitácora/auditoría y resumen de montos/hitos.
6. Se conservan los tabs Resumen, Roadmap, Bitácora, Extras y Cotizaciones.

El prototipo sustituye arrays en memoria; **esta parte NO es trasladable literalmente** a Kora: el usuario exige preservar todo lo que ya existe.

## 3. Mapeo con entidades Kora y decisiones de integración
| Resultado HTML v5 | Entidad/control Kora | Tratamiento |
|---|---|---|
| HH vendidas / monto / moneda | `projects.sold_hours`, `contract_amount`, `contract_currency` | Transferir una sola vez cuando sea seguro. No recalcular historia ni `used_hours`. |
| Equipos / cupos / líderes | `project_teams`, `project_team_members`, catálogo `teams` | Crear vínculos a equipos **existentes**. Conservar líderes y miembros existentes; asignación de colaboradores manual. No duplicar un equipo. |
| Fases/módulos | `project_modules` | En traspaso inicial agregar módulos de la cotización. Sin reemplazar ni renombrar los actuales de proyectos históricos. |
| Bloques por equipo | `project_module_segments` | Requieren fechas `start_date/end_date`. Sin fecha real, mantener distribución como **referencia comercial** hasta planificación; no introducir fechas ficticias ni generar Forecast. |
| Tareas de EDT pendientes | `quotation_versions.draft` + `quotation_events` (snapshot de versión), *no* `project_module_tasks` automáticamente | Tareas operativas requieren fechas. Mostrar referencias en Roadmap ya existente; su creación posterior debe usar el flujo de Kora y su validación. |
| Plan de pagos | `project_payment_milestones` | Solo sustituir el plan predeterminado **sin facturar ni editar**, en un proyecto inicial. No eliminar planes con facturas/pagos. |
| Traza/estado transferido | `quotation_events(action=quotation_transferred)` | Evento transaccional con `moduleIds`, versión, autor, fecha, totales. No repetir. |
| Resumen comercial | `ProjectQuotationCard` | Visualizar versión transferida histórica sin mover datos operativos. |
| Equipo / registro de horas | `AssignedTeamsCard` + diálogo de edición proyecto | Mantener **Ver registro de horas** y añadir **Gestionar equipos** enlazado a lo existente. |
| Roadmap complejo | `ProjectModulesCard` + `PhaseRoadmap` + `project-detail.adapter` | **Conservarlos**; integrar referencias como sección contextual, no duplicar el Gantt ni sobrescribir fases/tareas/entregas/Forecast. |

## 4. Estrategia incremental
### Corte A — diagnóstico y contrato de comportamiento (ahora)
- Documentar fuente de verdad, diferencias y criterios de no regresión.
- Exponer cuál de las condiciones provoca `409`, con explicación legible. `400`/ `409` deben ser específicos; no retornar solo error genérico.
- Habilitar acceso a *Gestionar equipos* sin eliminar botón *Ver registro de horas*.
- Pruebas: ningún cambio en BD al fallar un traspaso; equipo existente conserva miembros y líder.

### Corte B — traspaso inicial completo, transaccional
- Proyecto nuevo sin ejecución: enlazar `project_teams`, `project_modules`, HH, pagos y snapshot comercial.
- Guardar mapping estable `moduleId ↔ fase comercial ↔ WBS` y distribución HH por equipo; guardar referencias *sin fechas*.
- Mostrar referencias bajo el Roadmap existente. Incluir tareas comerciales añadidas o editadas; no limitarse a `aiPoc.edt.modules` si versión usa `edtCommercialTasks/Stages`.
- Tests PostgreSQL integrales: transferir, volver a llamar (idempotencia por rechazo sin efectos secundarios), revertir en error y verificar entidades con FK.

### Corte C — conciliación no destructiva de proyecto con ejecución previa
- Preflight por proyecto y versión: sold/used HH, contrato, equipos/miembros, fases, tramos, tareas, registros y pagos.
- La aprobación comercial puede registrarse; no significa autorización a reescribir la historia.
- Para cada entidad, elegir explícitamente **conservar**, **agregar** o **vincular** por ID existente; no deducir equivalencia por nombre. La operación final requiere confirmación y auditoría.
- Facturación, tareas ejecutadas, horas aprobadas y tramos cerrados: **nunca borrar ni reescribir**.
- Fase 1 / horas de prospección: identificar su fuente real y no duplicarlas ni sumar dos veces.

### Corte D — integración en cinco tabs, sin regresión visual
- **Resumen:** gráfico HH, tarjetas de equipos, ambos botones y colaboradores con flujo existente.
- **Roadmap:** se mantiene `PhaseRoadmap`, etapas, tramos, avance, edición, tareas reales, entregas, zoom y Forecast. Añadir referencia EDT y acción de convertir una referencia a tarea mediante flujo existente, con fechas/asignación requeridas.
- **Bitácora:** conservar eventos y registros de horas; mostrar trazabilidad comercial solo donde corresponde.
- **Extras:** no eliminar sus controles ni alterar permisos.
- **Cotizaciones:** versión aprobada/traspasada y resumen histórico; no suponer que última versión == aprobada.
- La ficha cliente sigue sin datos comerciales.

## 5. Criterios de aceptación / no regresión
1. No tocar `master`; rama y PR existente, commits por cortes.
2. Sin migraciones nuevas salvo justificación de esquema validada; preferir snapshots `JSONB` y tablas ya existentes.
3. No importar equipos artificiales de Gemini ni inventar fechas/assignees para completar el Roadmap.
4. `POST transfer-approved` inicial: todas las entidades consistentes y un solo evento, en una transacción.
5. Proyectos históricos: `409` accionable hasta que exista conciliación explícita. No “arreglar” con `DELETE` de pagos/equipos/módulos.
6. Probar conservación de `PhaseRoadmap`, flujo actual de tareas, módulo, calendario, bloques y edición, además de facturación.
7. Diferenciar UI de referencia (HTML) de datos reales/entidades (PostgreSQL).
8. No afirmar despliegue, migración o pruebas no ejecutadas.

## 6. Consultas de diagnóstico (reemplazar UUID antes de ejecutar)
```sql
SELECT id, name, type, sales_stage, status, sold_hours, used_hours,
       start_date, contract_amount, contract_currency
FROM projects WHERE id = 'REEMPLAZAR_UUID';

SELECT 'equipos' AS entidad, COUNT(*) FROM project_teams WHERE project_id='REEMPLAZAR_UUID'
UNION ALL SELECT 'fases', COUNT(*) FROM project_modules WHERE project_id='REEMPLAZAR_UUID'
UNION ALL SELECT 'horas', COUNT(*) FROM hour_entries WHERE project_id='REEMPLAZAR_UUID'
UNION ALL SELECT 'pagos', COUNT(*) FROM project_payment_milestones WHERE project_id='REEMPLAZAR_UUID';

SELECT name, amount, percent, status, invoice_number, paid_at
FROM project_payment_milestones WHERE project_id='REEMPLAZAR_UUID'
ORDER BY sort_order;
```
