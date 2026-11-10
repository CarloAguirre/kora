# R4-d · Asistente IA de cinco etapas conforme a la maqueta Kora v5

**Fecha:** 2026-11-02  
**Rama:** `feature/calculadora/carlo`  
**Estado:** implementado y publicado en GitHub; pruebas locales y build pendientes.

## Motivo del ajuste

El flujo anterior de `+ Nueva cotización → Con el agente IA` abría `EstimationWorkspacePage`, que mostraba cinco títulos decorativos y un cuestionario fijo/dinámico con una pregunta por pantalla. **No correspondía a las funciones `startIA`, `iaRender`, `iaNext` e `iaGenerar` del HTML `kora-proyectos-v5.html`.**

El flujo nuevo conserva el lenguaje de diseño Kora (`Modal`, `Button`, `TextField` y clases ya existentes de `NewEstimationModal.module.css`), pero reproduce la distribución funcional y orden del prototipo.

## Nuevo recorrido

El tab `Cotizaciones` mantiene la selección de **Agente IA / En blanco / Copiar otra cotización**. Seleccionar agente IA y pulsar **Continuar** abre `AiQuotationWizardModal`, **sin navegar** a `EstimationWorkspacePage`.

1. **Análisis.** Muestra claramente `Requerimiento_KDM.pdf` como única fuente de demostración (no acceso real al Drive del proyecto), admite indicaciones adicionales y ofrece **Analizar proyecto**. Solo al pulsarlo se llama a `POST /estimations/poc/analyze` con Gemini. No hay tiempos ni etapas artificiales de progreso: se muestra un estado real de carga. Si el proveedor devuelve `poc-ai` o falla, el flujo no avanza ni finge análisis Gemini.
2. **Entendimiento.** Tras el análisis real, muestra el resumen del proyecto en un textarea editable. **Está correcto** valida el texto y deja avanzar; los cambios del usuario se envían como `confirmedUnderstanding`.
3. **Condiciones.** Agrupa **F01–F05** en una única pantalla. F01 es alcance, F02 usa opciones **Sin restricción / Fecha objetivo / N semanas** (más texto libre cuando existe un plazo prellenado), F03 propone el equipo ideal y deja deshabilitadas opciones de disponibilidad no construidas, F04 permite múltiples selecciones con «Ninguna» exclusiva, F05 recoge contexto opcional. Las condiciones opcionalmente prellenadas están citadas desde KDM y permanecen editables. Se exige F01–F04.
4. **Aclaraciones.** Agrupa hasta cinco preguntas dinámicas generadas por Gemini; muestra motivos, opciones y referencias documentales. «No lo sé / dejar como supuesto» usa un supuesto explícito del modelo o la formulación prudente «pendiente de confirmar»; esa respuesta se registra con `usedAssumption=true` y valor `null`, no se presenta como decisión confirmada. Si no hay preguntas, la etapa se muestra vacía con explicación.
5. **Confirmación.** Presenta el entendimiento corregido, todas las respuestas, los supuestos y los puntos pendientes. Solo **Generar estimación** invoca `POST /estimations/projects/:projectId/quotation/versions/ai-poc`, que calcula roles/HH, genera EDT, valida y **persiste** una versión PostgreSQL. En caso de éxito navega al editor de esa versión. En caso de error permanece en Confirmación, preservando respuestas.

**Atrás** mantiene el estado de las respuestas. No se crea ninguna versión comercial ni se ejecuta IA de generación final por abrir el modal o avanzar entre etapas.

## Contrato y persistencia del resumen confirmado

`generateAiDemoQuotationSchema` añade el campo opcional `confirmedUnderstanding` (20–4000 caracteres), compatible con clientes de pruebas existentes que aún no lo envían.

- El servidor lo incluye como contexto humano confirmado en `GenerateEstimationPocProposalUseCase.execute` y también en `generateEdt`.
- El snapshot `quotation_versions.draft.aiPoc.confirmedUnderstanding` conserva el contenido aprobado por el usuario.
- La función `validatePocDraftIntegrity` impide sustituir el entendimiento guardado desde un PATCH del navegador.
- Se reutilizan los contratos, auditoría y transacciones comerciales de R4-c. **Sin migración adicional**, pues `aiPoc` reside en el JSONB de la versión.

## Prellenado fiel a la evidencia

