# Kora v6 · Confirmación al completar una tarea (2026-11-05)

## Solicitud y referencia

El prototipo `kora-proyectos-v6.html` muestra un modal «Completar tarea»
al pulsar «Marcar completada» en el dashboard del colaborador.
Informa HH registradas versus HH estimadas y ofrece dos acciones:
«Registrar horas y completar» y «Completar tarea». Su cierre cancela la acción.

## Implementación

- `CollaboratorDashboard`: confirma SIEMPRE antes de enviar a `in_review`.
  Calcula horas registradas como **aprobadas + pendientes** para el propio
  `DashboardMyTask`. No inventa HH a partir de la aprobación de la tarea.
  Si faltan HH y el actor puede registrarlas, presenta ambas acciones;
  de otro modo, permite completar directamente. Usa los componentes
  compartidos `Modal` y `Button`.
- «Completar tarea» utiliza la mutación preexistente
  `useUpdateProjectModuleTask` con `{ status: 'in_review' }`.
  La aprobación final sigue siendo exclusiva del líder. El modal solo se
  cierra automáticamente cuando la mutación confirma éxito; si falla,
  permanece abierto y el colaborador ve el error.
- «Registrar horas y completar»: `DashboardPage` abre
  `HourEntryFormDialog` con `initialTask` y el modo de registro diario.
  El formulario diario empieza con proyecto, fase, tarea y actividad
  preseleccionados. El segmento se obtiene de `/projects/:id/phases`
  por el **ID persistido de la tarea**, no por coincidencia de nombres.
- El validador `matchesTaskHourTarget` bloquea el guardado si la tarea
  ya no está asignada, se canceló o si el usuario cambió proyecto, fase,
  segmento, tarea o agregó múltiples entradas. El backend conserva sus
  propias validaciones. Los registros desde el botón normal «Registrar
  horas» y las ediciones existentes no cambian.
- Sólo tras `onSuccess` del alta se envía el cambio de estado de la tarea.
  Si se cancela, falla la validación o falla la creación del registro,
  **no se cambia el estado**. Si las HH se guardaron pero falla actualizar
  la tarea, se muestra explícitamente que las horas **sí** quedaron
  registradas; el colaborador puede reintentar completar la tarea.
- La operación no es una transacción atómica entre recursos (HTTP de
  horas y tareas), por lo que se comunica correctamente el éxito parcial.

## Archivos específicos

- `apps/web/src/modules/dashboard/components/CollaboratorDashboard.tsx`
- `apps/web/src/modules/dashboard/components/CollaboratorDashboard.module.css`
- `apps/web/src/modules/dashboard/pages/DashboardPage.tsx`
- `apps/web/src/modules/hours/components/HourEntryFormDialog.tsx`
- `apps/web/src/modules/hours/components/DailyEntryForm.tsx`

No se tocaron contratos, API, base de datos ni migraciones.

## Pruebas

- `CollaboratorDashboard.test.tsx`: cancelar no cambia nada;
  completar directamente envía a revisión sólo tras confirmar;
  abrir registro sólo solicita preselección, no muta; no permite
  finalizar si falla; oculta registro adicional si las HH ya alcanzaron
  la estimación.
- `DashboardPage.completion.test.tsx`: secuencia de alta -> tarea,
  cancelación, registro normal y error parcial.
- `HourEntryFormDialog.scroll.test.tsx`: preselección sin tab semanal.
- `DailyEntryForm.segment-validation.test.ts`: correspondencia exacta
  por proyecto/módulo/segmento/tarea/usuario y tarea no cancelada.

## Integración y validación (PowerShell)

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Falló typecheck" }

pnpm --filter @kora/web exec vitest run src/modules/dashboard/components/CollaboratorDashboard.test.tsx src/modules/dashboard/pages/DashboardPage.completion.test.tsx src/modules/hours/components/HourEntryFormDialog.scroll.test.tsx src/modules/hours/components/DailyEntryForm.segment-validation.test.ts
if ($LASTEXITCODE -ne 0) { throw "Fallaron pruebas del flujo" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Falló build Web" }
```

## Verificación manual

1. Tarea en curso con 6 de 20 HH: pulsar «Marcar completada».
   Verificar mensaje, dos botones y cierre X.
2. Cerrar con X: permanece `in_progress`.
3. «Completar tarea»: cambia a `in_review`, nunca a `done`.
4. «Registrar horas y completar»: proyecto/fase/tarea preseleccionados;
   ingresar fecha permitida, HH y detalles; guardar. Confirmar
   entrada de HH creada y tarea enviada a `in_review`.
5. Cancelar registro: no cambia la tarea.
6. Si el registro falla, no completar. Si falla sólo la actualización
   de la tarea, avisar del registro exitoso sin mentir sobre el estado.
7. Probar tarea con todas las HH registradas, sin estimación, o devuelta;
   contrastar que se muestra el contenido pertinente.
8. Comprobar que «Registrar horas» normal, registro semanal, edición
   y paneles Líder/PMO permanecen intactos.

**Estado:** cambios confirmados en GitHub. Typecheck, Vitest y
comprobación visual local pendientes.
