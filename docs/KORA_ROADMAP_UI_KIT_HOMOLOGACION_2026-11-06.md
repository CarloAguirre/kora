# Kora 2.0 · Roadmap operativo — homologación de UI kit

## UI-1 · Estados, chips y badges

Rama: `feature/calculadora-roadmap-diseno-v5-02`  
HEAD inicial: `85b673114e890b639a23f6b00bc4948eba7094ef`

Se reemplazan los chips artesanales de `ProjectPhaseTasksTable` y `SegmentDrawer`
por `Badge` compartido. El helper local `RoadmapTaskStatusBadges` comparte los
tonos para las dos vistas sin cambiar estados persistidos.

| Estado | Texto real | Badge |
| --- | --- | --- |
| todo asignada | Pendiente | neutral |
| in_progress | En curso | info |
| in_review | Completada | warning |
| done | Aprobada | success |
| Sin asignación o referencia EDT | Por asignar | brand + violeta sin punto |
| Rechazada en revisión | Devuelta (adicional) | warning |
| Fecha vencida | Vencida (adicional) | danger |

**Completada no significa Aprobada**. Se conservan combinaciones de estados y
los tooltips del motivo de devolución/equipo de origen. En la cabecera del
bloque, `Badge` sustituye al chip manual manteniendo el texto y aria-label.

La intervención no altera permisos/readonly, acciones, referencias EDT, HH,
avance planificado/real, reglas de entrega/cierre, Gantt, colores por equipo,
API, contratos, BD ni variables de entorno. Se elimina CSS duplicado de chips;
solo queda layout, tamaño compacto y excepción violeta específica.

Tests revisados: `ProjectPhaseTasksTable.test.tsx` y `SegmentDrawer.test.tsx`.
**No ejecutados por conector GitHub**: se requieren typecheck, Vitest y build
locales para cerrar esta iteración.

Pendiente: UI-2 botones/íconos; UI-3 tokens/responsive; UI-4 regresión visual.

## Corrección posterior a la primera integración local (06-11-2026)

El usuario ejecutó sobre `732324be` el `typecheck` Web (correcto), las pruebas Roadmap (59/61 correctas) y el build (fallo de PostCSS). Las dos aserciones fallidas en `ProjectModulesCard.phase-controls.test.tsx` buscaban clases retiradas (`taskState`, `taskApproved`, `taskStateWithDot`); fueron actualizadas para comprobar la implementación compartida `Badge` (tono, tamaño compacto, punto, excepción violeta, etiquetas simultáneas y tooltip en el wrapper). No se alteró JSX productivo ni reglas de estados.

En `QuotationPhaseWorkspace.module.css` se eliminó una declaración huérfana de la limpieza de CSS de la Calculadora (viejo estilo `templateLink`) que dejaba una llave de cierre adicional e impedía compilar. Se conserva `importAction` y sus controles; no se modifica el flujo de importación.

**Pendiente:** volver a ejecutar `typecheck`, Vitest y build locales sobre el nuevo HEAD; esta corrección fue revisada estáticamente vía GitHub, no declarada PASS sin log posterior.

## UI-2 · Botones e iconos del Roadmap operativo (06-11-2026)

Base de trabajo: `e00bf0caace371a8db0e28e4941d78ff2e6e1744`. Migración visual acotada a `Button` original
de `apps/web/src/shared/components/ui`. Sin nuevos controles compartidos ni lógica duplicada.

- `ProjectPhaseTasksTable`: editar, duplicar y eliminar tareas y referencias EDT
  pasan a `Button variant="ghost" size="icon"`. Pie de tabla `+ Agregar tarea`
  usa `Button tertiary sm` conservando apariencia de enlace. La eliminación EDT
  conserva `referenceDeletePending`; las acciones solo aparecen con `canManage && !readOnly`.
- `SegmentDrawer`: `+ Agregar tarea` y `Asignar tareas EDT` usan `Button outline sm`;
  los tres iconos usan `Button ghost icon`; `Marcar como entregado` usa
  `Button primary sm`. El wrapper mantiene tooltip cuando el botón está
  deshabilitado. No se cambia cuándo pueden entregarse o cerrarse bloques.
- `ProjectModulesCard`: el botón residual `+ Agregar fase` usa `Button tertiary sm`,
  pero conserva exactamente `canManage && planningMode`.
- Se restringe CSS local a tamaños/espaciado propios del Roadmap y se eliminan
  estilos de hover/bordes/colores redundantes con el kit. Se mantienen
  `aria-label`, `title`, handlers, iconos e identidad de los equipos.

Pruebas ampliadas: `ProjectPhaseTasksTable.test.tsx`,
`SegmentDrawer.test.tsx` y `ProjectModulesCard.phase-controls.test.tsx`:
variantes nativas, acceso solo lectura, callback, EDT pendiente y modo Planificar.

**Validación pendiente en local:** typecheck Web, Vitest Roadmap y build Web.
El conector GitHub confirma los cambios y el commit, no ejecuta estas pruebas.

Siguientes: UI-3 tokens y responsive; UI-4 auditoría transversal.

