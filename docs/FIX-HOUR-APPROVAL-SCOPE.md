# Fix · Aprobación de HH según tipo de proyecto

## Incidente

José Aponte (rol `leader`) veía y podía seleccionar horas pendientes de
**Soporte PDC** y **Soporte Hotel Las Torres**, pero recibía el código
`HOUR_ENTRY_CANNOT_APPROVE` al intentar aprobarlas. Los líderes de esos
proyectos, comprobados en base de datos, son Solmary Castro y Natalia
Valentina Jaña Pérez. No corresponde otorgarle esos permisos a José.

## Regla de negocio intacta

- Proyectos **development**: aprueba el líder del equipo del autor
  asignado a ese proyecto; sin líder resoluble, el líder del proyecto.
- Proyectos **support**: aprueba el líder del proyecto.
- Roles **admin/pmo**: pueden aprobar en ambos casos.

## Alcance del ajuste

- `DrizzleHourEntryRepository.buildWhere`: alinea visibilidad y
  autorización para soporte y desarrollo. También considera al designado
  de registros sin proyecto. Afecta listado, campanita y dashboard.
- `DrizzleHourEntryRepository.search`: calcula el aprobador presentado
  con la misma regla; contempla múltiples membresías de equipo en desarrollo.
- `HourEntriesApprovalTable`: bloquea selección y acciones para quien
  no está autorizado; sigue mostrando la fila si el alcance lo permite.
- `TeamHourHistoryPanel`: condiciona aprobar/rechazar, editar horas
  aprobadas y eliminarlas al aprobador real; el autor conserva las
  acciones autorizadas por el backend.
- `RecentHistoryCard` y `resolvedApprover`: presentan al líder real
  del proyecto en soporte, sin priorizar designados residuales.
- `GetDashboardSummaryUseCase`: el contador de aprobaciones del líder
  ya no contabiliza sus propias horas pendientes.

## Auditoría de avisos y otras vistas

- **Campanita** (`GetLeaderRemindersUseCase`): usa `hourEntries.summarize`
  y el mismo `leaderScopeUserId`. Comparte la corrección automáticamente.
- **Dashboard**: usa `hourEntries.search` y el mismo filtro. Comparte
  la corrección y excluye horas propias del conteo de aprobaciones.
- **Correo diario 08:00** (`SendPendingHoursDigestUseCase`): resuelve
  destinatarios por `projects.findApproverCandidatesForMember`, que
  ya aplica la restricción a desarrollo; no requiere modificación.
- **Pendientes en ficha del proyecto** (`GetProjectPendingApprovalsUseCase`):
  también utiliza `findApprovers`, sin discrepancia detectada.
- **Backend de aprobación, rechazo, edición y eliminación**: se conserva
  la validación obligatoria vía `HourEntryApprovalAuthorityService`.

No se modifican permisos, roles, datos productivos, esquema ni migraciones.

## Validación requerida en QA

1. José NO puede seleccionar/aprobar soportes PDC y Hotel Las Torres.
2. Solmary y Natalia sí pueden aprobar horas de sus proyectos respectivos,
   según los permisos y estados de los registros.
3. Desarrollo mantiene la prioridad de líderes de equipo por proyecto.
4. Admin y PMO conservan la cola general y la autorización.
5. Registro sin proyecto: mantiene aprobación designada / líder del autor.
6. Campanita, dashboard y correos diarios no presentan falsos pendientes.
7. El servidor sigue rechazando intentos directos no autorizados (403).

Las pruebas en Vitest son regresiones de helper frontend y del predicado
SQL; antes de integrar deben ejecutarse build, typecheck, tests y QA en BD.


## Ajuste complementario: listado de Soporte

La página `ProjectsListPage` ahora presenta tres sub-pestañas con sus
contadores y filtro de API independientes:

| Pestaña | Filtro `projects.status` | Interpretación |
| --- | --- | --- |
| Activos | `active` | Proyecto administrativamente activo |
| Terminados | `finished` | Proyecto cerrado/finalizado |
| Inactivos | `draft`, `on_hold`, `cancelled` | Soporte no iniciado, detenido o cancelado (incluye «Inactivo» legado) |

La fecha de término del contrato (`support_plans.end_date`) **no determina**
por sí sola la pertenencia a «Terminados». En Kora el cierre explícito del
plan de soporte (`CloseSupportPlanUseCase`) cambia el proyecto contenedor
a `finished` únicamente cuando no existe otro plan activo vinculado.
El vencimiento por fecha puede finalizar períodos mensuales pero no cambia
automáticamente `projects.status`.

La nueva pestaña usa el mismo `GET /projects` y la paginación existente;
no requiere migración, cambio de contrato HTTP ni actualización de datos.
El estado de navegación recuerda «Inactivos» al volver desde el detalle.

La ficha de soporte presenta únicamente **Activo / Inactivo / Terminado**.
`on_hold`, `draft` y `cancelled` se muestran como Inactivo, sin reescribir
los estados históricos. El listado y su exportación usan las mismas etiquetas;
la nomenclatura de proyectos de desarrollo permanece independiente.

Elegir Terminado con un contrato activo abre el diálogo de cierre, que solicita
fecha y motivo y cierra el plan junto con el proyecto en una transacción. Si
queda otro contrato activo, el proyecto permanece en su estado anterior hasta
cerrar el último. La API impide marcar terminado directamente mientras exista
un contrato activo y solo permite corregir a terminado un soporte cuyo contrato
ya esté cerrado. Tampoco permite reactivar un soporte sin contrato activo.
