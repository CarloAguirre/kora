# Plan de módulos

Orden de construcción de la v2, derivado del análisis de la v1. No es una lista
de deseos: el orden lo imponen las dependencias de datos, y cada módulo se
declara terminado cuando su ETL verifica y sus reglas tienen test.

## El hallazgo que cambia el alcance

La v1 tiene ~60.000 líneas de frontend, pero **una parte grande no es
funcionalidad: es la misma funcionalidad duplicada por rol**.

| Carpeta v1 | Líneas | ¿Dominio propio? |
|---|---|---|
| `pages/lider-equipos/` | 9.639 en 8 pantallas | **No.** Cada pantalla lee `proyecto`, `registro_hh`, `equipo_*`, `forecast_asignacion` |
| `pages/dashboard/` | 4.405 en 4 pantallas | **No.** `Dashboard`, `LiderDashboardA`, `LiderDashboardB`, `ColaboradorDashboard` son cuatro versiones del mismo panel |

`LiderEquipoFichaProyecto` y `LiderProyectoFicha` consultan las mismas tablas que
`FichaProyectoDesarrollo`: son la ficha de proyecto vista por un líder. Existen
por separado porque en la v1 no había forma de decir "esta pantalla, pero
limitada a lo tuyo" — el alcance de los datos se resolvía copiando la pantalla.

En la v2 eso ya está resuelto: los permisos distinguen `projects:read` de
`projects:read_assigned`, y el alcance de los datos lo aplica el caso de uso.
**Una pantalla, un permiso, dos alcances.**

Consecuencia práctica: **~14.000 líneas de la v1 no se migran, se absorben.** El
plan de abajo no incluye un módulo "líder" ni un módulo "colaborador" porque no
existen como dominio.

## Grafo de dependencias

```
                    ┌──────────────────────┐
                    │ ✅ Identidad         │  usuarios · auth · permisos
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
      ┌───────────────┐ ┌─────────────┐ ┌──────────────┐
      │ M1 Catálogos  │ │ M2 Equipos  │ │  (feriados)  │
      │    y Clientes │ │             │ │              │
      └───────┬───────┘ └──────┬──────┘ └──────┬───────┘
              │                │               │
              └────────┬───────┘               │
                       ▼                       │
              ┌─────────────────┐              │
              │  M3 Proyectos   │              │
              └────────┬────────┘              │
                       │                       │
         ┌─────────────┼─────────────┐         │
         ▼             ▼             ▼         ▼
   ┌──────────┐ ┌────────────┐ ┌──────────────────┐
   │ M4 Horas │ │ M5 Tickets │ │   M6 Forecast    │
   │   (HH)   │◄─┤ y Soporte  │ │                  │
   └────┬─────┘ └─────┬──────┘ └────────┬─────────┘
        │             │                 │
        └─────────────┼─────────────────┘
                      ▼
            ┌───────────────────┐
            │ M7 Paneles e      │
            │    informes       │
            └───────────────────┘
```

Fuera del camino crítico: **M8 Notificaciones** (depende de M4) y **M9
Facturación** (depende de M3; hoy con 0 filas en producción).

---

## M1 · Catálogos y Clientes

**Por qué primero:** proyectos, tickets y forecast referencian clientes. Sin
esto no arranca nada. Además es el módulo más simple, y sirve para asentar el
patrón de "módulo CRUD con catálogos" que reutilizarán los demás.

**Datos a migrar**

| Origen | Filas | Destino |
|---|---|---|
| `cliente` | 49 | `clients` |
| `contacto_cliente` | 41 | `client_contacts` |
| `responsable_comercial` | 17 | resuelto contra `users.is_commercial_manager` |
| `pais`, `comuna`, `giro`, `rubro` | 126 | catálogos geográficos y de actividad |
| `criticidad`, `tipo_proyecto`, `tipo_servicio`, `tipo_soporte`, `estado_ticket` | ~36 | catálogos de negocio |

**Reglas de negocio a portar desde la base**

- `enforce_responsable_comercial_usuario_link` — el responsable comercial debe
  ser un usuario con esa marca.