Nota de ajuste estático UI-2: se tipa explícitamente la referencia EDT del test en
ambos renders y se aumenta la especificidad de las clases locales de tamaño
para evitar que la hoja de estilos compartida `Button.icon` altere las medidas
de 28×28 px (tabla) y 22×24 px (drawer) por orden de carga de CSS Modules.

## Corrección de integración UI-2 (07-11-2026)

En la validación local del commit `4783edd7`, `typecheck` pasó y el
build Web completó correctamente. Vitest Roadmap terminó con **63/64 PASS**;
el único fallo fue la prueba nueva
`SegmentDrawer.test.tsx > Homologación UI-2 de acciones del bloque operativo`.

**Causa comprobada:** `SegmentDrawer` renderiza el botón `Eliminar tarea`
solo si `!readOnly && onDeleteTask`. El helper `show` transmite
`overrides.onDeleteTask`, pero el escenario de UI-2 lo omitía y aun así
buscaba el botón. El DOM registrado en el fallo confirma que están
`Editar` y `Duplicar`, y no `Eliminar`.

**Corrección:** pasar `onDeleteTask: vi.fn()` al escenario y verificar
la presencia de `Button ghost icon`, su interacción y que se envía
la tarea correcta al callback. No se modifica `SegmentDrawer.tsx`, no se
relajan aserciones ni se habilita eliminar sin permiso.

**Pendiente de validar en local:** volver a ejecutar Vitest (64 tests),
`typecheck` y build Web, con salida verificada sobre el nuevo HEAD.

## UI-3 · Tokens y responsive del Roadmap operativo (07-11-2026)

Base: `674fca4bceb5b26b90c1387d7bf81bddbf277c91`. Trabajo exclusivo en CSS Modules del Roadmap interno:
`ProjectModulesCard.module.css` y `SegmentDrawer.module.css`. No se
modificó `PhaseRoadmap` (Gantt común con el portal), JSX, lógica, BD ni API.

**Tabla operativa:** `operationalContent` y `operationalTasks` permiten
`min-width: 0` y `operationalTaskScroll` tiene scroll horizontal propio con
`overscroll-behavior-x: contain`, manteniendo la tabla a un mínimo de 760 px
y todas las columnas accesibles. Las tareas y nombres de bloque largos pueden
quebrarse en su celda. Se corrigió una regla de selector: el ancho fijo de
118 px y la alineación derecha se aplican exclusivamente a la columna
`aria-label="Acciones"`, no a `Fecha límite` cuando no hay gestión.
Las cabeceras, bordes, textos y superficie neutra usan tokens existentes
(`--kora-*`). Se respetan iconos compactos y colores de identidad por equipo.

**Drawer:** color de texto, líneas y superficies neutras se conectan a tokens
Kora existentes. La cabecera del equipo y las acciones de tareas permiten
wrap. En viewport de hasta 560 px, las métricas pasan de 3 a 2 columnas
y las acciones de tarea bajan sin desplazar el contenido. Hasta 380 px,
las métricas usan 1 columna y los botones del modal de entrega pueden
apilarse. Las barras de progreso real y los estados especiales de entrega
conservan sus colores originales; sus reglas de negocio no cambian.

**Regresión automatizable:** nuevo `RoadmapResponsiveStyles.test.ts`
verifica contratos estáticos del CSS con imports `?raw`: scroll aislado,
min-width de la tabla, selector exclusivo de acciones, tokens y dos
breakpoints del drawer. Estas pruebas **no sustituyen una inspección
visual real**. Para UI-4 validar Chrome en 320, 375, 768 y 1280 px,
incluido scroll de tabla, Gantt, modales y estados del bloque.

**Pendiente de ejecución local:** `typecheck`, Vitest Roadmap incluido el
nuevo test CSS, y `build`. No se proclama PASS sin el log del usuario.

## Ajuste de la validación local de UI-3 (07-11-2026)

Validación local del HEAD `e220827f87e1573a59383cc7830199378d922ebe`: `typecheck` Web correcto y
**64 pruebas funcionales de UI-1/UI-2 pasaron**. Los tres tests nuevos de
`RoadmapResponsiveStyles.test.ts` fallaron antes de ejecutar sus aserciones
de CSS: `toMatch()` recibió un objeto, no un string. La combinación de
`.module.css?raw` con la transformación CSS Modules de Vite/Vitest devolvió
el mapa de clases en lugar de texto fuente.

**Corrección limitada al test:** leer los dos CSS Modules desde Node mediante
`readFileSync(new URL('./archivo.module.css', import.meta.url), 'utf8')`.
Se conservan las tres pruebas y todas sus aserciones sobre scroll aislado,
columna Acciones, tokens y breakpoints; se evita el procesamiento del import
por Vite. Ningún estilo productivo ni componente cambió.

**Pendiente:** ejecutar de nuevo `typecheck`, las 67 pruebas de Roadmap y
`build` Web sobre el nuevo commit. El log compartido terminaba en el fallo
de Vitest y no prueba el resultado del build para ese mismo HEAD.
