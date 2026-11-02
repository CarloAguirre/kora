# Auditoría funcional · EDT detallada, Plan_Diario y traspaso a Roadmap

**Fecha:** 2026-11-02  
**Rama:** `feature/calculadora-edt-detallada-zurich`  
**Referencias:** `kora-proyectos-v5.html`, `EDT_Zurich_MJE_Portal(3).xlsx`, `apps/api/src/modules/estimation`, `QuotationPlanningAcceptanceCard`, `project_module_tasks`.

## 1. Decisión y fundamento

El HTML v5 es explícito en `doTraspaso` y `tRoadmap`: tras la aprobación comercial, las actividades de cotización aparecen como **tareas de referencia** en el Roadmap **sin fechas ni asignados**. No se genera `project_module_tasks` ni se toman decisiones de Forecast por adelantado.

El Excel Zurich sí distingue dos granularidades:
- `EDT_Detalle`: WBS, tramo, módulo, submódulo, actividad, roles y HH (45 actividades, 257 HH base).
- `Tramos`: secciones de ejecución y gates.
- `Plan_Diario`: 69 asignaciones distribuidas en 21 días hábiles, 257 HH base en total; 148 Fullstack, 52 UX/UI, 33 QA, 20 Tech Lead y 4 PMO, con capacidad diaria máxima de 8 HH por perfil en esa plantilla.
- `Roadmap_Semanal`: consolidación de cargas paralelas.

Por lo tanto, **sí es útil presentar una simulación diaria comercial**, para comprobar que las semanas propuestas por Gemini son plausibles; **no es correcto convertir cada actividad en una tarea de ejecución al aceptar la EDT**.

La presentación diaria es una extensión solicitada ahora (NO es un componente ya presente en el HTML v5).

## 2. Estado auditado en Kora

- `quotation-reference-edt.contract.ts` v2 guarda `stages`, `modules`, `tasks`, `roleEffort`, `reservePercent` por separado y semanas relativas. Cada actividad puede tener varios perfiles.
- `generate-estimation-poc-proposal.use-case.ts` genera las actividades y HH de Gemini; Kora concilia las sumas, no reestima las HH en el cliente.
- `QuotationPlanningAcceptanceCard.tsx` presenta EDT, tramos, módulos, WBS y HH por perfil, sin fechas comprometidas.
- El traspaso comercial vigente `transferApproved` crea `project_teams` y `project_modules` tras la aprobación de cliente; no inserta `project_module_tasks`. Es el comportamiento deseado para las tareas de referencia.
- `create-project-module-task.use-case.ts` exige `startDate` y `date`; crear tareas ejecutables antes del arranque inventaría una planificación.
- `applyPlanningBaseline` previo persiste en el repositorio por compatibilidad, pero el **caso de uso lo rechaza expresamente**: primero se acepta la propuesta IA, luego se envía/aprueba comercialmente y se traspasa. Cualquier brecha en ese método histórico no demuestra un bug del traspaso vigente.

## 3. Implementación de Plan_Diario referencial

**Sin cambios de BD, API ni entidades ejecutables.**

- Se añadió `apps/web/src/modules/estimation/lib/quotation-reference-daily-plan.ts`: proyecta cada actividad WBS×perfil en días hábiles relativos (5 por semana) dentro de su tramo. Conserva HH originales con centésimos y respeta la capacidad de cada perfil (dedicación de propuesta; máximo 8 HH por persona/día).
- Si la capacidad o duración del tramo no permite repartir el esfuerzo, **no agrega días o colaboradores ficticios**: informa HH pendientes, el motivo y bloquea la exportación.
- Se añadió una sección secundaria plegable «Plan diario de referencia» en `QuotationPlanningAcceptanceCard`, con tabla y exportación `Plan_Diario` CSV para revisión.
- Columnas del CSV equivalentes a Zurich: día hábil relativo, fecha (vacía), tramo, equipo/perfil, actividad ID, actividad cronológica, HH, estado (Referencial), módulo y comentario. No se calculan fechas reales, ni responsables nominales, ni se alteran HH de cotización.
- El desglose es una **secuencia matemática propuesta**, no una planificación formal: NO contempla dependencias, bloqueos, licencias, feriados o calendario nominal de personas; el PM debe validarlo antes de comprometer fechas.
- No se materializan las actividades como `project_module_tasks`, no se modifica Forecast ni se reescribe Roadmap operativo.

## 4. Próxima fase, solo bajo decisión explícita

Si el negocio quiere ejecutar tareas derivadas de la EDT, introducir **otro comando** independiente después del traspaso y definición de fecha real, que exija:
1. Aprobación comercial y baseline previamente traspasado.
2. Calendarización validada por líder (inicio, fecha objetivo, feriados y capacidad real).
3. Mapeo de tareas a equipo/persona, responsable y fechas; revisión de dependencias.
4. Vista previa del diff; validación de HH y duplicados por WBS/versión.
5. Confirmación explícita, transacción, idempotencia y auditoría. **Nunca** recrear ni sobrescribir tareas existentes al recotizar.

Este último comando no está implementado y NO es requisito del flujo visual v5.

## 5. Validación

Ejecutar desde la rama con el remoto local `kora`:

```powershell
git switch feature/calculadora-edt-detallada-zurich
git fetch kora
git pull --ff-only kora feature/calculadora-edt-detallada-zurich

pnpm --filter @kora/contracts build
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run src/modules/estimation/lib/quotation-reference-daily-plan.test.ts src/modules/estimation/components/QuotationPlanningAcceptanceCard.test.tsx
pnpm --filter @kora/web build
```

Comprobar en una versión EDT v2:
- Un WBS con dos perfiles preserva ambas cargas en el plan.
- Coinciden HH base, suma por perfil y suma de actividades, sin añadir reserva técnica.
- Si tramos se solapan, comparten la misma capacidad por perfil/día; el exceso queda advertido.
- No aparece calendario diario para EDT v1 sin tramos.
- No se modifica el proyecto, las tareas operativas, ni se generan fechas y responsables.

**Limitación:** el documento KDM sigue siendo una fuente de demostración. No asumir que una EDT Gemini de ese fixture corresponde al alcance real del proyecto seleccionado.

## 6. Hallazgo para revisión futura

El método histórico `DrizzleQuotationRepository.applyPlanningBaseline` suma perfiles usando solo `task.role` y `task.hours`, mientras EDT v2 acepta `roleEffort` multiperfil. Ese caso de uso hoy está bloqueado y no se usa en el traspaso comercial vigente. No reactivar ni reutilizar ese método sin reconciliar la suma de cada `roleEffort` y cubrirla con pruebas transaccionales.