- `trg_finalize_projects_when_client_inactive` — desactivar un cliente finaliza
  sus proyectos. **Efecto en cascada oculto en un trigger**: en la v2 debe ser
  una decisión explícita del caso de uso, con confirmación en la interfaz
  ("esto finalizará 12 proyectos") y su registro en auditoría.
- `sync_responsable_comercial_from_usuario` — la tabla `responsable_comercial`
  existía para desacoplar el nombre del usuario. Con `users.is_commercial_manager`
  ya migrado, **la tabla desaparece**.

**Decisión de modelado:** los catálogos pequeños e inmutables (`pais`, `comuna`,
`criticidad`) pasan a enums o a tablas de catálogo según si el negocio los edita.
Criterio: si nadie los ha editado en 2 años, es un enum.

**Pantallas:** listado de clientes, ficha, alta/edición. (v1: 2.413 líneas en 3
pantallas.)

**Tamaño:** S · **Riesgo:** bajo

---

## M2 · Equipos

**Por qué aquí:** los datos ya están migrados (5 equipos, 42 pertenencias) pero
falta el módulo de gestión. Es pequeño y desbloquea el selector de equipo del
módulo de usuarios, que hoy se alimenta de un apaño (`DrizzleTeamReader`).

**Trabajo**

- Módulo de dominio propio; `TeamReader` del módulo de usuarios pasa a
  satisfacerlo este módulo, y el adaptador provisional desaparece.
- Gestión de pertenencias con histórico (`team_members.left_at` ya lo soporta).
- Capacidad semanal por miembro (`weekly_hours`), base del cálculo de
  disponibilidad que consumirá el forecast.
- Resolver las 3 pertenencias huérfanas que el ETL reportó
  (`user_id` nulo en origen).

**Tamaño:** S · **Riesgo:** bajo

---

## M3 · Proyectos

**Por qué es la bisagra:** horas, tickets y forecast cuelgan de aquí. Es también
donde está el peor problema de modelado de la v1.

### El problema de los tres estados

`proyecto` tiene **tres columnas de estado que se contradicen**:

```
    etapa    | fase_proyecto | estado_proyecto | proyectos
-------------+---------------+-----------------+-----------
 Finalizado  | Finalizado    | Activo          |    92   ← contradictorio
 Activo      |               | Activo          |    54   ← fase vacía
 Activo      | En Desarrollo | Activo          |    23
 Detenido    |               | Detenido        |    10
 Activo      | Levantamiento | Activo          |     8
 Activo      | Marcha Blanca | Activo          |     6
 No Iniciado |               | No Iniciado     |     1
```

92 proyectos están simultáneamente "Finalizado" y "Activo". La v1 lo parcheó con
un trigger `normalize_proyecto_state_stage` y una migración con tablas de
instantánea (`proyecto_lifecycle_scope_snapshot_20260724`) para poder revertir.

**Propuesta v2:** dos conceptos separados y sin solape.

- `status` — ciclo de vida administrativo: `draft` · `active` · `on_hold` · `finished` · `cancelled`
- `phase` — fase metodológica, solo para proyectos de desarrollo:
  `discovery` · `development` · `testing` · `pilot` · `closed`, nullable

Un proyecto de soporte no tiene fase, y hoy se le fuerza una vacía.

**Esta es la decisión que hay que tomar antes de empezar M3.** Requiere que
alguien de negocio confirme cómo leer los 92 casos contradictorios: la
interpretación probable es que `etapa`/`fase_proyecto` son la verdad y
`estado_proyecto` quedó obsoleto, pero **no se migra hasta confirmarlo**.

### Datos a migrar

| Origen | Filas | Nota |
|---|---|---|
| `proyecto` | 194 | Con la normalización de estado de arriba |
| `proyecto_colaborador` | 157 | Asignaciones con HH asignadas/consumidas |
| `equipo_proyecto` | 234 | Equipos asignados a proyectos |
| `proyecto_participacion_historial` | 381 | Histórico de entradas y salidas |
| `proyecto_observacion` | 5 | Con adjuntos en Storage y ventana de edición |

### Reglas a portar

