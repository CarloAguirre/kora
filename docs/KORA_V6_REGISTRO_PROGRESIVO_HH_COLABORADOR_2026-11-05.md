# Kora v6 · Registro progresivo de horas por tarea
Fecha: 2026-11-05

## Objetivo
Fidelizar el modal **Registrar horas** al prototipo `kora-proyectos-v6.html`:
- Cabecera «Registrar horas», total y pestañas Diario / Semanal.
- Asignación y Proyecto en la misma fila.
- Panel azul «Vincula estas horas al plan»: al principio sólo Fase;
  al elegirla aparecen Fase, Bloque de trabajo y Tarea alineados.
- Nombre del líder real del bloque cuando está disponible.
- Mostrar tareas propias del usuario, no canceladas y asociadas al bloque.
- Selección **Otro trabajo del bloque** para trabajo que no corresponde a una tarea concreta.
- Al elegir una tarea, autocompletar **Actividad**. La descripción es opcional si se vinculó una tarea.
- Registrar N jornadas/entradas independientes: una tarea de 10 HH puede acumular 2 + 3 + 5 HH a lo largo de distintos días.
- HH pendientes de aprobación y HH aprobadas separadas en el formulario y en Roadmap.

## Diseño y componentes
- `apps/web/src/modules/hours/components/ProjectHourPlanFields.tsx`:
  componente compartido por alta diaria y semanal, con layout adaptativo y estado de tarea.
- `hour-task-selection.ts`: regla pura de «Otro» (no es FK), formato de horas
  y actividad al cambiar tarea.
- `DailyEntryForm.tsx` y `WeeklyEntryForm.tsx`: reutilizan el selector y guardan
  `moduleId`, `segmentId`, `taskId` válido y `category` como actividad.
- `HourEntryFormDialog.tsx`: edición de registros antiguos preservada;
  `taskId` nulo se representa como «Otro» para evitar vinculación falsa.
- `HourEntryFormDialog.module.css`: panel azul, grilla de tres columnas para
  desktop y adaptación a pantallas pequeñas.
- Al cambiar Proyecto / Fase / Bloque se limpia el vínculo dependiente, sin
  dejar una actividad auto-generada que pertenezca a otra tarea.

## API y consistencia
- `GET /projects/:id/phases` agrega HH **estimadas, aprobadas y pendientes**
  por tarea, así como el líder del equipo del segmento.
- `DrizzleProjectModuleRepository` agrega horas por FK `hour_entries.task_id`
  y estatus de hora, mediante agregaciones en lote:
  - `approved` → `actualHours`
  - `pending` → `pendingHours`
  - `rejected` → no se computa como ninguna de las anteriores.
- En `ProjectModulesCard`, `HH est. / reales` sigue siendo la suma de HH
  **aprobadas** de la tarea; las pendientes aparecen debajo como «N HH por aprobar».
- Las mutaciones de horas invalidan automáticamente cache de horas, proyectos,
  dashboard y notificaciones. La aprobación de horas recalcula consumos.
- **No modificar por estas horas el % de avance operativo**: depende de
  completitud y aprobación de tareas/cierre del bloque, no de HH consumidas.
- Validación del backend existente impide atribuir registros a tareas de otra
  persona, otro bloque o canceladas.
- Horas históricas sin `task_id` se mantienen sin atribución; no se inventan
  asociaciones ni se modifican saldos anteriores.

## Migraciones
No hay una migración nueva en este hito: se reutiliza la relación opcional
`hour_entries.task_id` creada en la migración `0056` anterior.
Requiere que la BD DEV ya tenga aquella migración aplicada.

## Pruebas incorporadas y ampliadas
- `ProjectHourPlanFields.test.tsx`: progresión de 1 a 3 campos, líder,
  HH estimadas/aprobadas/pendientes, opción Otro sin FK.
- `DailyEntryForm.segment-validation.test.ts`: tarea u Otro seleccionados
  deliberadamente y validación sin bloquear HH generales.
- `ProjectModulesCard.phase-controls.test.tsx`: progreso real aprobado y HH
  pendientes separadas por tarea.
- `list-project-phases.use-case.spec.ts`: respuesta autorizada y ausencia
  de HH reales ficticias.

## Integración y validación PowerShell
Desde la raíz del monorepo, con cambios locales propios resguardados:
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts build
if ($LASTEXITCODE -ne 0) { throw "Contratos fallaron" }

pnpm exec turbo run typecheck --filter=@kora/api --force
if ($LASTEXITCODE -ne 0) { throw "API typecheck falló" }
pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Web typecheck falló" }

pnpm --filter @kora/api exec vitest run src/modules/projects/application/use-cases/list-project-phases.use-case.spec.ts src/modules/hours/application/use-cases/create-hour-entry.use-case.spec.ts src/modules/hours/application/use-cases/approve-hour-entry.use-case.spec.ts
if ($LASTEXITCODE -ne 0) { throw "Pruebas API fallaron" }

pnpm --filter @kora/web exec vitest run src/modules/hours/components/ProjectHourPlanFields.test.tsx src/modules/hours/components/DailyEntryForm.segment-validation.test.ts src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Pruebas Web fallaron" }

pnpm --filter @kora/api build
pnpm --filter @kora/web build
```

## Validación funcional manual
1. Como colaborador con tarea de 10 HH: Registrar horas → Proyecto → Fase → Bloque → Tarea. Verificar actividad precargada y resumen HH.
2. Guardar 2 HH un día y 3 HH otro día para la misma tarea.
3. Antes de aprobar: se ven 5 HH en revisión, pero **no** 5 HH reales.
4. El líder aprueba ambos registros: 5 HH reales en la tarea y en el Roadmap; 0 en revisión.
5. Elegir «Otro»: registro válido sin task_id, con Actividad escrita manualmente.
6. Cambiar de fase/bloque: ninguna tarea incompatible ni actividad autocompletada ajena permanece.
7. Repetir en registro semanal y probar editar un registro histórico sin task_id.

**Estado**: cambios publicados en GitHub en rama feature. Ejecución local de pruebas/build pendiente; no marcar PASS sin verificar. No integrar a master automáticamente.
