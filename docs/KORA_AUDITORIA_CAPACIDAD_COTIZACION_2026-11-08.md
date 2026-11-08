# Kora 2.0 — Corrección de consistencia de capacidad en cotizaciones

**Fecha:** 8 de noviembre de 2026. **Rama:** `feature/calculadora-roadmap-diseno-v5-02` (PR #7, borrador).

## Auditoría y causa

El proyector IA en `quotation-poc-projection.ts` establecía `hoursPerWeek = HH ÷ semanas ÷ colaboradores` y `dedicationPercent = 100`. El segundo valor es un **supuesto de disponibilidad**, no el porcentaje de ocupación que representan las HH. Tras editar dotación o duración, `hoursPerWeek` persistido podía conservar el valor histórico. Tampoco existía un diagnóstico de picos de fases solapadas.

### Contratos semánticos

- **HH de tareas/EDT:** fuente única del esfuerzo comercial, incluyendo WBS y tareas comerciales nuevas. Al cambiar colaboradores, duración o dedicación, las HH y los precios **NO** se multiplican ni se reducen.
- **Dotación y duración:** decisiones editables de planificación. Unidad semanas o días (5 días equivalentes a una semana de planificación).
- **Carga media HH/sem/persona:** `HH del equipo ÷ (n.º personas × duración en semanas)`. Derivada, no editable cuando existe EDT. Si no hay duración, se muestra `—`.
- **Dedicación planificada %:** disponibilidad reservada al proyecto. Campo editable, 100% inicial; independiente de la ocupación efectiva.
- **Ocupación %:** `carga media por persona ÷ 40 × 100`. Para el modo manual se mantiene su fórmula comercial anterior: `personas × semanas × hh/sem × dedicación/100`; la ocupación manual se calcula usando las HH efectivas de esa fórmula.
- **Jornada de comparación Kora:** 40 HH/sem por persona, como **criterio interno de planificación**, no declaración de la jornada legal aplicable al contrato de cada colaborador. Constante `KORA_QUOTATION_REFERENCE_WEEK_HOURS` centralizada para futura parametrización.
- **Capacidad planificada disponible:** `personas × 40 × dedicación/100` HH por semana.
- **Pico semanal:** distribuir HH dentro de cada tramo según `quotationTeamWeeklyPlan`, sumar fases simultáneas y verificar carga semanal por persona frente a su capacidad planificada. La distribución es *orientativa*, no asignación individual detallada.
- **Alertas informativas, no bloqueantes:** sobrecarga de una o varias semanas, media mayor a la dedicación disponible, duración del equipo inferior a la cantidad de semanas con tareas (no comparar duración con número absoluto de semana, pues una fase puede empezar más tarde), o imposibilidad de verificar picos cuando no existe calendario en EDT v1. No se alteran ni la aprobación ni el guardado.
- El máximo legado de `hoursPerWeek` persistido es 168 por compatibilidad del contrato. Los indicadores muestran el esfuerzo derivado **sin usar ese límite para ocultar sobrecargas**.

## Cambios

1. Nuevo `synchronizeQuotationEdtTeamLoad` en contratos, recalcula la referencia almacenada de `hoursPerWeek` desde asignaciones WBS y duración/dotación actual, sin modificar `aiPoc.edt` ni HH de fases.
2. `reconcilePocCommercialDraft` ya no restaura `hoursPerWeek` antiguo del equipo: normaliza el valor derivado tras los ajustes. El editor también normaliza al editar equipos, incluir un equipo sin tareas o guardar un borrador, sin tocar el modo manual.
3. `QuotationTeamsWorkspace` reutiliza `TextField`, `Select`, `SegmentedControl` y `Badge` del UI kit. Muestra carga EDT readonly, dedicación planificada editable y ocupación calculada, con explicación de la referencia 40 HH; avisos discretos en las filas afectadas y pico por semana.
4. `quotation-team-weekly-plan` incluye ahora tareas `KT-` y fases comerciales `KS-` además de la EDT fuente, evitando falsos informes de capacidad disponible al agregar actividades después de Gemini.
5. La banda de guardado y la revisión IA permanecen como antes. No hay cambios de base de datos, credenciales, motor Gemini ni migraciones.

## Ejemplo de aceptación

100 HH, 3 colaboradores y 1 semana, dedicación 100%:
- carga = 33,33 HH/sem/persona
- ocupación = 83,33% de una jornada de 40 HH
- disponibilidad total = 120 HH; no hay sobrecarga.

Con dedicación 50%, las HH comerciales permanecen en 100, pero la disponibilidad de los tres colaboradores baja a 60 HH/sem; se avisa sobrecarga en la semana 1.

## Regresión incluida

`packages/contracts/src/estimation/quotation-poc-projection.spec.ts`: normalización de dotación/duración sin modificar EDT, preservación de dedicación; no alteración de modo manual.

`apps/web/src/modules/estimation/components/quotation-team-capacity.test.ts`: 100 HH/3 personas, cambios de dotación y dedicación, fases solapadas, duración insuficiente, EDT sin calendario y cálculo manual.

`apps/web/src/modules/estimation/components/quotation-team-weekly-plan.test.ts`: fases solapadas, conservación de centésimos, tareas nuevas comerciales, EDT v1, separación HH/dotación.

`apps/web/src/modules/estimation/components/QuotationTeamsWorkspace.test.tsx`: UI Kora, ocupación derivada, diferenciación de dedicación y advertencia semanal.

## Validación local pendiente

```powershell
cd C:\Users\carlo\Desktop\a\kora2.0
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts typecheck
pnpm --filter @kora/contracts exec vitest run src/estimation/quotation-poc-projection.spec.ts
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/components/quotation-team-capacity.test.ts `
  src/modules/estimation/components/quotation-team-weekly-plan.test.ts `
  src/modules/estimation/components/QuotationTeamsWorkspace.test.tsx
pnpm --filter @kora/web build
```

**Estado:** código publicado, inspeccionado estáticamente. La ejecución de TypeScript, Vitest y build en el entorno local aún debe confirmarse con los logs reales.

### Aclaraciones adicionales

- También en cotizaciones **manuales por fases**, las HH de las fases
  son fuente de verdad: la carga/ocupación es calculada y no editable.
  En modo manual **por equipo** se mantiene el cálculo original mediante
  dotación × duración × hh/sem × dedicación.
- Cambiar unidad de semanas a días (o viceversa) convierte simultáneamente
  la duración para conservar semanas efectivas: **8 semanas ↔ 40 días**.
  No se truncan valores que excedan el máximo histórico del contrato.
- La advertencia de duración compara las semanas **activas con tareas**,
  no el número absoluto de última semana del proyecto; una fase que
  comienza en semana 10 no implica por sí sola 10 semanas de duración.
