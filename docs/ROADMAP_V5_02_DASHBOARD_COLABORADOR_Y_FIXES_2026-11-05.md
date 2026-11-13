# Kora v5.02 · Dashboard del colaborador y correcciones visuales (05-11-2026)

## Rama
`feature/calculadora-roadmap-diseno-v5-02`. Este conjunto de cambios no altera `master` ni requiere una migración adicional.

## Error de integración anterior
La migración `0056_hour_entry_task_attribution.sql` se aplicó satisfactoriamente a la base `kora2`. El fallo posterior de compilación era sintáctico: faltaba `{` en las opciones de un `.refine()` en `packages/contracts/src/hours/hour-entry.contract.ts`. Se restauró la sintaxis Zod para desbloquear el build y los specs que lo importaban. **No volver a ejecutar migraciones por esta corrección.**

## Modal de edición
- `EditProjectDialog` utiliza el modo `expandedSide` del `Modal` nativo para ocupar como máximo 1040 px y nunca más del ancho del viewport.
- `PaymentPlanEditor` utiliza consultas de contenedor (`@container`) en vez del ancho global de la ventana, de modo que el plan de pago colapse su grilla cuando el espacio real disponible sea reducido.
- No se alteraron los datos comerciales ni la lógica de persistencia del editor.

## Roadmap
El botón `+ Agregar fase` solo se renderiza cuando un actor autorizado activó **Planificar**; en **Ver** no se muestra. Se actualizó el test de fase correspondiente.

## Dashboard personal del colaborador
- Sustituye la pantalla legada de actividad por saludo, equipo/proyectos, botón de registro de horas, «Mis tareas» y «Mis registros de horas».
- Tareas: pestañas **Por hacer** (`todo` + `in_progress`), **Por aprobar** (`in_review`) y **Aprobadas** (`done`).
- Estados visuales independientes: **En curso**, **Devuelta** y **Vencida** pueden mostrarse a la vez; **Completada** espera aprobación y **Aprobada** indica aprobación efectiva. Los chips llevan punto y colores de referencia.
- `Marcar terminada` envía `in_review`, nunca `done`: la aprobación queda en manos del líder.
- El dashboard usa el actor autenticado para listar exclusivamente sus propios registros de horas.
- La API agrega nombre de bloque, HH estimadas por tarea, HH **aprobadas** y HH **pendientes** con `hour_entries.task_id`, además del líder actual de equipo/proyecto (si existe). No se atribuyen horas sin `task_id` ni se confunden HH estimadas con consumo efectivo.
- La tabla de horas muestra fecha, vínculo proyecto/fase/bloque/tarea, actividad, horas y estado. Los históricos sin tarea siguen mostrando su proyecto/fase/bloque cuando estén vinculados, pero no se inventa un enlace a la tarea.

## Validación local pendiente
GitHub contiene los cambios y tests de regresión `CollaboratorDashboard.test.tsx` y `ProjectModulesCard.phase-controls.test.tsx`, pero la ejecución local es responsabilidad del entorno Windows con dependencias y base de desarrollo. No afirmar PASS sin ejecutar.

Desde PowerShell, raíz del monorepo:

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts build
pnpm exec turbo run typecheck --filter=@kora/api --force
pnpm --filter @kora/web typecheck

pnpm --filter @kora/web exec vitest run src/modules/dashboard/components/CollaboratorDashboard.test.tsx src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx src/modules/projects/components/EditProjectDialog.test.tsx
pnpm --filter @kora/api exec vitest run src/modules/hours/application/use-cases/create-hour-entry.use-case.spec.ts src/modules/hours/application/use-cases/update-hour-entry.use-case.spec.ts
```

Verificar visualmente a resolución desktop y móvil: sin scroll horizontal en edición, botón de fase solo en Planificar, conteos/estados reales por colaborador y registros de horas sin imputaciones ficticias.
