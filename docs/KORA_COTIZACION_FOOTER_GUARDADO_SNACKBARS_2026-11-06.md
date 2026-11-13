# Kora · Footer de guardado y snackbars en cotización v5.02

**Rama:** `feature/calculadora-roadmap-diseno-v5-02`. **Fecha:** 2026-11-06.

## Comportamiento
- La calculadora mantiene su mutación real `useSaveQuotationDraft` (misma revisión y validación Zod). No cambia API, contrato ni persistencia.
- El control «Guardar borrador» de la cabecera desaparece. `QuotationDraftSaveBar` es un footer sticky específico de esta página. Aparece sólo si un borrador editable tiene cambios pendientes; permanece visible durante el scroll de la cotización.
- Acción primaria `Guardar ajustes`: componente Kora Button primary (lime), spinner durante `saveDraft.isPending`. Al concluir, el footer desaparece y se muestra `toast.success` nativo con la revisión guardada.
- `Descartar cambios` restaura el estado de `selected` con `fromVersion(selected)` y marca limpio sin enviar nada al servidor. Se ignora la auto-asignación IA para esta revisión si fue explícitamente descartada.
- Errores de validación/cambios y confirmaciones de guardado, importación, envío, aprobación y traspaso se comunican con `useToast`. En el ciclo comercial embebido ya no se duplica el mensaje en el lateral; el guard de acciones sigue informando bloqueos reales al presionar el botón.
- Los diálogos que exigen consentimiento sobre cambios importantes se mantienen: no se puede reemplazar una decisión confirmatoria con un aviso efímero. Tampoco se ocultan advertencias persistentes que explican reglas de negocio (valor HH y distribución referencial).

## Archivos
- `apps/web/src/modules/estimation/pages/QuotationWorkspacePage.tsx`
- `apps/web/src/modules/estimation/pages/QuotationWorkspacePage.module.css`
- `apps/web/src/modules/estimation/components/QuotationDraftSaveBar.tsx` y CSS
- `apps/web/src/modules/estimation/components/QuotationCommercialLifecycleCard.tsx`
- Pruebas puntuales `QuotationDraftSaveBar.test.tsx`,
  `QuotationWorkspacePage.save-bar.test.ts`,
  `QuotationCommercialLifecycleCard.test.tsx`.

## Integración (PowerShell)
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw 'Error typecheck Web' }

pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/components/QuotationDraftSaveBar.test.tsx `
  src/modules/estimation/pages/QuotationWorkspacePage.save-bar.test.ts `
  src/modules/estimation/components/QuotationCommercialLifecycleCard.test.tsx `
  src/modules/estimation/pages/QuotationWorkspacePage.layout.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Error tests de cotización' }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw 'Error build Web' }
```

## Verificación visual recomendada
1. Abrir v2 borrador y editar tarifa, moneda, nombre, equipos, EDT o costos.
2. Comprobar footer inferior mientras se navega por la tabla larga; no debe aparecer el antiguo guardado superior.
3. Descartar: valor visual vuelve a la última revisión persistida y el footer desaparece.
4. Guardar: spinner, notificación Kora de éxito y footer oculto.
5. Intentar enviar/aprobar con datos faltantes: snackbar de error con los bloqueos; no segundo cuadro lateral duplicado.
6. Probar versión sin permisos y otra enviada: no ofrecer footer editable.
7. Verificar en viewport móvil y con 5+ fases que el footer no tape los campos.

**Estado:** commits publicados mediante GitHub; no se ejecutaron pruebas ni build en el equipo del usuario desde este chat. **Sin migraciones ni cambios en master**.