`AnalyzeEstimationPocUseCase` pide a Gemini `fixedPrefills` opcionales solamente para **F01, F02 y F04**, con `sourceId` conocido y valor compatible con las opciones reales. El backend valida fuente, tipo, catálogo, exclusividad de `none` y duplicados antes de devolverlo. Rechaza prellenados no fundamentados o inválidos sin fabricar una respuesta.

El frontend muestra la fuente y permite reemplazar el valor. **F03 no se prellena**, porque la disponibilidad de equipos no puede deducirse de un PDF. La selección «equipo ideal» continúa siendo la única opción soportada en la prueba.

## Límite comercial y de simulación

El modelo Gemini debe ser real y estar configurado. La **única simulación** es la fuente documental KDM, que sustituye temporalmente Drive. No se generan datos en JavaScript ni se presenta el documento KDM como documentación de Motor de notificaciones u otro prospecto.

La versión resultante sigue siendo **borrador**. La aceptación técnica del baseline se mantiene en el editor y exige la operación explícita de Gerencia con las condiciones transaccionales de R4-c. El envío al cliente, la aprobación contractual, la facturación y la recotización de proyectos con horas ejecutadas permanecen fuera de alcance.

La ruta histórica `EstimationWorkspacePage` se mantiene para el módulo Calculadora; ya no se usa al crear una cotización IA desde el tab del proyecto. Las modalidades `En blanco` y `Copiar` siguen conectadas al editor existente.

## Archivos relevantes

- `apps/web/src/modules/estimation/components/AiQuotationWizardModal.tsx` y `.module.css`
- `apps/web/src/modules/estimation/components/NewProjectQuotationModal.tsx`
- `packages/contracts/src/estimation/estimation.contract.ts`
- `packages/contracts/src/estimation/quotation.contract.ts`
- `apps/api/src/modules/estimation/application/use-cases/analyze-estimation-poc.use-case.ts`
- `apps/api/src/modules/estimation/application/use-cases/generate-estimation-poc-proposal.use-case.ts`
- `apps/api/src/modules/estimation/presentation/quotation.controller.ts`
- `apps/api/src/modules/estimation/application/use-cases/manage-quotation-drafts.use-case.ts`
- `apps/api/src/modules/estimation/infrastructure/persistence/drizzle-quotation.repository.ts`

## QA automatizado agregado/actualizado

- `AiQuotationWizardModal.test.tsx`: análisis disparado manualmente, cinco etapas, validación agrupada, prellenado, navegación atrás, supuestos, pantalla de confirmación, único envío al final, navegación al editor, errores de Gemini.
- `NewProjectQuotationModal.test.tsx`: la selección Agente IA abre el modal, no salta a la ruta PoC.
- `analyze-estimation-poc.use-case.spec.ts`: respuestas prellenadas con referencia documental; no acepta IDs ajenos ni opciones contradictorias.
- `quotation.controller-ai-poc.spec.ts`: la corrección del entendimiento llega a ambos pasos Gemini y al guardado.

Ejecutar desde la raíz del monorepo:

```powershell
git switch feature/calculadora/carlo
git status --short
git fetch kora
git pull --ff-only kora feature/calculadora/carlo
git rev-parse --short HEAD

pnpm install --frozen-lockfile
pnpm --filter @kora/contracts build
pnpm --filter @kora/db build
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run src/modules/estimation/application/use-cases/analyze-estimation-poc.use-case.spec.ts src/modules/estimation/presentation/quotation.controller-ai-poc.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/AiQuotationWizardModal.test.tsx src/modules/estimation/components/NewProjectQuotationModal.test.tsx src/modules/estimation/pages/EstimationWorkspacePage.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
```

En QA manual, probar también con un proyecto Prospecto en estado No iniciado, cero HH operativas, abriendo `Cotizaciones → + Nueva cotización → Agente IA`. Validar visualmente que el modal y la navegación **se parecen funcionalmente a v5 pero usan los estilos Kora**, que las respuestas y la corrección del entendimiento permanecen al retroceder, que solo se crea una versión después de Confirmación y que se accede a ella por el editor del proyecto. Confirmar que el origen KDM queda indicado como demostración.

**No ejecutar pruebas de materialización operativa con el fixture KDM sobre proyectos reales o producción.** GitHub no ejecuta los comandos locales de pnpm ni valida interacciones de navegador por sí solo.
