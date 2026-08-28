# Decisión — M6 Forecast

Ver `docs/PLAN-MODULOS.md` §M6. Migra `forecast_asignacion` (519 filas) y
`forecast_asignacion_log` (976 filas).

## Qué se migra y cómo se modela

- **`forecast_asignacion` → `forecast_assignments`**: `id_miembro` pasa a
  `team_member_id` (referencia a `team_members`, ya migrado en M2).
  `id_proyecto`/`id_cliente` pasan a `project_id`/`client_id` (uuid,
  `set null` si el proyecto/cliente se borra — igual que tickets).
  `hh_consumidas` **no se migra**: existe en la v1 pero ningún código de
  frontend la lee ni la escribe (confirmado por grep completo de `src/`) —
  es una columna muerta.
- **`tipo` pasa de texto libre a enum** (`forecast_assignment_type`): 8
  valores fijos (`project`, `support`, `vacation`, `admin_day`, `day_off`,
  `sick_leave`, `training`, `other`), el mismo conjunto que
  `TIPOS_ASIGNABLES` en `LiderEquipoForecast/constants.ts`. La v1 nunca tuvo
  un CHECK en esta columna — el catálogo vivía solo en el frontend — pero es
  exactamente el caso "si nadie lo edita, es un enum" del resto del proyecto:
  8 opciones fijas de un `<select>`, nunca texto libre del usuario.
  **`'Sin asignación'` no es un valor del enum**: en la v1 es una fila
  *virtual*, calculada en el cliente cuando quedan horas libres en el
  período, nunca insertada en la tabla. La v2 mantiene esa semántica — la
  calcula la pantalla, no la persiste.
- **Período**: la v1 no restringe `periodo_inicio`/`periodo_fin` a nivel de
  base de datos más allá de que `get_forecast_capacity_view` exige un rango
  de exactamente 5 días. La v2 sí lo valida en el contrato
  (`createForecastAssignmentSchema`/`updateForecastAssignmentSchema`):
  `periodStart` debe ser lunes y `periodEnd = periodStart + 4 días`. Todas
  las pantallas de la v1 solo ofrecen semanas laborales completas
  (`buildLaborWeekRanges`) — nunca se pudo crear un período distinto desde
  la UI real; la v2 simplemente lo hace explícito en el contrato.

## Capacidad: se corrige un cálculo muerto de la v1, con evidencia

La v1 calcula la capacidad de cada colaborador como
`días_hábiles_del_período × 8`, **igual para todos**, sin importar su
`horas_disponibles_semana` (`Forecast/index.tsx:89-102` y
`LiderEquipoForecast/index.tsx:101-111` — dos copias casi idénticas). La
columna `equipo_miembro.horas_disponibles_semana` (estandarizada a 40 en
`20260512122500_...sql`) se lee (`useEquipoActivo`) pero nunca se usa en ese
cálculo. Es dato muerto, no una decisión de negocio: no hay ningún commit ni
comentario que explique por qué se ignora la capacidad declarada de cada
persona.

La v2 ya había resuelto esto antes de empezar M6, sin saberlo: el campo
`team_members.weekly_hours` (`packages/db/src/schema/organization.ts:62`)
lleva desde M2 el comentario *"Capacidad semanal comprometida; base del
cálculo de disponibilidad"*, y `team.contract.ts:14-15` ya menciona
explícitamente que es la base del forecast. La v2 usa esa capacidad real:

```
capacidadHoras = weeklyHours × (díasHábilesDelPeríodo / 5)
```

(el período siempre es una semana Lun-Vie completa, así que en el caso normal
`díasHábilesDelPeríodo = 5` y `capacidadHoras = weeklyHours`; los feriados
dentro de la semana prorratean hacia abajo). Esto es una corrección
deliberada y documentada, no un arreglo silencioso: para colaboradores cuyo
`weeklyHours` no es 40, el % de carga que muestra la v2 **no coincidirá**
con el que mostraba la v1 para el mismo período — es intencional.

## Historial: tabla dedicada → `audit_log` genérico

