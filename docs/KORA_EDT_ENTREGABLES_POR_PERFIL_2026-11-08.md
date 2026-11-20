# Kora — Entregables específicos por perfil dentro de la EDT

**Fecha:** 2026-11-08  
**Rama:** `feature/calculadora-roadmap-diseno-v5-02` (PR #7, draft)

## Hallazgo y solución

La EDT v2 guarda un objetivo compartido por actividad WBS y las HH por
cruce WBS×perfil. Antes, al desplegar una actividad que involucraba dos
equipos, ambos recibían exactamente `activity.name` y
`activity.description`. Esto era válido aritméticamente pero incorrecto
para entregar instrucciones operativas, por ejemplo Desarrollo ejecutando
una descripción exclusiva de UX/UI.

**Nueva estructura sin modificar el flujo:** `roleHours` añade
`taskName` y `taskDescription` específicos del perfil. El modelo de
Gemini debe llenar ambos para cada perfil; el backend verifica que no
estén vacíos y, si comparten WBS, que los títulos y descripciones no sean
idénticos. No se genera una segunda solicitud salvo la política previa
`KORA_GEMINI_EDT_MAX_ATTEMPTS=2` ya habilitada por quien administre la
instalación.

`activities` sigue describiendo el objetivo compartido y
`roleHours.hours` conserva el esfuerzo por perfil. Los nombres y
descripciones específicos viajan hasta la grilla comercial y hasta las
referencias para registrar tareas operativas, **sin duplicar HH**.

La respuesta también se rechaza si se repite nombre y ventana de una
etapa con distinto código, o si dos WBS de un mismo módulo/tramo tienen
exactamente el mismo título y descripción normalizados. No se
rechazan tareas por parecidos semánticos subjetivos ni se intenta
reescribir evidencia Gemini en segundo plano.

## Ejemplo de una actividad compartida

```text
WBS STG-01.01: Implementación de interfaz de usuarios (64 HH)
  UX/UI       24 HH · Diseñar flujos, pantallas y prototipo Figma
                    Entregar prototipo navegable y especificaciones
  Desarrollo  40 HH · Implementar interfaz conectada a la API
                    Programar componentes, validaciones e integración
```

Una sola WBS y dos instrucciones claras, con 64 HH en total.

## Compatibilidad y controles

- El contrato persistido mantiene `taskName` y `taskDescription`
  **opcionales**, de manera que las EDT anteriores siguen siendo
  recuperables sin migraciones; en registros históricos sin ellos se
  conserva `activity.name` / `activity.description`.
- La evidencia `aiPoc.edt` es inmutable después de guardarse.
- Renombrar una tarea desde la grilla crea un ajuste comercial por
  `WBS×perfil`; el antiguo ajuste global por WBS continúa vigente para
  registros heredados.
- El traspaso conserva WBS, rol, equipo, HH y las referencias; la
  creación posterior de una tarea operativa sigue requiriendo revisión
  humana.
- Las fases simultáneas, el dimensionamiento de capacidad, la supervisión
  TL y la cuota de Gemini no cambian.
- Sin cambios de UI/flujo, endpoints, SQL ni migraciones.

## Pruebas añadidas

- Generador: schema e instrucciones, conservación de HH, rechazo de
  instrucciones repetidas entre perfiles, ausencia de entregable, fases
  duplicadas y WBS semánticamente idénticos.
- Contratos: dos tareas bajo WBS compartido y renombrado específico sin
  mutar la evidencia.
- Frontend: tareas de perfiles diferentes con nombre y descripción
  propios en una misma actividad.
- Traspaso: UX/UI y Desarrollo reciben instrucciones diferentes, las
  HH siguen sumando 64 y WBS mantiene trazabilidad.

## Integración y verificación

```powershell
cd C:\Users\carlo\Desktop\a\kora2.0
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02
git rev-parse --short HEAD

pnpm --filter @kora/contracts typecheck
pnpm --filter @kora/contracts exec vitest run src/estimation/quotation-edt-task-planning.spec.ts
pnpm --filter @kora/api typecheck
pnpm --filter @kora/api exec vitest run `
  src/modules/estimation/application/use-cases/generate-estimation-poc-proposal.use-case.spec.ts `
  src/modules/estimation/domain/quotation-transfer-references.spec.ts
pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/QuotationPhaseWorkspace.test.tsx
pnpm --filter @kora/api build
pnpm --filter @kora/web build
```

La ejecución de tests de la rama debe confirmarse con GitHub Actions y/o
el checkout local. No se publican datos de producción de las cotizaciones.
