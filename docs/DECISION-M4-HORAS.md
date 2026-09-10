# Decisión: modelo de registro de horas (M4)

`registro_hh` en la v1 resuelve su lógica de negocio en dos capas que no
siempre coinciden: RLS decide QUIÉN puede insertar/leer una fila, y el
cliente (`RegistroHHModal.tsx`) decide en qué `estado` nace y si exige un
aprobador designado, confiando en que RLS ya validó la fila. Esa segunda
decisión nunca fue forzada por la base de datos — un cliente distinto al
oficial podría, en teoría, insertar una fila `aprobado` para otra persona sin
pasar por ningún control adicional, siempre que la fila en sí pasara RLS. La
v2 mueve esa decisión al dominio, evaluada en el servidor.

## `categoria` y `asignacion`: texto libre, no enum

`categoria` tiene 3.008 valores distintos en producción — es una etiqueta de
tarea escrita a mano, no una categoría cerrada (de ahí el "duplicado"
`Sin Asignación` / `Sin asignación`: son dos personas escribiendo lo mismo,
no un bug). `asignacion` es más estable pero también acumula valores
históricos fuera del selector vigente (`Soporte`, `Apoyo Interno`,
`Ticket-IN0529`...) porque `HH_ASSIGNMENT_OPTIONS` en `hhConcepts.ts` cambió
con el tiempo. Forzar cualquiera de los dos a un enum de base de datos habría
rechazado miles de filas reales. Ambos se migran como texto libre; el
conjunto vigente para ALTAS NUEVAS (`HOUR_ENTRY_ASSIGNMENTS` en los
contratos) se valida en la aplicación, no en el esquema — igual que
`categoria`/`descripcion` en la ficha de cliente.

## Aprobación automática: solo `colaborador` necesita aprobación

`shouldRegistroHHRequireApproval` en la v1 es una línea: `role === 'colaborador'`.
Todo lo demás —el resto de la maraña de `rls_is_hh_self_registration_without_approval`,
`rls_can_insert_designated_hh_approver`— es la forma en que RLS defiende esa
misma regla desde el otro lado (qué fila puede insertarse), no una regla
adicional. En la v2: un colaborador nace `pending`; cualquier otro rol que
pueda registrar horas (`leader`, `pmo`) nace `approved`. `admin` y `commercial`
no registran horas propias en absoluto (`rls_can_register_hh` los excluye
explícitamente).

## Aprobador designado: solo horas sin proyecto de un colaborador

- Con proyecto (`Proyecto`/`Prospecto`): sin aprobador designado — se aprueba
  por acceso al proyecto (líder del proyecto o líder de un equipo asignado a
  él).
- Sin proyecto, colaborador: aprobador designado OBLIGATORIO, y debe ser un
  `leader` con estado `active` (equivalente a roles 2/4/5 + `Habilitado` en
  la v1 — la v2 ya no distingue lider/lider-pm/lider-equipo como roles
  separados, así que la validación se simplifica a `role === 'leader'`).
- Sin proyecto, no colaborador (autoregistro de un líder/pmo): nace aprobado,
  sin aprobador.

## Autoridad de aprobación

`admin`/`pmo` siempre pueden decidir (mismo criterio de equivalencia que ya
usa el resto del sistema — `isAdminLikeRole`/`hasRoleAccess`). Para el resto:

- Registro con proyecto: líder del proyecto, o líder del **propio equipo del
  autor del registro**, si ese equipo está asignado al proyecto
  (`ProjectRepository.isProjectLeaderOrTeamLeaderOfMember`). Reemplaza el
  árbol de cinco funciones RLS anidadas de la v1 (`equipo_proyecto`,
  `lider_equipo`, `proyecto_colaborador`, `forecast_asignacion`); la v2 solo
  tiene `projects.leaderUserId`, `project_teams.teamId → teams.leaderUserId`
  y `team_members` para acotar al equipo del autor.
  **Corregido tras revisión de negocio** (`RecentHistoryCard`/columna
  "Aprobador" del historial de horas expuso el problema): la primera versión
  de esta regla (`isProjectLeaderOrTeamLeader`, sin `memberUserId`) concedía
  aprobación a el líder de CUALQUIER equipo asignado al proyecto, no solo el
  del autor — un colaborador de "Desarrollo" podía terminar con sus horas
  aprobables por el líder de "UX-UI" solo porque ambos equipos están
  asignados al mismo proyecto. `isProjectLeaderOrTeamLeader` (sin acotar,
  "¿puede actuar sobre el proyecto en general?") en ese momento seguía en uso
  por Tickets sin este acotamiento — corregido después, ver "Actualización
  (2026-09-03)" más abajo: ya no existe ese método.

  Segunda corrección, mismo hallazgo: el líder del equipo del autor a
  considerar es `project_teams.leaderUserId` ("líder para este proyecto", ver
  `ProjectTeamRepository`), no `teams.leaderUserId` (líder orgánico del
  equipo) — un equipo puede tener un líder distinto por proyecto, y la
  primera versión de `isProjectLeaderOrTeamLeaderOfMember` usaba el segundo.
  Ahora usa `coalesce(project_teams.leaderUserId, teams.leaderUserId)`, con el
  líder orgánico solo como respaldo cuando el proyecto no fijó uno propio.
