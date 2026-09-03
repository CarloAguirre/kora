# Decisión: alcance de M5 (Tickets y Soporte)

El plan (`PLAN-MODULOS.md`) ya advertía que M5 es XL/alto riesgo y que "la
lógica de consumo de horas de soporte vive casi entera en PL/pgSQL". Confirmado
al leer el esquema: `ticket` INSERT exige, para un colaborador autoservido,
`soporte_has_active_usable_plan(id_proyecto)` — una función que cruza plan de
contrato, período mensual activo y política de sobrantes. Tickets y Soporte
**no se pueden separar limpiamente**: el gate de creación de tickets depende
del motor financiero de soporte.

## Qué se migra y construye en esta pasada

- **`ticket` (641)** → `tickets`: título, cliente, proyecto, proyecto de
  desarrollo vinculado, tipo de servicio, criticidad, responsable, horas
  estimadas/usadas, estado, solución.
- **`ticket_history` (4.307)** → `ticket_history_entries`: log de eventos,
  migrado tal cual (18 `event_type` distintos en origen, se preservan como
  texto libre — igual criterio que `asignacion` en M4: es un registro de
  auditoría, no un catálogo cerrado).
- **`soporte_plan_contrato` (30)** → `support_plans`: el contrato (mensual /
  bolsa / a demanda), con su vigencia y política de sobrantes.
- **`soporte_periodo_mensual` (84)** → `support_monthly_periods`: los períodos
  de un plan mensual, con horas contratadas/consumidas/sobrantes.
- **`soporte_has_active_usable_plan`** se reimplementa como una función de
  aplicación (`SupportPlanAvailabilityService`) que combina `support_plans` +
  `support_monthly_periods`: plan activo, dentro de vigencia, y (para
  mensuales) con un período activo o saldo acumulable disponible. Es el mismo
  árbol de decisión que la función SQL, sin la parte de "quién puede verlo"
  (`rls_can_access_project`), que en la v2 ya resuelve el sistema de permisos.
- **Estado, criticidad y tipo de servicio** pasan a enums (`estado_ticket`,
  `criticidad`, `tipo_servicio` son catálogos de 4-5 filas, nunca editados —
  mismo criterio que "si nadie lo ha editado en 2 años, es un enum").
- **Tablero**: la v1 es un Kanban de arrastrar y soltar (`Soporte/index.tsx`,
  3.243 líneas, el archivo más grande del proyecto), con la ficha del ticket
  como modal sobre el propio tablero. La primera pasada de la v2 lo cambió
  por una lista tabular con página de detalle propia — corregido después de
  revisión de diseño: la v2 replica el tablero (columnas Pendientes/En
  Proceso/En Pruebas/Terminados, arrastrar-soltar para cambiar de estado,
  tarjeta con el mismo layout de chips/íconos) y la ficha como modal
  (`TicketDetailModal`), no como ruta — `/tickets/:ticketId` sólo redirige a
  `/tickets` con el modal abierto, igual que `TicketNavigationState` en la
  v1. Queda fuera del tablero, deliberadamente, lo mismo que ya estaba fuera
  de la lista: la solicitud de HH del ticket, la evidencia adjunta, y las
  reglas de flujo forzado (incidentes que saltan "En Pruebas", solución
  obligatoria antes de avanzar, bloqueo de tickets sin responsable) — el
  drop cambia el estado sin esas validaciones.

## Qué queda fuera de esta pasada, documentado y no fabricado

- **`ticket_hh_request` (363 filas)** — la solicitud de horas desde un ticket,
  con su propia aprobación (`approve_ticket_hh_requests`) y su enlace a
  `registro_hh`. Depende de M4 (ya migrado) pero es un flujo de aprobación
  propio, del mismo tamaño que una aprobación de horas completa. Se migra su
  historial (ya viene en `ticket_history`), pero el flujo vivo (solicitar
  horas desde un ticket, aprobarlas, generar el `hour_entries` asociado)
  queda para un siguiente paso de M5, no de esta pasada.