- `trg_recalc_proyecto_hh_from_registro` y `..._from_ticket` — `hh_utilizadas`
  se recalcula desde las horas y los tickets. En la v2 es un caso de uso o una
  proyección, no un trigger: hoy nadie puede probar que el número sea correcto
  sin insertar filas en Postgres.
- `enforce_project_responsable_comercial_from_cliente` — el responsable comercial
  del proyecto se hereda del cliente.
- `admin_delete_project` — borrado lógico en la v2, como los usuarios.
- Prioridad de proyecto (`prioridad`, migración de agosto 2026).

**Pantallas:** listado, ficha de desarrollo, ficha de soporte, alta de desarrollo,
alta de soporte, edición, equipos del proyecto, observaciones. (v1: 10.218
líneas en 9 pantallas + las 3 fichas duplicadas del líder que se absorben.)

**Tamaño:** XL · **Riesgo:** alto — por el modelo de estados y por el volumen de
pantallas

---

## M4 · Registro de horas (HH)

**El corazón de la aplicación.** 5.872 registros y la lógica de negocio más
enredada de la v1.

### Reglas a portar

| Regla | Dónde vive hoy |
|---|---|
| Estados `pendiente` → `aprobado` / `rechazado` con motivo | CHECK + RLS |
| Aprobación por el líder (`decision_lider_*`) | 6 funciones `rls_can_review_registro_hh*` |
| **Aprobador designado** (`designated_approver_*`) | 1.072 de 5.872 registros lo usan |
| **Horas sin proyecto** — 752 registros (13%) | `rls_can_approve_no_project_hh`, `rls_can_view_no_project_hh` |
| Horas extra (`horas_extra`) — 103 registros | columna + reglas de aprobación |
| Bloqueo de registro en proyectos detenidos | `20260819100000_block_hh_on_stopped_projects.sql` |
| Invariante de asignación proyecto-usuario | `20260814100000_enforce_hh_project_assignment_invariant.sql` |
| Elegibilidad para registrar (`rls_hh_user_is_eligible`) | RLS |
| Feriados y días laborales | `feriado` (48 filas) |

### Deuda de datos a limpiar en el ETL

`registro_hh.categoria` es texto libre y está sucio:

```
Desarrollo 596 · Soporte 373 · Migración 233 · Seguimiento 86
"-" 71 · QA 60 · Reuniones 56 · Vacaciones 52
"Sin Asignación" 50 · "Sin asignación" 47   ← el mismo valor, dos veces
```

Pasa a catálogo cerrado. Las dos variantes de "Sin asignación" se unifican y el
`-` se mapea a "Sin categoría", ambas cosas registradas en el informe del ETL.

**Pantallas:** registro de horas (calendario/semana), modal de registro,
aprobación por líder, historial, horas aprobadas por proyecto. (v1: 660 + 2.089
del modal + partes de las 8 pantallas de líder.)

**Tamaño:** XL · **Riesgo:** alto — es el módulo con más reglas y el que más
usan a diario

---

## M5 · Tickets y Soporte

Dos submódulos que comparten datos y conviene hacer juntos.

### Tickets

| Origen | Filas |
|---|---|
| `ticket` | 641 |
| `ticket_history` | 4.307 |
| `ticket_hh_request` | 363 |
| `support_workbook_*` (importación desde Excel) | staging + overrides |

**Reglas:** ciclo `Pendiente` → `En Proceso` → `En Pruebas` → `Terminado` →
`Cerrado`; solicitudes de HH sobre ticket con aprobación
(`approve_ticket_hh_requests`, `trg_validate_ticket_hh_request_insert`); cierre
con total de horas aprobadas (`close_ticket_with_authoritative_hh_total`);
tablero para líderes (`list_ticket_board_for_leaders`); historial automático
(3 triggers); evidencias en Storage.

### Soporte

