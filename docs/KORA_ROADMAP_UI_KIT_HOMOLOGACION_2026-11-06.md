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
