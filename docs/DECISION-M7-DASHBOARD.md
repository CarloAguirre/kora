# Decisión — M7 Paneles e informes

Ver `docs/PLAN-MODULOS.md` §M7. Es, por diseño, la mayor simplificación del
proyecto: la v1 tiene **cuatro pantallas** (`Dashboard` admin, `ColaboradorDashboard`,
`LiderDashboardA` líder PM, `LiderDashboardB` líder de equipo — 4.405 líneas en
total) que son el mismo panel con distinto alcance de datos. La v2 es **una
sola pantalla**, con secciones que declaran el permiso que necesitan y cuyo
alcance lo decide el caso de uso, no el componente.

## Qué se porta

Un único endpoint `GET /dashboard/summary` agrega, en un solo viaje, las
secciones que el usuario puede ver (cada sección es `null` si el actor no
tiene el permiso — decidido en el backend, no ocultado solo en la UI):

- **Horas** (`hours:read_own`): horas de hoy, horas de la semana (con meta de
  40h, igual que `META_SEMANAL` en `ColaboradorDashboard`), y cuántos
  registros rechazados hay pendientes de corrección — replica las 2 primeras
  tarjetas KPI y el semáforo "Atención Requerida" de `ColaboradorDashboard`,
  generalizado a cualquier rol que registre horas.
- **Aprobaciones pendientes** (`hours:approve`): cuántos registros esperan
  la revisión del actor — mismo dato que ya sirve `HoursApprovalsPage` (M4),
  aquí solo se cuenta.
- **Tickets abiertos** (`tickets:read`): cuenta de tickets no cerrados,
  organización completa — solo se calcula para quien tiene el permiso sin
  scope (`tickets:read`), no para `tickets:read_assigned` (ver "Qué no se
  porta").
- **Proyectos activos** (`projects:read`): mismo criterio, solo para el
  permiso sin scope.
- **Capacidad de forecast** (`forecast:read`): reutiliza
  `GetForecastCapacityUseCase` de M6 tal cual — no se recalcula nada, se
  llama al caso de uso ya existente y se resume a un promedio de carga. Si el
  actor lidera algún equipo, el resumen se acota a su equipo (mismo criterio
  de "lidera un equipo" que ya decide, en `ForecastPage`, si ve la vista
  editable o la de solo lectura).

Cada sección se resuelve con un lector liviano nuevo (mismo patrón que los
adaptadores de M5/M6 — `DashboardHoursReader`, `DashboardTicketReader`,
`DashboardProjectReader`, todos en `apps/api/src/modules/dashboard/infrastructure/services/`,
envolviendo el repositorio del módulo dueño de cada dato) más el caso de uso
de forecast ya existente, en vez de volver a escribir agregaciones en SQL o
en el cliente — es literalmente "sin reglas nuevas, solo agregación", como
dice el plan.

## Qué no se porta, y por qué

- **La tab "Soporte" del `Dashboard` admin (facturación)**: KPIs de HH
  vendidas/utilizadas/desviadas por plan de soporte, desglose por cliente,
  y el reporte PDF (`downloadDashboardPDF`). Esta tab consulta `bolsa`,
  `mensual`, `a_demanda` y `facturacion` — las tres primeras son,
  confirmado en `DECISION-M5-TICKETS.md`, el modelo anterior a
  `soporte_plan_contrato` sin otras referencias vivas en el frontend, y
  `facturacion` tiene 0 filas y ninguna ruta real (`DECISION` pendiente en
  `PLAN-MODULOS.md` §M9). Esta tab es, en la práctica, el único lugar de
  toda la v1 donde esas tablas se leen — y es exactamente el mismo caso que
  M9 ya dejó pendiente de confirmación de negocio. No se migra ahora; se
  retoma junto con M9 si el negocio confirma que Facturación sigue viva.
- **El gráfico de tendencia "Tendencia de uso vs horas contrato"**: sus
  datos (`chartData`, `Dashboard/index.tsx:153-162`) son **sintéticos** —
  reparte el total anual entre 12 meses y le suma ruido con `Math.random()`.
  No hay ninguna consulta real de agregación mensual detrás. No tiene
  sentido portar fielmente un gráfico que la propia v1 rellena con números
  inventados; y no hay una agregación real que portar en su lugar.
- **"Mi Equipo" (grilla de 7 días por compañero) y "Planificación Semanal"**
  de `ColaboradorDashboard`: ambas quedan **reemplazadas por M6 Forecast**,
  que ya da una vista real de planificación semanal por colaborador — con
  cálculo de capacidad correcto (ver `DECISION-M6-FORECAST.md`), no
  duplicado aquí.
- **Las tablas completas "Mis Proyectos" / "Proyectos del equipo"**
  (duplicadas, con columnas casi idénticas, en `LiderDashboardA`,
  `LiderDashboardB` y en `DashboardProyectos` — que además se embebe dentro
  del `Dashboard` admin): la v2 ya tiene **una sola** pantalla de Proyectos
  (M3) con tabs, orden, búsqueda, gráfico y exportación a Excel. El panel no
  vuelve a incrustar una cuarta copia de esa tabla — muestra el conteo y
  enlaza a `/proyectos`.
- **La tabla completa de historial de HH con acciones (ver/editar/eliminar)**
  de `LiderDashboardA`/`LiderDashboardB`: ya existe como el módulo de Horas
  (M4, `/horas` y `/horas/aprobaciones`). El panel muestra el conteo y
  enlaza, no reimplementa la tabla.
- **`TicketHHRequestModal`** y el flujo de aprobación de HH-desde-ticket: ya
  documentado como fuera de alcance en `DECISION-M5-TICKETS.md`; no
  reaparece aquí.

## Precedente corregido

`DECISION-M5-TICKETS.md` dice que `bolsa`/`mensual`/`a_demanda` no tienen
"ninguna referencia en el frontend" — esa verificación fue sobre las
pantallas de tickets/soporte. Esta investigación encontró que sí las
referencia `Dashboard/index.tsx` (la tab Soporte), pero exclusivamente ahí,
y exclusivamente para el reporte financiero que este documento deja fuera de
alcance junto con Facturación. No cambia la decisión de M5; la precisa.
