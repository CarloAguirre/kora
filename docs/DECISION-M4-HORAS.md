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

- Registro con proyecto: líder del proyecto, o líder de algún equipo asignado
  a él (`ProjectRepository.isProjectLeaderOrTeamLeader`, nuevo método —
  reemplaza el árbol de cinco funciones RLS anidadas de la v1 que llegaba a
  `equipo_proyecto`, `lider_equipo`, `proyecto_colaborador` y
  `forecast_asignacion`; la v2 solo tiene `projects.leaderUserId` y
  `project_teams.teamId → teams.leaderUserId`, así que el árbol se reduce a
  dos condiciones).
- Registro sin proyecto: el aprobador designado, o quien lidera al dueño del
  registro (`TeamRepository.isTeamLeaderOfMember`, nuevo método).

Esto vive en `HourEntryApprovalAuthorityService`, una decisión de aplicación
explícita — no una política RLS que hay que leer en SQL para entender.

## Qué se dejó fuera de M4, deliberadamente

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
