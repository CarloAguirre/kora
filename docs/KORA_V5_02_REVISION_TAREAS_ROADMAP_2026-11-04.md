# Kora V5.02 — Revisión de tareas desde el Roadmap

**Rama:** `feature/calculadora-roadmap-diseno-v5-02`
**Fecha:** 2026-11-04

## Diagnóstico del flujo anterior

La API ya tenía el caso de uso `UpdateProjectModuleTaskUseCase`
que reconoce:

- `in_review`: tarea completada por el colaborador y pendiente de revisión.
- `done`: tarea aprobada por el responsable autorizado; suma sus HH
  estimadas al avance operativo del bloque.
- `in_review → in_progress`: devolución/rechazo, con
  `rejectionReason` obligatorio; se registra en la bitácora.

`TeamTasksCard` ya permitía estas acciones, pero
`ProjectModulesCard` (Roadmap principal del Líder PM)
no exponía los botones ni la cola superior del prototipo v5.02.
La campanita solo manejaba solicitudes de datos de reportes; no
avisaba cambios de tareas. Los correos no incluían el flujo de devolución.

## Implementado

### Roadmap principal

- **«Tareas por aprobar (N)»**, entre la barra de herramientas y la
  explicación del cronograma, exclusivamente para quien tiene
  `canManage`.
- Lista derivada directamente de `project.modules[].tasks` con
  `status === 'in_review'` y `cancelledAt === null`. Desaparece sola
  al resolver las tareas; no se persiste una segunda cola que pueda
  quedar desincronizada.
- Acciones «Aprobar» y «Devolver» tanto en cada fila del aviso como
  dentro de la tabla operativa de la fase.
- Se reutiliza `ReviewActionModal` de la vista de equipo. Devolver
  exige motivo; se invoca `useUpdateProjectModuleTask`, con la
  autorización y auditoría existentes del backend.
- `PhaseRoadmap` admite `operationalNotice` opcional; no cambia las
  vistas del portal cliente.

### Campanita y correos

- Se agregaron los tipos persistidos de notificación
  `task_review_requested` y `task_returned` al contrato Zod;
  la columna `notifications.type` es texto, por lo que **no necesita
  migración**.
- Tras `in_progress → in_review` se crea un aviso para el
  **líder del proyecto**, con enlace a la ficha y nombre de tarea.
  La revisión de tareas ya pendientes antes del despliegue se presenta
  igualmente en el Roadmap al cargarlo, pero no se fabrican
  notificaciones históricas.
- Tras `in_review → in_progress` con motivo, se crea un aviso para
  el colaborador asignado y se envía **correo inmediato** por el
  proveedor configurado (Resend o el adaptador de log de desarrollo).
- El envío de correo ocurre después de la transacción de estado y no
  revierte una tarea aprobada/devuelta si el proveedor falla.
  En caso de fallo, la notificación queda sin `emailedAt`, y el
  scheduler existente intenta el **correo de respaldo tras 48 horas
  sin abrirla**.
- Los correos de revisión pendientes también usan ese respaldo de
  48 horas. Una devolución enviada inmediatamente queda marcada con
  `emailedAt` para evitar un segundo correo.
- La campanita consulta cada minuto y al volver a la pestaña.
  Mutaciones del proyecto invalidan también su caché.

### Texto de progreso del bloque

En `SegmentDrawer`, se reemplazó el mensaje sobre HH consumidas
del apartado «Avance» por la **suma de HH estimadas de las tareas
aprobadas**. El apartado muestra así:

`16% real; 46% según el plan a hoy.`
`16 HH en tareas aprobadas.`

No se confunden las HH registradas `segment.consumedHours`
(costos) con las HH aprobadas (avance); la métrica superior
«HH consumidas» sigue disponible.

## Restricciones de seguridad y consistencia

- Solo se envían notificaciones en **transiciones de estado reales**.
- No se duplican avisos cuando se guarda la misma condición.
- `canManage` oculta acciones en el frontend; las autorizaciones
  reales se validan en `UpdateProjectModuleTaskUseCase`.
- Un colaborador asignado no puede autoaprobarse.
- Un rechazo requiere un motivo y persiste en la bitácora.
- No se genera notificación dirigida al mismo actor.
- No se guardan en la base las colas del Roadmap: se obtienen
  de las tareas en estado `in_review`.

## Validación

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

# Regenera dist de paquetes compartidos y ejecuta TypeScript del API
pnpm exec turbo run typecheck --filter=@kora/api --force
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run src/modules/projects/application/use-cases/update-project-module-task.use-case.spec.ts src/modules/projects/infrastructure/services/project-task-review-notifier.spec.ts src/modules/notifications/application/use-cases/send-overdue-notification-emails.use-case.spec.ts

pnpm --filter @kora/web exec vitest run src/modules/projects/components/ProjectModulesCard.phase-controls.test.tsx src/modules/projects/components/SegmentDrawer.test.tsx src/modules/notifications/components/NotificationBell.test.tsx
```

**Sin migraciones nuevas para este cambio.**
La migración 0055 del cierre de bloques implementada anteriormente
continúa siendo requisito independiente si aún no está aplicada.

**Nota:** estos tests están escritos en GitHub; ejecución local
pendiente de confirmación.
