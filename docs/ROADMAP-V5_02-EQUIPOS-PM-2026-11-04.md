# Kora — Equipos PM/PMO · fidelización v5 (2026-11-04)

## Alcance

Trabajo sobre la rama `feature/calculadora-roadmap-diseno-v5-02`, sin crear
rutas nuevas ni cambiar la estructura de tablas/migraciones.

La vista **ya existía** en
`/proyectos/:projectId/equipos/:teamId` (`ProjectTeamDetailPage`).
La intervención nutre esa misma ruta: si el actor tiene `projects:manage`
o es el líder PM del proyecto de desarrollo, ve el diseño PM/PMO; para el
líder de equipo se conserva `TeamLeaderProjectView`. Los componentes
operativos `TeamTasksCard`, `TeamDeliveriesCard` y sus hooks de API se
**reutilizan**; no hay un segundo módulo de tareas/entregas.

### Resumen del proyecto: Equipos asignados

- `ProjectTeamsManagementCard` reemplaza la grilla antigua solo para PM/PMO.
- Franja real con HH vendidas, asignadas a equipos, por asignar y
  planificadas en bloques. El último total se calcula sumando
  `project.modules[].segments[].estimatedHours`, no de la EDT referencial.
- Cards de equipo: líder efectivo (override del proyecto o líder del catálogo),
  HH asignadas/en bloques/utilizadas, colaboradores/cupos y estado.
- Cada card usa `projectTeamPath` para ir a la **ruta existente**.
- `Gestionar equipos` cambia a controles de líder, cupos, HH y agregar/quitar.
  Guarda mediante `useUpdateProject` (`PATCH /projects/:id`, lista
  `teams` completa); el backend aplica la validación de cupos.
- El botón papelera muestra aviso cuando el equipo tiene bloques. Además,
  `UpdateProjectUseCase` ahora aplica esa restricción en servidor mediante
  `PROJECT_MODULE_REPOSITORY`, sin importar que el cliente HTML
  omita el diálogo. Devuelve conflicto `PROJECT_TEAM_HAS_ROADMAP_BLOCKS`.
- **Los colaboradores los asigna el líder de equipo**, nunca el PM desde el
  editor agregado de equipos.

### Ficha existente de equipo: enriquecimiento PM/PMO

- La ruta presenta cliente, responsable comercial, PM, inicio, estado,
  etapa y KPIs de equipo.
- Panel de equipo con cupos/personas, HH del equipo y colaboradores asignados.
- Avance del equipo, marcador del plan a fecha y acordeón
  `¿Cómo se calcula este avance?`. El desglose exacto de casos especiales
  queda expresamente para la siguiente iteración con las capturas del usuario:
  no considerar esta primera visualización una especificación definitiva
  del algoritmo de avance.
- Alertas por fase con tareas pendientes de asignación.
- Tabla reutilizada de tareas con pestaña `Por asignar`, contadores,
  módulo + bloque, estados y menú de acciones, visible solo en variante PM/PMO.
- Tabla reutilizada de entregas con `Todas`, `Planificadas`,
  `Vencidas`, `Entregadas`, bloque, módulo y fecha objetivo.
- **Estados reales:** una entrega sin responsable ofrece
  `Asignar responsable`; marcada terminada pasa a `delivered`
  (pendiente de aprobación), luego el líder puede aprobarla. No se salta
  ninguna transición del dominio para simular el prototipo.

### Pruebas

- `ProjectTeamsManagementCard.test.tsx`: cards/enlace, totales, eliminación
  bloqueada cuando existen segmentos, eliminación sin segmentos y alta.
- `ProjectManagerTeamDetailView.test.tsx`: KPIs, colaboradores vacíos,
  alertas, secciones de tareas/entregas y acordeón.
- `DevelopmentProjectDetailView.test.tsx`: integración de vista PM/PMO.
- `update-project.use-case.spec.ts`: el servidor deniega quitar un equipo
  con bloques; acepta quitarlo cuando no los hay.

## Integración y validación (PowerShell)

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts build
pnpm --filter @kora/core build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run src/modules/projects/application/use-cases/update-project.use-case.spec.ts src/test/architecture.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/projects/components/ProjectTeamsManagementCard.test.tsx src/modules/projects/components/ProjectManagerTeamDetailView.test.tsx src/modules/projects/pages/DevelopmentProjectDetailView.test.tsx

pnpm --filter @kora/api build
pnpm --filter @kora/web build
pnpm test
```

## Validación visual

1. Acceder como PM o PMO a `/proyectos/gestion-de-cartera` → Resumen.
2. Revisar cuatro totalizadores, HH por equipo y los enlaces de las cards.
3. Pulsar `Gestionar equipos`, editar líder/cupos/HH y confirmar al
   volver a cargar (persistencia real).
4. Intentar quitar equipo con bloques y comprobar diálogo de restricción;
   efectuar PATCH directo para confirmar que la API devuelve conflicto.
5. Entrar por card a
   `/proyectos/gestion-de-cartera/equipos/:teamId` y comprobar datos
   reales, tareas, entregas, filtros y navegación.
6. Confirmar que entrar como líder de equipo conserva la variante anterior.

**Sin migración nueva.** El usuario/CI debe correr los comandos para
confirmar typecheck, tests y builds; ningún resultado se presume exitoso.

## Corrección postintegración — errores reportados en PowerShell (04-11-2026)

En la primera integración de la sección, el usuario ejecutó compilación,
typecheck y tests. Se observaron estos resultados:

- `@kora/api`: 17 pruebas satisfactorias (6 arquitectura y 11 en
  `update-project.use-case.spec.ts`).
- `@kora/web`: TS6133 por `Select` sin uso en `ProjectModulesCard`;
  TS2352 por un objeto referencial convertido mediante cast a `ProjectModule`.
- Dos tests web fallaron por selectores demasiado estrictos, no por los datos
  calculados: «Sobre presupuesto» tiene un marcador visual al principio;
  las 679 HH aparecen en más de una ubicación.

### Solución

1. `ProjectModulesCard`: eliminado import de `Select` sin uso.
2. `NewWorkBlockModal`: el tipo `module` ahora declara únicamente `id` y
   `name`, que son los únicos campos leídos por el formulario. Eliminado
   el cast inseguro del módulo referencial en `ProjectModulesCard`.
3. Test `DevelopmentProjectDetailView`: aserción textual que admite el
   marcador visual de estado.
4. Test `ProjectManagerTeamDetailView`: localiza el KPI «HH asignadas»
   y verifica 679 dentro de esa tarjeta, aunque otros componentes tengan
   el mismo número.

No se cambiaron reglas de negocio, endpoints, esquemas de BD ni migraciones.
El resultado definitivo exige repetir los comandos de typecheck y tests
sobre el último commit.