| Origen | Filas | Concepto |
|---|---|---|
| `soporte_plan_contrato` | 30 | Contratos: 13 mensual · 4 bolsa · 13 a demanda |
| `soporte_periodo_mensual` | 84 | Periodos con horas contratadas y consumidas |
| `soporte_saldo_horas_movimiento` | 60 | Movimientos de saldo |
| `soporte_proyecto` | 143 | Vínculo soporte ↔ proyecto |
| `bolsa`, `mensual`, `a_demanda` | 30 | **Modelo antiguo. Verificado: 0 usos en el frontend** |

**Regla central:** consumo de horas contra el plan, con política de sobrantes
acumulables (12 de los 13 contratos mensuales la usan). Es lógica financiera:
merece los tests más estrictos del proyecto.

**Verificado:** `bolsa`, `mensual` y `a_demanda` tienen **cero referencias en el
frontend**. Son el modelo anterior a `soporte_plan_contrato` y quedaron con
datos huérfanos. No se migran; se conservan en la v1 por si hay que consultarlas.

**Aviso sobre el acceso:** `soporte_plan_contrato` tampoco se consulta
directamente desde el frontend — se accede a través de las funciones
`soporte_has_active_usable_plan` y `soporte_save_project_plan`. Es decir, **la
lógica de consumo de horas de soporte vive casi entera en PL/pgSQL**. Portarla
exige leer esas funciones línea a línea antes de escribir el dominio; no basta
con mirar las pantallas.

**Pantallas:** listado de tickets, nuevo ticket, ficha, historial, tablero de
soporte, importación desde Excel. (v1: 5.096 líneas en 7 pantallas, con
`Soporte/index.tsx` de 3.243 líneas — el archivo más grande del proyecto.)

**Tamaño:** XL · **Riesgo:** alto — lógica financiera y el mayor volumen de historial

---

## M6 · Forecast

| Origen | Filas |
|---|---|
| `forecast_asignacion` | 519 |
| `forecast_asignacion_log` | 976 |

**Tipos de asignación:** Proyecto 459 · Soporte 43 · Vacaciones 12 · Otros 2 ·
Capacitación, Día libre, Licencia médica 1 c/u.

**Reglas:** capacidad por miembro (`get_forecast_capacity_view`) cruzando
`team_members.weekly_hours` con feriados y ausencias; bitácora de cambios con
actor (`set_forecast_asignacion_log_actor` — sustituida por la auditoría
transversal de la v2).

**Tamaño:** M · **Riesgo:** medio

---

## M7 · Paneles e informes

Se hace **al final** porque agrega datos de todos los módulos anteriores.

**Aquí está la mayor simplificación del proyecto.** La v1 tiene cuatro paneles
(`Dashboard`, `LiderDashboardA`, `LiderDashboardB`, `ColaboradorDashboard`,
4.405 líneas) que son el mismo panel con distinto alcance de datos. En la v2:
un panel, widgets que declaran su permiso, y el alcance lo aplica el caso de uso.

**Incluye:** exportación a PDF (`utils/pdfReports.ts`, 730 líneas) y a Excel
(`xlsx`, `write-excel-file`).

**Tamaño:** L · **Riesgo:** bajo — sin reglas nuevas, solo agregación

---

## M8 · Notificaciones

Digest de horas pendientes para líderes. En la v1 es de agosto de 2026 y
**las últimas 8 migraciones del repositorio son iteraciones sobre esta misma
función**, ajustando a quién notificar:

```
20260820120000_add_pending_hh_leader_notification_digest.sql
20260821100000_broaden_project_hh_digest_to_team_assignment.sql
20260821110000_respect_designated_approver_for_project_hh_digest.sql
20260821120000_match_leader_pending_hh_project_scope.sql
20260821130000_match_leader_pending_hh_staffing_visibility.sql
20260821140000_match_project_hh_digest_to_actual_network_requests.sql
```

Ocho intentos de acertar una regla de "a quién le corresponde aprobar esto". No
es descuido: es lo que cuesta afinar una regla escrita en SQL, sin tests y
desplegándola cada vez.

En la v2 esa regla es una función de dominio con sus casos cubiertos, y afinarla
es cambiar un test. **Vale la pena rehacerla, no portarla.**

Requiere además el adaptador real de correo, hoy pendiente
(`LogNotificationSender`).

**Tamaño:** M · **Riesgo:** medio — la regla de destinatarios es sutil

