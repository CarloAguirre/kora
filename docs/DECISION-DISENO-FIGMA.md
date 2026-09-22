# Referencia de diseño no implementada (Figma)

Enlace: `https://www.figma.com/design/Sqc5DJtmbLtnBhAM0y4Fww/Kora?node-id=8964-146344`
(frame `kora-project-list`).

## Qué es

Un rediseño de la vista de proyectos que se planeó en algún momento del
proyecto v1 pero **nunca se implementó**: la v1 en producción sigue con
tablas, y este Figma quedó como propuesta sin construir. No es "cómo se ve
hoy la app", es "cómo se pensó que debía verse".

## Qué propone, frente a lo que existe

| | v1 / Kora 2.0 actual | Propuesta del Figma |
|---|---|---|
| Listados | Tabla con filas | Tarjetas por entidad, con avatar/iniciales |
| Progreso de proyecto | No existe | Barra de progreso + fase, por tarjeta |
| Resumen | No existe | Franja de 4 KPIs sobre el listado (totales, en curso, en riesgo, avance promedio) |
| Fondo de contenido | Blanco | Gris claro (`#F4F6F8`-ish), tarjetas blancas con sombra sutil |
| Iconos | Dibujados a mano en este proyecto | Lucide (line icons): `layout-dashboard`, `users`, `folder-open`, `help-circle`, `settings`, `bell`, `log-out`, `chevron-down/right` |
| Navegación | Usuarios y Equipos como ítems propios | Solo 5 ítems: Dashboard, Clientes, Proyectos, Soporte, Administración — Usuarios probablemente anidado bajo Administración |
| Barra superior | Navy (heredado de la v1) | Blanca, con campana de notificaciones y foto de perfil circular |
| Estado del proyecto | — | Píldora con punto de color: Activo (verde), En riesgo (ámbar), Finalizado (lavanda/azul) |

## Decisión tomada (2026-08-25)

Con la migración funcional en curso (M3 de 9 completado en ese momento), se
optó por **no pausarla para rediseñar**. Se adoptó únicamente la mejora de
bajo costo: los iconos de línea pasaron a rutas reales de Lucide en
`shared/components/icons/Icons.tsx`, sin cambiar estructura de navegación ni
layout de ninguna pantalla ya construida.

**El rediseño completo (tarjetas, KPIs, navegación de 5 ítems, avatar de
usuario) queda pendiente como tarea de diseño aparte**, a abordar cuando la
migración funcional (M1–M8) esté terminada. Candidato natural: M7 (Paneles e
informes), que ya toca agregación de datos entre módulos y es donde vive el
concepto de "franja de KPIs".

## Si se retoma

- Los tokens de color de este proyecto (`styles/tokens.css`) ya cubren la
  mayoría de lo que el Figma usa (navy, lima, verde/ámbar de estado); solo
  faltaría el tono lavanda de "Finalizado" y el gris de fondo de contenido.
- El componente `DataTable` seguiría sirviendo para vistas densas
  (administración); las vistas de "mis proyectos" o "mi cartera" son las
  candidatas naturales a la tarjeta con progreso.
- La reestructuración de navegación (Usuarios bajo Administración) es un
  cambio de information architecture, no solo visual: conviene decidirlo
  junto con el diseño de permisos de esa sección, no solo copiar el Figma.

## Corrección de fidelidad con la v1 (2026-08-25, mismo día)

Al revisar las pantallas ya construidas contra la v1 en ejecución, se
detectó que la adopción de iconos había arrastrado sin querer dos piezas del
Figma que no estaban en el alcance aprobado arriba: `Badge` renderizaba la
"píldora con punto de color" del Figma (radio 999px + `.dot`) en vez de la
etiqueta rectangular de la v1 (`.badge`/`.usuario-badge`: radio 4px, sin
punto), y las páginas de listado/ficha no envolvían su contenido en la
tarjeta blanca elevada (`.card-container`/`.form-card`: radio 16px, borde
`#B9C9DD`, sombra `2px 2px 10px rgba(22,81,97,.21)`) que en la v1 es
prácticamente universal. También el sidebar mostraba el texto "KORA" en vez
del isotipo real (`KoraLogo.tsx` en la v1).

Corregido: `Badge` volvió a la forma cuadrada de la v1 (se agregaron
`--kora-warning-text` y `--kora-shadow-card` a `tokens.css` para los colores
exactos), se creó `shared/components/ui/Card.tsx` como envoltorio reutilizable
del `.card-container`, se aplicó a Proyectos/Clientes/Equipos/Usuarios
(listado y ficha) y a `NewProjectPage`, y se portó `KoraLogo.tsx` al sidebar.
Verificado por comparación directa contra la v1 corriendo en `localhost:8080`
(no solo contra el CSS leído). El rediseño completo del Figma sigue diferido
por la decisión de arriba — esto solo corrige un drift accidental hacia él.

## Reversión: modernización del diseño de tablas (2026-09-21)

A pedido explícito del usuario (no un drift accidental como el de arriba), se
adoptó el lenguaje visual de tablas de un Figma más reciente del mismo archivo
(nodes `9895:29804`, `9895:29697`, `9895:29050`: Facturación de proyectos,
Portafolio de proyectos y Clientes) para **todas** las tablas de la app:

- `Badge` pasó de la etiqueta rectangular de la v1 a la píldora con punto de
  color del Figma, en toda la app (no solo en tablas) — se preguntó
  explícitamente al usuario si el alcance debía ser global o solo dentro de
  `DataTable`, y se eligió global. Colores exactos en tokens nuevos
  (`--kora-badge-*-bg/text`), independientes de `--kora-success-surface` y
  afines (que siguen pintando botones/toasts/alertas sin cambios).
- `DataTable` ganó cabecera celeste (`--kora-blue-surface-soft`), tarjeta
  blanca redondeada con sombra sutil propia (`--kora-radius-table`,
  `--kora-shadow-table`) y separadores más suaves (`--kora-border-subtle`),
  en vez de la cabecera lima y los bordes grises fuertes de la v1.
- `Pagination` y `SegmentedControl` (las píldoras de filtro "Todos (N)") se
  recolorearon a juego (texto blanco sobre navy en el estado activo, en vez
  de lima).
- Se quitó el `<Card>` que envolvía únicamente a `DataTable` en
  `ProjectsBillingSection`/`SupportBillingSection` (quedaba una tarjeta
  dentro de otra, ahora que la propia tabla trae su tarjeta); no se tocaron
  los `<Card>` que agrupan tabla + filtros + paginación en una sola sección
  (`ClientsListPage`, `ProjectsListPage`), ni ningún filtro/KPI/exportación
  existente que el Figma simplificado no mostraba — el Figma manda en lo
  visual, no autoriza a quitar funcionalidad ya construida.
- `PortalTable`/`StatusPill` (portal de cliente) no se tocaron: siguen siendo
  el componente aparte que documenta `docs/DECISION-PORTAL-CLIENTE.md`, aunque
  ahora coincidan visualmente con el `Badge` compartido casi por completo.