- Registro sin proyecto: el aprobador designado, o quien lidera al dueño del
  registro (`TeamRepository.isTeamLeaderOfMember`, nuevo método).

Esto vive en `HourEntryApprovalAuthorityService`, una decisión de aplicación
explícita — no una política RLS que hay que leer en SQL para entender.

### Tercera corrección: EXCLUYENTE, no "cualquiera de los dos" (regla de negocio explícita)

Hasta acá, un registro con proyecto lo podía aprobar el líder del proyecto
**o** el líder del equipo del autor — cualquiera de los dos, indistintamente.
Revisión de negocio explícita (2026-09-03): esa no es la regla real. Es:

- Si el colaborador **tiene** líder de equipo resoluble para este proyecto
  (override `project_teams.leaderUserId`, o el líder orgánico del equipo como
  respaldo), **solo ese líder de equipo** aprueba/rechaza — el líder de
  proyecto queda excluido de la decisión directa.
- Si el colaborador **no tiene** líder de equipo resoluble (no pertenece a
  ningún equipo asignado al proyecto, o ese equipo no tiene líder ni override
  ni orgánico), decide el líder del proyecto — igual que antes.
- El líder de proyecto sigue necesitando saber que hay horas esperando a un
  líder de equipo que aún no decide: no puede aprobarlas él, pero sí verlas.
  Para eso existe `GetProjectPendingApprovalsUseCase`
  (`GET /hour-entries/projects/:projectId/pending-approvals`), que agrupa por
  líder de equipo lo pendiente que NO le corresponde decidir al propio líder
  de proyecto, con cuántos registros, cuántas HH y desde cuándo. El frontend
  lo pinta en `PendingApprovalsCard`, en la ficha del proyecto — visibilidad
  únicamente, sin acción de aprobar desde ahí. No hay sistema de
  notificaciones (ni email ni in-app) en el proyecto todavía; esta tarjeta es
  deliberadamente la versión mínima ("verlo al entrar a la ficha"), no un
  aviso proactivo.

Esto cambió `isProjectLeaderOrTeamLeaderOfMember` y
`findApproverCandidatesForMember` (`DrizzleProjectRepository`) para que
resuelvan primero el líder de equipo del autor sobre ese proyecto, y solo
caigan al líder de proyecto cuando ese primer paso no resuelve a nadie —en
vez de una condición `OR` entre ambos.

**Actualización (2026-09-03): Tickets ahora usa el mismo método.** El viejo
`isProjectLeaderOrTeamLeader` (sin `OfMember`, "¿puede actuar sobre el
proyecto en general?") tenía exactamente el mismo defecto sin corregir que
esta sección documentaba desde la primera corrección: no acotaba por
responsable, así que el líder de un equipo AJENO al responsable del ticket
(pero asignado al mismo proyecto) podía gestionar el ticket igual que su
propio líder. Se eliminó ese método — su único llamador real era
`ProjectsModuleTicketProjectReader` — y Tickets pasó a usar
`isProjectLeaderOrTeamLeaderOfMember(projectId, actorUserId,
ticket.assigneeUserId)`, el mismo método que Horas, con `memberUserId`
ampliado a `string | null` para cubrir un ticket sin responsable (cae
directo al líder de proyecto, sin equipo que consultar). Ver
docs/DECISION-M5-TICKETS.md "Autoridad sobre un ticket" para el detalle del
lado de Tickets.

### `designatedApprover` heredado de la v1 en filas con proyecto (2026-09-10)

Mismo hallazgo, otro síntoma: la migración dejó `designated_approver_user_id`
poblado en **1391 filas** de `hour_entries` que además tienen `project_id` —
combinación que el dominio actual prohíbe activamente (`HourEntry.create`/
`update` fuerzan `designatedApproverUserId = null` cuando hay proyecto, ver
`DesignatedApproverNotAllowedError`), pero que existía igual en datos
migrados de antes de esa regla. El mapper (`toHourEntrySummary`/
`toHourEntryDetail`) exponía ese valor sin filtrar, y
`resolvedApprover()` en el frontend lo prioriza sobre `projectApprovers` —
así que la UI mostraba "debe aprobar" al aprobador designado viejo en vez
del líder de equipo/proyecto vigente. Verificado contra la base real: de 52
horas pendientes con proyecto, 46 traían este dato heredado, y en 9 ya no
coincidía con el aprobador correcto (ejemplo real: "AurelIA - SPR" muestra a
José Aponte como aprobador designado, pero la líder actual del proyecto es
Solmary Castro).

No era un problema de autorización — `HourEntryApprovalAuthorityService` ya
ignoraba `designatedApproverUserId` para registros con proyecto al decidir
quién puede aprobar/rechazar — solo de qué nombre se mostraba. Corregido en
dos capas: el mapper ahora siempre devuelve `designatedApprover: null`
cuando el registro tiene proyecto (sin importar qué quedó en la columna), y
se limpiaron las 1391 filas en la base (`UPDATE ... SET
designated_approver_user_id = null WHERE project_id IS NOT NULL AND
designated_approver_user_id IS NOT NULL`) para que el dato en reposo
tampoco quede engañoso si algo lo lee directo de la tabla.

### Cuarta corrección: la VISIBILIDAD de `hours:read_team` tenía el mismo defecto que ya se había corregido para DECIDIR (2026-09-10)

Reportado en producción: José Aponte veía, en su cola de aprobaciones, horas
de "App Walvy" de gente que ni lidera ni puede aprobar ahí — Ana María Soto
Lobos es la líder real de "Desarrollo" para ESE proyecto. El botón
"Aprobar"/"Rechazar" ya fallaba correctamente (la Tercera corrección ya
protegía la decisión), pero la fila igual aparecía en su pantalla.

Causa: `ListHourEntriesUseCase` resolvía `hours:read_team` con
`TeamRepository.findMemberUserIdsForLeader` — "todos los miembros activos de
cualquier equipo que lidere, en cualquier proyecto" (`leadsTeamCondition`:
`teams.leaderUserId = actor` O existe algún `project_teams.leaderUserId =
actor`, SIN mirar a qué proyecto pertenece la fila que se está listando).
José lidera "Desarrollo" como override de `project_teams` en 14 proyectos
distintos (Meta, Kora, AurelIA - SPR...) — eso bastaba para que
`findMemberUserIdsForLeader` devolviera a TODOS los miembros de "Desarrollo"
(Miguel Herize, Sergio Vidal...) sin importar que en "App Walvy"
específicamente el líder de ese equipo sea Ana María, no José. El resultado
se usaba como un `IN (userId...)` plano — no podía distinguir "visible en el
Proyecto A" de "visible en el Proyecto B" para la misma persona, porque el
liderazgo es por-proyecto pero el filtro era por-persona.

