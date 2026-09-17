# Portal de cliente (rol `cliente`)

Enlace: `https://www.figma.com/design/Sqc5DJtmbLtnBhAM0y4Fww/Kora?node-id=8756-45807`
(frame "Propuesta Mejoras Vista Cliente").

## Qué es

Un nuevo tipo de usuario, `cliente`: el contacto externo de una empresa
cliente, que entra a Kora para ver únicamente los proyectos y contratos de
soporte de su propia empresa — nunca datos de Kabeli ni de otras empresas.
Es un rol genuinamente nuevo (no existía ninguna variante de "portal
externo" antes de esto).

## Qué se integró de verdad (no es mock)

- `cliente` es una fila más de `ROLE_CODES` en `packages/contracts/src/users/roles.ts`,
  con dos permisos propios: `projects:read_own_client` y `tickets:read_own_client`.
  Por qué dos permisos nuevos y no reusar `projects:read_assigned` /
  `tickets:read_assigned`: esos significan "asignado a mí como miembro interno
  de un equipo Kabeli", y un usuario `cliente` no pertenece a ningún equipo.
- Como `RoleCode` es una unión cerrada, agregar la fila obligó (el compilador
  lo exige) a actualizar cada `Record<RoleCode, …>` existente: las etiquetas
  y tonos de badge, la semilla de roles en `packages/db`, y los espejos de
  "¿este rol lleva equipo?" en front (`team-requirement.ts`) y backend
  (`team-assignment.policy.ts`) — ambos en `forbidden`, igual que `commercial`.
  El rol ya aparece de forma automática en el selector de rol del formulario
  de usuarios (`UserFormDialog.tsx` itera `ROLE_CODES`).
- Ruteo y navegación: `/portal/proyectos`, `/portal/proyectos/:projectId` y
  `/portal/soporte` están dadas de alta en `app/router/routes.tsx`, protegidas
  por los permisos nuevos igual que cualquier otro módulo — no hay ningún
  `if (role === 'cliente')` especial en `ProtectedRoute`. El `Sidebar` muestra
  "Proyectos"/"Soporte" apuntando a esas rutas solo a quien tiene esos
  permisos (mismo mecanismo que el resto del menú).
- Excepciones de UI puntuales, documentadas donde ocurren: `DashboardPage`
  redirige a `cliente` a `/portal/proyectos` (ese dashboard interno no tiene
  ninguna sección con sentido para este rol), y el `Sidebar` oculta el enlace
  "Dashboard" para `cliente` porque apuntaría de vuelta al mismo redirect.
  Son ramas por rol para decidir FORMA de interfaz, el mismo patrón que ya
  usa `DashboardPage` para `collaborator`/`leader` — nunca para autorización.
- **Bug real detectado y corregido durante la implementación**: `admin` y
  `pmo` se definen como "todos los permisos salvo X" (`[...PERMISSIONS].filter(...)`),
  así que al agregar `projects:read_own_client`/`tickets:read_own_client` al
  catálogo, ambos roles los heredaron sin querer — el `Sidebar` de cualquier
  admin/PMO mostraba "Proyectos" DOS veces (el interno y el del portal).
  Corregido excluyendo `CLIENT_PORTAL_ONLY_PERMISSIONS` de ambos roles en
  `roles.ts`, con el mismo patrón que ya excluía `admin:legacy_import` de
  `pmo`. Quien haya iniciado sesión como admin/PMO antes de este fix necesita
  cerrar sesión y volver a entrar para que su token refleje los permisos
  corregidos (el rol y los permisos viajan embebidos en el JWT).

## Fidelidad visual con el Figma

Tras una primera pasada con los componentes compartidos "aproximados" (Badge,
DataTable, tokens de color existentes), se pidió explícitamente máxima
fidelidad al Figma. Se rehizo con valores exactos, verificando cada pantalla
contra `get_design_context` de su nodo correspondiente:

- **`PortalTable`** (`client-portal/components/PortalTable.tsx`) reemplaza el
  uso inicial de `DataTable`: cabecera celeste `#E0EEFF` y tipografía exacta
  del Figma, en vez de la cabecera lima de `DataTable` (estilo v1). Es un
  componente nuevo por la misma razón que `StatusPill` — no tocar el
  `DataTable` compartido y arrastrar el drift a pantallas internas.
- `StatusPill`, `StatPill` y `ClientCompanyHeader` usan los colores/tamaños
  exactos leídos del Figma (p.ej. `#e1f6e5`/`#2e9e52` para "Activo",
  `#8bc53f` para las barras de etapa) en vez de los tokens `--kora-*` más
  cercanos pero no idénticos.
- **La botonera de 9 íconos** sobre la ficha de proyecto (Figma node
  `9203:2178`, confirmado con `get_design_context` — son 9 botones, no 8) es
  funcional: cada ícono muestra/oculta una de las 9 secciones de la ficha
  (incluida la franja de datos del proyecto). `SECTION_TOGGLES` en
  `ClientProjectDetailPage.tsx` es la única lista de la que leen tanto los
  botones como las secciones, así que nunca pueden desincronizarse.
- **"Horas y avance" tiene 4 tarjetas, no 3** — se había omitido "Horas
  utilizadas a la fecha" (con su píldora de desviación "En riesgo"/"En
  control"), detectada al releer la metadata del nodo `9203:2902`.
- Se agregaron a `shared/components/icons/Icons.tsx` los íconos `link`,
  `list`, `lock`, `bar-chart-3` y `triangle-alert` (Lucide), que no existían
  en el set compartido.
- **Segunda pasada de fidelidad**, tras comparar contra `get_design_context`
  del node exacto `9203:2063` ("Detalle de proyecto") que se compartió:
  - La franja de datos del proyecto tenía los campos equivocados: son 4
    (Cliente con logo, Responsable Kabeli, Responsable cliente + cargo, Fecha
    de inicio-fin), no los 6 que se habían inventado — sin campos de
    facturación, que no existen en esta tarjeta.
  - Faltaba por completo la pestaña "Vista Interna" (deshabilitada, con
    candado) / "Vista Cliente" (activa) que el Figma sí muestra encima de la
    botonera de 9 íconos.
  - Los colores de "Hoja de ruta" estaban invertidos: una fase `finished`
    pinta sus 5 pasos gris-azulado (`#93a5b8`), NUNCA verde; solo el paso
    ACTUAL de la fase `in_progress` es verde (`#8bc53f`). Ese verde no
    representa "completado" en general.
  - Faltaba la línea vertical roja "HOY" dentro de la fase en curso, la fila
    de meses sobre cada barra de fase, y el texto de ayuda junto al título de
    "Hoja de ruta".
  - El estado de fase "En proceso" es lavanda (`#eceafb`/`#6c63e8`, tono
    `info` nuevo en `StatusPill`), no ámbar — un tono distinto del que usan
    los hitos ("Esperando aprobación" sí es ámbar/`warning`).
  - El punto de la píldora `neutral` no es del mismo color que su texto
    (`#93a0ac` vs `#5d6b7a`) — `StatusPill` usaba `currentColor` para el
    punto, así que salía mal en ese único tono.

## "Roadmap del proyecto" — integrado, no placeholder

A pedido explícito, la sección que originalmente quedó como tarjeta
"próximamente" se construyó igual que el resto: `ProjectGanttChart`
(`client-portal/components/`) replica el Gantt semanal por módulo del Figma
(node `9203:2583`) — eje de meses, un módulo por fase con sus 4 tareas fijas
(Diseño, Desarrollo, QA Funcional, Revisión y Aprobación Cliente), barras de
color por tipo de tarea posicionadas por porcentaje, línea "HOY", y leyenda.
No se agregó ninguna librería de gráficos: es una cuadrícula CSS con barras
`position:absolute` posicionadas por `%`, suficiente para esta vista. Los
datos (`gantt` en `ClientProjectDetail`) son de ejemplo — `startPercent`/
`widthPercent` por tarea son aproximaciones visuales del Figma, no un cálculo
real a partir de fechas de inicio/fin (ver el punto 3 de la sección
siguiente: ese cálculo real depende del mismo caso de uso de agregación que
falta para el resto de la vista).

## Qué quedó mockeado (y por qué)

**Todo el contenido de `apps/web/src/modules/client-portal/` lee datos fijos
de `mocks/client-portal.mocks.ts`, no de la API.** No es una limitación de la
implementación de pantallas: es que el dato "los proyectos/contratos de MI
empresa" no se puede construir todavía en el backend. Falta:

1. **El dominio de correo permitido bloquea a cualquier cliente real hoy
   mismo.** `LoginUseCase` (`apps/api/src/modules/auth/application/use-cases/login.use-case.ts:73`)
   exige `email.belongsToAnyDomain(settings.allowedEmailDomains)`, y
   `ALLOWED_EMAIL_DOMAINS=kabeli.cl` en `.env` — un contacto externo con un
   correo `@empresacliente.cl` no puede iniciar sesión aunque tenga usuario y
   contraseña válidos. Esto hay que resolverlo (¿lista de dominios por
   cliente? ¿el mismo allowlist pero incluyendo los dominios de clientes
   activos?) antes de dar de alta un usuario `cliente` real; para verificar
   esta implementación se usó un usuario de prueba con correo `@kabeli.cl`.
2. **Cómo se enlaza un usuario `cliente` a su empresa y sus proyectos.**
   Hoy un usuario solo se enlaza a `team_id`
   (`packages/db/migrations/0000_initial_identity_schema.sql`); no hay forma
   de saber a qué empresa pertenece un usuario `cliente`, ni a qué proyectos
   puntuales de esa empresa. **Ver la sección "Cómo se piensa otorgar el
   acceso" más abajo — no es un simple `client_id`, es un modelo por
   contacto + proyectos concedidos.**
3. **Un caso de uso de agregación**, análogo a `GetDashboardSummaryUseCase`
   (`apps/api/src/modules/dashboard/...`), que dado el `client_id` del actor
   junte sus proyectos y contratos de soporte — con el alcance acotado en el
   propio backend, no solo oculto en el front.
4. **Un endpoint + hooks de React Query** (`client-portal.api.ts` /
   `client-portal.queries.ts`, mismo patrón que `dashboard.api.ts`) que
   reemplacen los `import` de `mocks/client-portal.mocks.ts` por datos reales.
   Las páginas ya están escritas contra las formas de `types.ts`, pensadas
   para que ese cambio sea el `import`, no una reescritura de la vista.

Dentro de las pantallas ya construidas, una pieza se dejó explícitamente sin
implementar (comentario en el código, no solo aquí):

- **Ficha de contrato de soporte** (individual y "consolidado"): el Figma
  muestra que el nombre de cada contrato en la tabla de Soporte es un enlace
  a una ficha con la lista de tickets del contrato. Esa ficha no se construyó
  — el nombre se muestra como texto plano, no como un enlace roto.

## Cómo se piensa otorgar el acceso — modelo por contacto, no por empresa

Aclaración del usuario durante la implementación, que **cambia el punto 2 de
arriba**: el acceso al portal no se resuelve con un `client_id` genérico en
`users` mostrando TODOS los proyectos de esa empresa. El modelo pretendido es
más fino, y arranca desde el módulo `Clientes` que YA EXISTE:

- Cada cliente ya tiene contactos con nombre, cargo, correo y teléfono
  (`clientContactSchema` en `packages/contracts/src/clients/client.contract.ts`,
  administrados desde `ClientDetailPage`/`ClientContactsEditor.tsx`). Ese
  contacto — no una fila nueva de "usuario cliente" desconectada — es quien
  debería recibir el acceso al portal.
- **Otorgar el acceso es una acción explícita desde la ficha del cliente**
  (`ClientDetailPage`), sobre un contacto puntual: algo como "Dar acceso al
  portal" que (a) crea o vincula la cuenta `cliente` a ese `client_contact_id`
  y (b) deja elegir, ahí mismo, A QUÉ PROYECTOS de esa empresa tiene visión
  ese contacto — no todos por defecto. Dos contactos de la misma empresa
  podrían ver carteras de proyectos distintas.
- Esto implica una relación muchos-a-muchos (contacto-portal ↔ proyecto), no
  una sola columna `client_id`. Falta: una tabla de concesión (p.ej.
  `client_portal_project_grants`), el endpoint/UI en `ClientDetailPage` para
  gestionarla, y que `GetClientPortalSummaryUseCase` (punto 3 de arriba)
  filtre por esa tabla en vez de "todos los proyectos de la empresa".
- **Esto no está implementado** — es la aclaración del modelo de datos antes
  de construirlo, para no empezar por el `client_id` genérico que se había
  planteado primero. Si se quiere, es el siguiente paso natural: la UI de
  "Dar acceso al portal" en `ClientDetailPage` + la tabla de concesión.

## Decisiones de diseño tomadas al construirlo

- **`StatusPill` (píldora + punto de color) es un componente NUEVO, propio de
  `client-portal/`, no un cambio a `shared/components/ui/Badge`.** El Figma de
  referencia general de Kora ya usaba esa misma forma y el equipo la revirtió
  para las pantallas internas por no calzar con la v1 en producción — ver
  `docs/DECISION-DISENO-FIGMA.md`. El portal de cliente es una pantalla nueva
  sin una v1 que proteger, así que aquí sí se sigue el Figma, pero sin tocar
  el `Badge` compartido y arrastrar de nuevo ese drift a las pantallas
  internas.
- El resto del shell (sidebar navy, `TopBar` blanco con campana/avatar/logout,
  `Card`, `SegmentedBar`, `Button`, `Tabs`) se **reutiliza tal cual** del
  sistema de diseño existente — no se construyó un layout paralelo. Da la
  casualidad de que `TopBar`/`Sidebar` ya habían adoptado buena parte del
  lenguaje visual de este mismo Figma (ver su propio historial), así que la
  vista de cliente termina pareciéndose mucho al Figma sin haber duplicado
  ningún componente de layout.
- El logo del cliente (recuadro junto al nombre de la empresa) y la marca
  "kabeli" del encabezado se reemplazaron por un ícono neutro y por
  `KoraLogo`, respectivamente: no hay assets de logo por cliente en este
  proyecto, y el resto de la app ya usa el logo de Kora para la mención
  "Diseñado y desarrollado por…" (pie de `DashboardSupportTab.tsx`).

## Actualización de la ficha de proyecto al Figma más reciente (2026-09-16)

El Figma de referencia (fileKey `Sqc5DJtmbLtnBhAM0y4Fww`, sección "Propuesta
Mejoras Vista Cliente", node `8756:45807`) tiene **dos** variantes de la
ficha de proyecto: `9663:23202` ("Kora · Proyectos y Soporte 1", la que se
había implementado originalmente) y `9663:24207` ("Kora · Proyectos y Soporte
2", más reciente). `ClientProjectDetailPage.tsx` se actualizó a la variante 2.
Verificado capa por capa contra el código real, con `get_screenshot` (no solo
la metadata en texto, que incluye capas ocultas engañosas), lo que cambió:

- **Nueva sección "Facturación"** (`ProjectBillingCard`), justo después de la
  tarjeta de info: 4 tarjetas de monto, barra de progreso segmentada y una
  tabla de cronograma de pago por tramo.
- **"Roadmap del proyecto" (Gantt fijo de 3 módulos × 4 tareas) reemplazado
  por "Roadmap por Fases"** (`PhaseRoadmap`): un acordeón con una tarjeta por
  fase del proyecto, cada una con sus propias tareas agrupadas por rol de
  equipo (DEV/QA/IA/UX/RPA, cantidad variable), sus entregas y un mini-listado
  de bitácora relacionado a esa fase.
- **"Hitos y aprobaciones" + "Puntos de atención e incidentes" fusionadas en
  una sola "Bitácora"** (`ProjectBitacora`): un feed cronológico único, cada
  entrada con su propia etiqueta de fase en vez de vivir bajo el
  `milestonesCaption` de una sola fase activa.
- **"Horas y avance" pasó de 3 a 4 tarjetas**: se agregó "Horas utilizadas a
  la fecha" y la tarjeta "Horas estimadas" ahora incluye una sub-línea "Horas
  desviación" con badge de riesgo.
- **"Hoja de ruta" recoloreada**: fase `finished` ahora pinta sus 5 pasos en
  verde (antes gris-azulado, nunca verde); en la fase `in_progress` el paso
  ACTUAL ahora es ámbar (antes verde). La línea roja perdió la etiqueta "HOY"
  (queda recortada fuera del área visible en el propio Figma) y pasó a
  describirse como el avance ESPERADO, no como "hoy".
- **Nueva sección "Avance del periodo"** (`PeriodReportCard`): un reporte
  narrativo con viñetas de logros del período. A diferencia de las anteriores,
  esta sección está **oculta en el Figma en ambas variantes** (`get_screenshot`
  devuelve 1×1 px) — se construyó igual por pedido explícito, no por hallazgo
  de un cambio visible.
- La fila de íconos "mostrar/ocultar sección" se quedó en 9 botones en el
  archivo de Figma, sin sincronizar con las 2 secciones nuevas ni con la
  fusión de Hitos+Atención en Bitácora. Se priorizó el invariante que el
  propio código ya documentaba (un ícono por sección, `SECTION_TOGGLES` como
  única fuente de verdad) por sobre copiar un conteo desactualizado: son 10
  ahora.

Sin cambios: "Accesos y enlaces", "Impacto en el negocio" y "Métricas de la
etapa actual — QA" (verificados con captura, idénticos a la variante 1).

Sigue siendo 100% mock — nada de esto conecta a datos reales; los bloqueos
documentados arriba (sin `client_id` en `users`, sin caso de uso de
agregación, sin endpoint) no cambiaron.

### El calendario del Roadmap por Fases es de fechas reales

El Gantt de cada fase no dibuja posiciones fijas: el prototipo
`ficha_proyecto_lider` (entregado por el usuario) define cómo debe
comportarse, y `PhaseRoadmap` lo sigue. Barras, marcadores, bloques de mes,
cuadrícula y línea de HOY se calculan como % del rango visible a partir de
fechas ISO en el mock, así que:

- El **zoom Semanas/Días** es un `<input type="range">` real: ensancha la
  pista (100% → 400%) y sobre 35 revela la cuadrícula y las etiquetas por día.
- El **filtro "Rango visible"** (con `TextField type="date"`) y
  Aplicar/Restablecer recalculan de verdad el eje: no son acciones de ejemplo.
- Solo la columna de pistas hace scroll horizontal. Los nombres de fila viven
  en una columna aparte de ancho fijo (`.ganttLabels`), igual que
  `ProjectModulesCard` del módulo interno: si scrollea todo junto se pierde de
  vista a qué fila pertenece cada barra.

El estado de cada tramo (terminado / en curso / futuro) se deriva de sus
fechas contra hoy, no se guarda aparte. Lo único sin lógica real ahí son los
chips de "Resumen de avance", que el Figma pinta como píldoras navy de solo
lectura.

## El portal ya está conectado a datos reales (2026-09-16)

Las tres pantallas (`ClientPortalPage`, `ClientProjectDetailPage`,
`ClientSupportContractDetailPage`) dejaron de leer `mocks/client-portal.mocks.ts`
(borrado) y ahora usan los hooks reales (`useProjectsList`, `useProjectDetail`,
`useSupportPlansForClient`, `useSupportPlanDetail`, `useTicketsList`,
`useTicketDetail`) a través de una capa de adaptadores nueva en
`apps/web/src/modules/client-portal/adapters/` — las vistas y sus componentes
no cambiaron, solo el origen del dato. Sigue sirviéndose por la **vista previa
interna** (`/clientes/:clientId/vista-cliente/...`, con el PMO actual): el
bloqueo real (`users` sin `client_id`, login de cliente) descrito arriba no se
tocó, sigue pendiente.

Esquema nuevo (`packages/db/src/schema/projects.ts`): tabla
`project_payment_milestones` (tramos de pago — "Facturación") y columnas
`projects.period_report_date` / `period_report_achievements` ("Avance del
periodo"). Seed de ejemplo en `packages/db/src/seeds/demo-client-portal.ts`
(`pnpm --filter @kora/db seed:demo`, idempotente) — reutiliza el cliente real
"Edificate Inteligente" ya migrado de la v1 (no crea uno de mentira) y agrega
un proyecto de desarrollo con 4 fases completas más los dos contratos de
soporte de los Figma `9007:8170` (consolidado, 3 proyectos cubiertos) y
`9007:8445` (único).

Huecos de datos reales, documentados en el propio adaptador que los toca en
vez de fingirlos:
- `project_module_deliveries` no guarda nombre propio — la etiqueta de cada
  entrega se arma con el equipo responsable ("Entrega DEV").
- El SLA del Figma ("06:53:18/8hr") no tiene reloj real detrás — se muestra
  "usadas/estimadas" en su lugar.
- "Hoja de ruta" no guarda un % de avance propio por fase — se aproxima con
  la fracción de tiempo transcurrido dentro del rango estimado.
- La fila de la lista de proyectos (`ClientProjectRow`) perdió `phaseCount`/
  `tag`: `GET /projects` (resumen) no trae módulos ni equipos, a diferencia
  del detalle — se reemplazó por `typeLabel` ("Desarrollo"/"Soporte").
