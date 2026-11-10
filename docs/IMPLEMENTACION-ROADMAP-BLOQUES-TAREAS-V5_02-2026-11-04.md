# Roadmap operativo v5.02 — bloques y tareas (2026-11-04)

## Objetivo
Alinear la ficha interna de proyectos con las capturas del prototipo, preservando los estados operativos y la distinción entre referencias comerciales EDT y trabajo real.

## Bloques de trabajo
- La acción **+ Bloque de trabajo**, habilitada en modo Planificar, abre **Nuevo bloque de trabajo** con equipo, nombre, fechas, HH estimadas, capacidad informativa y entrega de cierre.
- Las HH del bloque se almacenan en `project_module_segments.estimated_hours` (migración **0050**). Los bloques antiguos conservan `NULL`; no se rellenan con datos supuestos. No representan horas consumidas y no modifican las HH vendidas.
- El contrato `createProjectModuleSegmentSchema` admite `estimatedHours` opcional por compatibilidad con clientes anteriores. El nuevo formulario exige valor positivo.
- `closingDelivery` es opcional; si se proporciona, el caso de uso crea un registro `project_module_deliveries` con `estimatedDate=endDate` **en la misma transacción** que el bloque. Si no hay entrega, no se inserta ninguna. Sin transición inventada de estado para el bloque.
- La capacidad se calcula con las HH asignadas al equipo y la suma de HH explícitas de otros bloques. Si existen bloques antiguos sin HH, la vista lo advierte; no deduce su esfuerzo.
- El editor existente de bloques conserva la gestión de integrantes y del Forecast e incorpora edición opcional de HH.
- En el lateral la entrega solo se vincula cuando existe coincidencia única de equipo/fecha y bloque; Kora aún no tiene FK entrega–bloque.

## Tareas
- La última columna de la tabla operativa presenta **Editar** y **Eliminar** con iconos. Duplicar permanece dentro del editor.
- **+ Agregar tarea** abre el alta real de tareas de proyecto; no crea referencias EDT simuladas.
- El editor existente mantiene nombre, descripción, responsable, estado, HH y fechas. La duplicación inicia una nueva tarea en estado pendiente.
- El borrado solicita confirmación con **Volver** y **Eliminar tarea**; tras completar el endpoint muestra el toast **Tarea eliminada.**. Se conservan las referencias EDT de la cotización.

## Persistencia y limitaciones
- No se ha alterado `master`, precios, cotizaciones, aprobaciones ni facturación.
- No existe FK tarea–bloque: las tareas operativas guardan su vínculo legible en descripción, preservando el comportamiento actual.
- Las HH consumidas se guardan por módulo, no por bloque; el panel no atribuye horas sin evidencia.
- Las semanas relativas de la cotización no son fechas reales hasta planificar.

## Integración y validación
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm install --frozen-lockfile
pnpm --filter @kora/contracts build
pnpm --filter @kora/core build
pnpm --filter @kora/db build
pnpm --filter @kora/api build
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web build

# SOLO en la base de datos del ambiente elegido, tras respaldo:
pnpm --filter @kora/db migrate
```

Validaciones de regresión: `ProjectModulesCard.phase-controls.test.tsx` y `create-project-module-segment.use-case.spec.ts`, además de los tests completos del monorepo y el CI de GitHub.