Mismo árbol de decisión que `isProjectLeaderOrTeamLeaderOfMember`, pero
expresado como condición SQL por fila (no se puede resolver como una lista
de ids cuando la visibilidad depende del proyecto de cada fila):
`HourEntryFilters.leaderScopeUserId` reemplaza a `visibleToUserIds` para
`hours:read_team`. Una fila es visible si es propia, o (sin proyecto) si el
actor lidera al dueño en general, o (con proyecto) si el actor es el líder
del equipo del dueño PARA ESE proyecto, o (con proyecto, sin líder de equipo
resoluble) si el actor lidera el proyecto. `GetHourEntryUseCase` (detalle de
un registro por id) tenía el mismo defecto vía `findTeamMemberUserIds` y se
corrigió igual, delegando a `isProjectApprover` para registros con proyecto.

Validado contra los 63 pendientes reales tras el cambio: cero falsos
positivos de visibilidad para José sobre proyectos donde no lidera al
equipo del autor.

- **Filtro Período/Detalle del resumen de horas** (Usuarios → "Resumen de
  horas por colaborador" y "Disponibilidad" en la v1): esas dos pestañas SÍ
  dependen de `hour_entries`, así que ahora son viables, pero no se
  construyeron en esta pasada — quedan para cuando exista la vista de
  reporting agregado (candidato natural: M7).
- **`ticket_hh_request`** (363 filas, horas solicitadas desde un ticket): se
  aborda en M5 (Tickets), que referenciará `hour_entries` una vez migrado.
- **Feriados** (`holidays`, 48 filas): se migran junto con M4 porque el plan
  los marca como prerequisito, pero todavía no se usan para bloquear ni
  marcar nada en la UI — quedan como catálogo de lectura listo para cuando
  el formulario de registro semanal los necesite.
- **Réplica exacta de `rls_can_access_project`**: la v1 concede acceso de
  aprobación también vía `proyecto_colaborador` y `forecast_asignacion`
  (asignación de forecast). Ninguna de las dos existe todavía en la v2
  (`proyecto_colaborador` no se migró — es redundante con
  `project_team_members`; `forecast_asignacion` es M6). La autoridad de
  aprobación de M4 cubre líder de proyecto y líder de equipo asignado, que
  cubre la enorme mayoría de casos reales; se amplía si M6 lo requiere.

## Estado del backend

Dominio, aplicación, infraestructura y presentación de `hour_entries` están
completos y probados (115 tests en `@kora/api`, incluidos los 14 del agregado
`HourEntry` y el guard de arquitectura). Migración ejecutada y verificada
contra datos reales: 5.743 de 5.872 registros de horas (129 quedan fuera por
un `user_id` huérfano en el propio origen — no existe en `usuario`, no es un
problema de mapeo) y 48/48 feriados. `pnpm verify-hours` excluye esas 129
filas del esperado explícitamente, no las ignora en silencio.

Pendiente: el módulo de frontend (listado propio, alta, cola de aprobación
para líderes/PMO/admin).