`forecast_asignacion_log` no se migra a una tabla propia. `packages/db/src/schema/audit.ts:9`
ya documenta que `audit_log` reemplaza los historiales ad-hoc de la v1,
nombrando explícitamente `forecast_asignacion_log` como uno de los que
sustituye. Se aprovecha:

- Cada alta/edición/baja de un `forecast_assignment` llama al
  `AuditRecorder` existente (`entityType: 'forecast_assignment'`,
  `entityId` = id de la asignación, `metadata: { teamId, periodStart,
  periodEnd }` para poder filtrar por equipo+período sin tabla propia).
- El panel de historial de la v1 (`ForecastHistoryPanel`) lee por
  equipo+período, no por asignación individual — por eso el filtro es sobre
  `metadata`, no solo sobre `entityId`.
- No existía forma de **leer** `audit_log` (solo de escribir —
  `AUDIT_RECORDER` es un puerto write-only). Se agrega `AuditReader`
  (`apps/api/src/shared/application/ports/audit-reader.port.ts`) +
  `DrizzleAuditReader`, genérico y reutilizable por cualquier módulo futuro
  que necesite leer su propia bitácora — no específico de forecast. El
  permiso `audit:read` ya existía en el catálogo sin ningún consumidor;
  ahora lo tiene.
- El ETL migra las 976 filas de `forecast_asignacion_log` **directamente a
  `audit_log`** (no se descartan) — es un respaldo histórico real, con
  `entityId` nulo cuando la asignación original ya no existe (igual de
  huérfano que en la v1).

## Dos pantallas de la v1 → una, por permiso y por rol real

La v1 tiene dos componentes:

- `Forecast/index.tsx` — tabla de solo lectura (KPIs + tabla ordenable con
  todos los colaboradores, RPC `get_forecast_capacity_view`, gateada a
  admin en el propio SQL). La usan admin, PMO y líderes sin equipo propio
  (`lider_pm`).
- `LiderEquipoForecast/index.tsx` — tarjetas editables por colaborador,
  selector de equipo, panel de historial. La usan líderes con equipo propio
  (`lider_equipo`/`lider_pm_equipo`).

La v2 es una sola pantalla (`ForecastPage`), igual que ya se hizo con
dashboards/fichas de proyecto en M3: el permiso decide qué se puede hacer, no
el rol.

- Si el usuario **lidera al menos un equipo** (`GET /teams?leaderUserId=me`,
  reutilizando el filtro que ya tenía `teams:read`) y tiene `forecast:manage`
  → vista editable por tarjetas, igual a `LiderEquipoForecast`, con selector
  de equipo si lidera más de uno.
- Si no lidera ningún equipo pero tiene `forecast:read` (admin, PMO, líder
  PM sin equipo) → tabla de solo lectura con KPIs, igual a `Forecast`, pero
  calculada en el backend (`GetForecastCapacityUseCase`) en vez de traer
  filas crudas y agregar en el cliente como hacía
  `get_forecast_capacity_view` + `buildColaboradores`.

`EQUIPOS_OFICIALES` (la normalización de nombres de equipo a un catálogo fijo
en `Forecast/constants.ts:3`) no se porta: existía porque en la v1 el nombre
del equipo era texto libre potencialmente inconsistente; en la v2 el equipo
es una fila real con id, no hace falta adivinar a qué "equipo oficial"
pertenece.

## Selectores de cliente/proyecto solo para `project`/`support`

Igual que `usesClientProjectSelectors` en la v1
(`LiderEquipoForecast/index.tsx:72`): solo los tipos `project` y `support`
muestran selector de cliente y proyecto; el resto del formulario es un campo
Tipo + Comentarios + HH.

## Qué no se porta (con evidencia de que no se usa)

- **`hh_consumidas`** — columna sin lector/escritor en todo `src/`.
- **Cálculo de capacidad `días×8` fijo** — reemplazado, ver arriba.
- **Normalización `EQUIPOS_OFICIALES`** — ya no aplica con equipos reales.
- **RPC `get_forecast_capacity_view`** — su lógica se reimplementa como caso
  de uso de aplicación (mismo criterio que `SupportPlanAvailabilityService`
  en M5): comprobable con tests, no solo con una fila insertada en Postgres.
