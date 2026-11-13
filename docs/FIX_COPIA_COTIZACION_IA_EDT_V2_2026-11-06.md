# Kora · Fix de origen: copia de cotización IA conserva EDT y referencias WBS

Fecha: 2026-11-06
Rama: `feature/calculadora-roadmap-diseno-v5-02`
Alcance: versiones nuevas creadas después del fix. Sin migraciones y sin reescritura de cotizaciones históricas.

## Problema
Al generar v2 a partir de v1 IA Drive, `DrizzleQuotationRepository.createVersionInternal`
descartaba `aiPoc`, `sourceRefs`, `answers` y todas las capas
`edt*`. La copia conservaba `teams` y `phases`, pero perdía la EDT
y sus referencias de tareas WBS. Al transferir v2, el endpoint
`/quotation/applied-plan` ya no podía derivar esas tareas.

## Fix
- `domain/copy-quotation-draft.ts`: copia comercial dentro del **mismo proyecto**
  con fuente real Gemini/Drive y EDT validada conserva `aiPoc.edt`,
  `edtHourAdjustments`, `edtTaskSettings`, `edtTaskNames`,
  `edtCommercialTasks`, `edtStageSettings`, `edtRoleCollaborators`,
  `sourceRefs`, respuestas y marca de conciliación. La fuente original no se muta.
- `infrastructure/persistence/drizzle-quotation.repository.ts`:
  `createVersionInternal()` utiliza el helper al recibir `sourceVersionId`.
  La versión nueva mantiene `origin = 'copy'`: no se simula
  otra llamada Gemini ni se marca una aceptación IA que no ocurrió.
- Para copias **entre proyectos**, manuales o provenientes de un fixture KDM,
  los artefactos IA no se heredan: se conserva el aislamiento anterior.
- `quotation-commercial-eligibility.ts` y `quotation-commercial-preflight.ts`:
  las copias con EDT real deben tener HH conciliadas antes de aprobarse,
  enviarse o traspasarse. No se permite presentar HH diferentes a las tareas
  sin la revisión comercial correspondiente.
- `domain/copy-quotation-draft.spec.ts`: regresión v1 IA → v2 copia
  → tareas WBS visibles en fases del Roadmap; copia v2 → v3; inmutabilidad;
  copia cruzada; KDM demo; estados conciliados/no conciliados.

## Qué significa «tareas traspasadas»
El flujo ya existente de Kora expone las actividades como **referencias EDT**
en el Roadmap aplicado (incluidas en el contador). No se insertan de inmediato
en `project_module_tasks`: la materialización requiere fechas/responsables
operativos reales y se hace desde el Roadmap. Así no se inventan fechas.

Este cambio corrige **la pérdida de la EDT al crear la copia**, para que el
endpoint `/quotation/applied-plan` pueda proyectar esas tareas desde la
propia v2 y no depender de la recuperación histórica de v1.

## Validación local PowerShell
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts build
if ($LASTEXITCODE -ne 0) { throw "Error contratos" }

pnpm --filter @kora/api typecheck
if ($LASTEXITCODE -ne 0) { throw "Error tipos API" }

pnpm --filter @kora/api exec vitest run `
  src/modules/estimation/domain/copy-quotation-draft.spec.ts `
  src/modules/estimation/domain/quotation-transfer-references.spec.ts `
  src/modules/estimation/domain/quotation-commercial-eligibility.spec.ts `
  src/modules/estimation/domain/quotation-commercial-preflight.spec.ts
if ($LASTEXITCODE -ne 0) { throw "Error pruebas cotización" }

pnpm --filter @kora/api build
if ($LASTEXITCODE -ne 0) { throw "Error build API" }
```

En QA o local con proyecto nuevo y sin traspaso:
1. Crear cotización IA desde documentación real de Google Drive.
2. Completar la propuesta y confirmar la EDT.
3. Crear v2 **copiando** v1 y comprobar que su editor mantiene las
   tareas WBS, roles, totales y cualquier ajuste comercial.
4. Aprobar v2 y transferirla una sola vez con el proyecto sin ejecución.
5. Verificar `GET /api/estimations/projects/:projectId/quotation/applied-plan`:
   debe contener `modules[].tasks` con las actividades originales.
6. Verificar visualmente el contador de tareas de referencia en el Roadmap.
7. Editar HH comerciales sin conciliar: el backend debe impedir la aprobación.
8. Copia entre proyectos: no heredar documentación ni EDT de otro cliente.

**Nota**: los cambios se hicieron vía conector GitHub. No se ha ejecutado
TypeScript/Vitest/build en la máquina local desde este chat; deben confirmarse
con los comandos anteriores.
