# Kora V5.02 — Panel lateral de bloques del Roadmap

Fecha: 2026-11-04. Rama: `feature/calculadora-roadmap-diseno-v5-02`.

## Referencia visual

Tres capturas del prototipo local `kora-proyectos-v5_02.html`
proporcionadas por el usuario:

1. **RPA: cerrado por entrega** — chip verde «Cerrado», fechas y HH,
   100% real, entrega de cierre verde, tareas aprobadas y acciones
   «Reabrir bloque», «Eliminar bloque», «Editar bloque».
2. **QA: entrega vencida** — chip rojo «Entrega vencida» incluso si las
   tareas ya alcanzaron el 100%, entrega de cierre roja con fecha
   vencida, acción «Marcar como entregada» y «+ Agregar tarea».
3. **PMO: cierre sin entrega** — chip verde «Cerrado», apartado
   «Cierre del bloque», fecha de cierre y «Reabrir bloque», con lista
   compacta de tareas y mismo pie de edición.

## Implementación

El componente monolítico `SegmentDrawer` de
`ProjectModulesCard.tsx` se extrajo a
`apps/web/src/modules/projects/components/SegmentDrawer.tsx` y
`SegmentDrawer.module.css`. Reutiliza la función canónica
`getLinkedBlockTasks` y el índice de progreso
`indexTeamBlockProgress`; no recalcula el avance con otra fórmula.

El modal HTML nativo admite ahora:
- `eyebrow`: contexto «Fase N: …» sobre el título;
- `compactSide`: panel lateral de 430px, scroll independiente y pie fijo.
Estas props son opcionales y no cambian los demás modales.

El contenido del panel tiene:
- Identidad de equipo, líder efectivo disponible y chip de estado.
- Tres métricas: fechas, HH estimadas, HH consumidas aprobadas del bloque.
- Barra de avance real y marca de avance esperado.
- Entrega de cierre verde/roja/neutra, según el estado real de la entrega.
- Tareas en filas compactas, con estado, HH estimadas, fecha límite,
  edición, duplicación y eliminación.
- Pie «Eliminar bloque» y «Editar bloque» cuando el usuario puede gestionar.

## Reglas importantes

- Una entrega `planned` vencida tiene prioridad visual sobre el
  `closedAt` automático que puede aparecer cuando se aprueban todas
  las tareas. **No se afirma que la entrega fue realizada** solo por
  tener el 100% de avance de tareas.
- Las entregas `delivered` siguen pendientes de aprobación; solamente
  `approved` significa entrega aprobada.
- «Marcar como entregada» despliega el campo de comentario obligatorio
  y llama al caso de uso existente `useUpdateProjectModuleDelivery`.
  No se salta la autorización ni la transición de estado.
- Para un bloque sin entrega, se muestra la fecha `closedAt` real.
  El contrato actual **no dispone de `closedBy`**, ni la entrega de
  datos de actor/fecha exacta de entrega; por eso no se inventan nombres
  ni se etiqueta como «manual» algo que pudo cerrarse por tareas aprobadas.
  Se muestra el responsable `assigneeName` de la entrega cuando existe,
  sin atribuirle necesariamente el registro de la entrega.
- Las HH reales **por tarea** no están expuestas en
  `ProjectModuleTask`; se mantienen las HH estimadas por tarea y el
  consumo aprobado `segment.consumedHours` del bloque, sin prorratear
  consumo ni mostrar ceros ficticios por tarea.
- «+ Agregar tarea» desde el panel lleva el `segmentId` concreto,
  y `NewOperationalTaskModal` precarga su equipo y fechas. Desde el
  botón general «+ Agregar tarea» de la fase no se impone ningún bloque.

## Pruebas

Se añadió `SegmentDrawer.test.tsx` con los estados:
- Entrega aprobada y cierre;
- Entrega vencida aun con cierre automático de tareas, CTA y comentario;
- Cierre sin entrega y reapertura;
- Entrega presentada pero aún sin aprobación.

Se amplió `NewOperationalTaskModal.test.tsx` para el bloque precargado
desde el panel.

Comandos PowerShell:

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run src/modules/projects/components/SegmentDrawer.test.tsx src/modules/projects/components/NewOperationalTaskModal.test.tsx src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx
pnpm --filter @kora/web build
```

**Sin migraciones, SQL correctivo ni cambios de backend**.
La ejecución de typecheck, Vitest y build en el entorno del usuario
sigue pendiente.

## Refinamiento: cierre manual y edición superpuesta (05-11-2026)

En el panel lateral se retiró el enlace **«Colaboradores / Forecast»** y
el formulario especial al que conducía, que ya no forma parte del flujo
de esta vista. Los colaboradores registrados siguen visibles en el
desglose del bloque, si los hay.

Se añadió **«Cerrar bloque»** junto a la sección de cierre, donde
antes aparecía el enlace. La acción está disponible únicamente para
quienes pueden gestionar el proyecto, sin entrega vinculada y con al
menos una tarea operativa activa, todas con estado `done` (aprobadas).
El botón se presenta deshabilitado cuando no cumple las reglas, con
explicación visible y atributo `title` para el tooltip:

- Sin tareas: se solicita agregar y aprobar tareas.
- Tareas no aprobadas: se habilita cuando todas estén aprobadas.
- Con entrega vinculada: no se permite cierre manual; la entrega
  requiere presentación y aprobación.

No se deben ofrecer acciones que el backend rechaza. El caso de uso
`UpdateProjectModuleSegmentUseCase` conserva la restricción de
`closingDelivery` y valida solo tareas activas, excluyendo canceladas.
Para que el botón de cierre manual pueda efectivamente llegar a
habilitarse, `refreshSegmentClosure` **deja de crear automáticamente
`closedAt` al aprobar todas las tareas**: conserva cierres anteriores
pero permite que el líder lo registre explícitamente. Si una tarea se
reabre o el bloque se queda sin tareas, se limpia el cierre previo.
Una entrega `approved` mantiene su criterio de cierre por entrega,
independientemente de `closedAt`.

Al pulsar **«Editar bloque»** ya no se invoca `close()` del
`PhaseRoadmap`: el `SegmentDrawer` permanece abierto mientras
`NewWorkBlockModal` se monta como segundo `<dialog>` nativo, encima
del panel. «Cancelar» vuelve a dejar el panel lateral tal como estaba;
«Guardar cambios» actualiza la información y conserva la selección.
No se añadieron overlays manuales ni z-index globales.

Pruebas actualizadas:
- `SegmentDrawer.test.tsx`: cierre deshabilitado por tarea pendiente,
  sin tareas o con entrega, cierre habilitado con tareas aprobadas y
  ausencia del link retirado.
- `ProjectModulesCard.phase-controls.test.tsx`: ambos diálogos
  abiertos a la vez y selección conservada al cancelar.
- `drizzle-project-module.repository.spec.ts`: sin cierre automático
  al aprobar todas las tareas.
- `update-project-module-segment.use-case.spec.ts`: validación de
  cierre manual y protección de entrega aprobable por separado.

Validación local pendiente:

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
pnpm exec turbo run typecheck --filter=@kora/api --force
pnpm --filter @kora/web typecheck
pnpm --filter @kora/api exec vitest run src/modules/projects/infrastructure/persistence/drizzle-project-module.repository.spec.ts src/modules/projects/application/use-cases/update-project-module-segment.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/projects/components/SegmentDrawer.test.tsx src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx
```

**Sin nuevas migraciones ni escritura manual contra PostgreSQL.**