---

## M9 · Facturación

Tres comprobaciones, y las tres dicen lo mismo:

- La tabla `facturacion` tiene **0 filas**.
- `pages/Facturacion.tsx` (279 líneas) **no tiene ruta** en `App.tsx`.
- **No se importa desde ningún sitio**: es una pantalla huérfana.

Lo único vivo es un widget de facturación dentro del panel principal, que se
alimenta de otros datos.

**Recomendación: no migrar.** Rehacerla cuando el negocio la pida, con los
requisitos de ese momento. Portar una pantalla a la que nadie puede llegar es
pagar por mantener algo que no existe en la práctica.

**Confirmar con negocio antes de descartar** — puede ser una funcionalidad a
medio construir y no abandonada.

---

## Trabajo transversal

Va en paralelo, no es un módulo:

| Tarea | Cuándo | Por qué |
|---|---|---|
| **Adaptador de correo real** | Antes de M8, ideal en M1 | Hoy las invitaciones van al log |
| **Storage de archivos** | Con M3 (observaciones) y M5 (evidencias) | Supabase Storage no tiene equivalente todavía en la v2 |
| **Feriados** | Antes de M4 | 48 filas; lo consumen horas y forecast |
| **Límite de intentos por IP** | Cuando la v2 se exponga a internet | Hoy hay bloqueo por cuenta, no por origen |
| **Exportación PDF / Excel** | Con M7 | 730 líneas de la v1 a portar |

---

## Hitos

| Hito | Módulos | Qué se puede hacer al terminarlo |
|---|---|---|
| **H1 · Base operativa** | ✅ Identidad + M1 + M2 | Administrar personas, equipos y clientes. La v2 ya es útil para RR.HH. y comercial |
| **H2 · Núcleo** | + M3 + M4 | Proyectos y registro de horas: **el 80 % del uso diario** |
| **H3 · Operación completa** | + M5 + M6 | Tickets, soporte y planificación. La v1 se puede apagar |
| **H4 · Cierre** | + M7 + M8 | Paneles, informes y notificaciones |

**H3 es el punto de corte real.** Hasta entonces conviven las dos versiones: la
v1 en solo lectura para lo no migrado, la v2 para lo migrado. Que el ETL
conserve `legacy_id` es lo que hace posible esa convivencia.

---

## Cómo se declara terminado un módulo

Mismo listón que el módulo de usuario:

- [ ] Dominio con sus reglas y sus tests, sin importar NestJS ni Drizzle
      (lo verifica `architecture.spec.ts`)
- [ ] Casos de uso con test, usando dobles en memoria
- [ ] Contratos Zod en `@kora/contracts`, compartidos con el front
- [ ] Repositorios Drizzle detrás de puertos
- [ ] Pantallas componetizadas, ninguna por encima de ~300 líneas
- [ ] CSS Modules, sin estilos globales nuevos
- [ ] Paso de ETL idempotente + comprobaciones en `verify.ts`
- [ ] Reglas portadas desde triggers/RLS documentadas en `docs/MIGRACION.md`
- [ ] Permisos declarados en el catálogo, sin comparar roles en el código

---

## Decisiones pendientes antes de empezar

Cuatro preguntas que bloquean trabajo si no se responden a tiempo:

1. **Los 92 proyectos "Finalizado + Activo"** (bloquea M3) — ¿cuál de las tres
   columnas es la verdad? Sin esto no se puede migrar `proyecto`.
2. **Las dos categorías "Sin asignación"** de `registro_hh` (bloquea M4) —
   ¿se unifican, o significan cosas distintas?
3. **`bolsa`/`mensual`/`a_demanda`** (bloquea M5) — ¿queda algo vivo, o
   `soporte_plan_contrato` los sustituyó del todo?
4. **Facturación** (bloquea M9) — 0 filas, sin ruta y sin importar desde
   ninguna parte. ¿Se descarta, o es una funcionalidad a medio construir?

Las cuatro son preguntas para negocio, no técnicas. Conviene lanzarlas ya:
la 1 y la 2 bloquean el camino crítico.
