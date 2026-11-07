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