- **`soporte_proyecto` (143 filas)** — tabla de enlace soporte↔desarrollo a
  nivel de proyecto. El enlace a nivel de ticket ya vive directo en
  `tickets.development_project_id` (mismo dato que necesita
  `rls_support_project_has_development_link`, sin la tabla intermedia). Se
  deja sin migrar porque nada de lo construido aquí la necesita; si M6/M7
  llegan a necesitar el enlace a nivel de proyecto, se retoma.
- **`soporte_saldo_horas_movimiento` (60 filas)** — el libro mayor de
  movimientos de saldo. Necesario para una auditoría financiera detallada de
  cada plan, no para decidir si un plan está usable hoy. Se deja fuera hasta
  que exista una pantalla que realmente lo muestre.
- **`support_workbook_import`** (importación desde Excel) — herramienta de
  carga masiva, no dominio.

Nada de esto se "resuelve en silencio": cada punto queda anotado aquí y el
ETL de esta pasada no migra esas tablas, no las trunca ni las toca.

## Autoridad sobre un ticket (2026-09-03)

`canManageTicket` (`ticket-access.ts`) decide quién puede avanzar/cerrar un
ticket, borrarlo, o cargarle horas (`ChangeTicketStatusUseCase`,
`DeleteTicketUseCase`, `GetTicketUseCase` para los flags `canManage`/
`canDelete`/`canRequestHh`, y `Approve/RejectTicketHhRequestUseCase`): con
`tickets:manage` siempre; sin ese permiso, si el actor es el responsable del
ticket, o si tiene autoridad sobre su proyecto.

Esa autoridad sobre el proyecto usaba `isProjectLeaderOrTeamLeader` — "¿lidera
el proyecto, o lidera CUALQUIER equipo asignado a él?", sin mirar de qué
equipo era el responsable del ticket. Mismo defecto, sin corregir hasta
ahora, que Horas tuvo y corrigió (ver DECISION-M4-HORAS.md "Autoridad de
aprobación"): el líder de un equipo ajeno al responsable, pero también
asignado al proyecto, podía gestionar el ticket igual que el líder real del
equipo del responsable.

Se corrigió igual que Horas, reusando el mismo método
(`ProjectRepository.isProjectLeaderOrTeamLeaderOfMember`, ampliado a aceptar
`memberUserId: string | null`) en vez de duplicar la lógica: EXCLUYENTE — si
el responsable del ticket tiene líder de equipo resoluble para ESE proyecto,
solo ese líder gestiona; si no (o el ticket no tiene responsable), decide el
líder del proyecto. El viejo `isProjectLeaderOrTeamLeader` se eliminó — su
único llamador real era `ProjectsModuleTicketProjectReader`.

En la práctica, hoy esto siempre resuelve al líder del proyecto de soporte:
ningún proyecto de tipo `support` tiene filas en `project_teams` (los
equipos solo se asignan a proyectos de desarrollo desde "Nuevo proyecto"),
así que no hay líder de equipo que resolver para ningún ticket — validado
contra los 39 tickets abiertos en la base real, los 39 caen al líder del
proyecto de soporte, cero sin aprobador resoluble. La ruta de líder de
equipo queda lista para si algún día se asignan equipos a un proyecto de
soporte, sin necesitar otro cambio de código.

`CreateTicketHhRequestUseCase` (autoaprobación de la propia solicitud de
horas) usa el mismo método sobre sí mismo:
`isProjectApprover(projectId, actor.userId, actor.userId)` — "¿decidiría el
actor sus propias horas en este proyecto?" — en vez de la pregunta más
amplia de antes ("¿tiene autoridad sobre el proyecto en general?").

## Confirmado antes de migrar

`bolsa`, `mensual`, `a_demanda` (el modelo anterior a `soporte_plan_contrato`)
tienen cero referencias en el frontend de la v1 — confirmado en el plan. No se
migran.
