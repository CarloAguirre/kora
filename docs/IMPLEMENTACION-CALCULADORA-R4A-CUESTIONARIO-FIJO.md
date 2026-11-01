# R4-a — Cuestionario fijo F01–F05 antes de propuesta IA/PoC

**Fecha:** 2026-11-01 · **Rama:** `feature/calculadora/carlo` · **Estado:** commits publicados, pruebas locales pendientes.

## Problema corregido

La pantalla `EstimationWorkspacePage` ejecutaba automáticamente `POST /estimations/poc/proposal` al entrar al proyecto, usando `answers: []`, aunque los contratos y la definición F01–F05 ya existían. Eso omitía la confirmación humana del alcance, plazo, equipo y postproducción.

R4-a **elimina el disparo automático** y añade el cuestionario de cinco preguntas fijas **antes** de llamar al proveedor. Se reutiliza el componente existente `EstimationQuestionnaireForm`, ahora presentado secuencialmente. No hay migraciones ni cambios a `quotation_versions`, módulos, tareas ni HH vendidas/consumidas.

## Flujo usuario

1. Abrir `Calculadora → Nueva estimación` en modo IA con URL de carpeta Drive.
2. La pantalla solicita `GET /api/estimations/questionnaire-definition` (se conserva la definición original del backend).
3. Contestar F01–F04 (obligatorias) y F05 opcional:
   - F01: nivel de entrega (PoC, MVP, fase específica, solución completa, evolutivo).
   - F02: fecha/duración objetivo, texto breve.
   - F03: equipo ideal, disponibilidad Kora, comparación o perfiles específicos.
   - F04: UAT, estabilización, marcha blanca, soporte o ninguna; «Ninguna» es exclusiva.
   - F05: condiciones y exclusiones adicionales.
4. El formulario muestra un paso por vez, permite **Anterior** y **Siguiente pregunta**, valida respuesta requerida y conserva los valores al volver.
5. Solo al pulsar **Generar estimación final** tras completar preguntas se hace `POST /api/estimations/poc/proposal-answered` con la lista de `{questionId, value, usedAssumption}`.
6. La respuesta del proveedor produce el resumen de roles, dedicaciones y HH que calcula Kora, sin determinar tarifas ni persistir una cotización.

**Sin Drive URL:** no se solicita propuesta. **Si falla el cuestionario:** no se solicita propuesta. **Si falla el proveedor:** aparece el error y las respuestas permanecen disponibles para reintento.

## Validación reforzada en servidor

Nuevo endpoint `POST /api/estimations/poc/proposal-answered`, protegido con `projects:manage`. Valida:

- Que F01–F04 tengan respuesta; F05 es opcional.
- Que cada `questionId` sea una de las preguntas fijas definidas por la API.
- Que no existan respuestas duplicadas.
- Que opciones single/multi pertenezcan a sus catálogos; tipos de texto/número/fecha/confirmación válidos.
- Que `none` no conviva con otras opciones de postproducción.
- Que `usedAssumption` no omita una respuesta obligatoria si esa pregunta no ofrece un supuesto explícito. F05 sí conserva el supuesto opcional de la definición.

El endpoint anterior `/poc/proposal` **se conserva por compatibilidad con la PoC previa** y no recibe este nuevo requisito de respuestas: no afirmar que se eliminó toda ruta de generación sin cuestionario. La nueva pantalla usa exclusivamente `/poc/proposal-answered`.

La respuesta de `/poc/proposal-answered` es todavía `EstimationPocProposal` (roles/HH). **No** produce una versión comercial, EDT granular, requerimientos ni historias de usuario.

## Corrección de integridad de fuentes

Hasta este corte, si Drive no estaba configurado, `GoogleDriveDocumentSourceReader` devolvía **Requerimiento_KDM.pdf** para cualquier carpeta solicitada, lo que permitía estimar un proyecto usando el documento de otro proyecto sin advertencia.

Ahora:

- El fallback KDM solo se permite cuando la URL contiene la carpeta de demostración exacta `kora-poc-fallback`.
- Cualquier carpeta distinta con Drive no configurado falla con un error explícito; **nunca reemplaza documentación real por KDM**.
- La propuesta proveniente de ese fixture se marca `sourceMode: poc_simulated`, incluso si el proveedor que procesa el documento es Gemini. Debe distinguirse entre **modelo real** y **fuente de demostración**.
- Si el proveedor de IA es el simulado `poc-ai`, sigue sin procesar documentos reales y se identifica como PoC.
- El mecanismo de lectura de Drive real mantiene el comportamiento previo cuando está correctamente configurado.

## Lo que NO está implementado (R4-b/R4-c)

- `/poc/analyze` todavía **no lee documentos Drive reales**; sus preguntas dinámicas no pueden anunciarse como basadas en evidencia documental. Por eso en R4-a el flujo solo solicita preguntas fijas y muestra una advertencia clara.
- Falta el paso formal de selección de preguntas dinámicas (máximo 5+2), con evidencia, prellenado y dependencias.
- Falta persistencia de las respuestas, trazabilidad de la lectura documental, aceptación humana de propuesta IA y conversión del análisis real en una versión de cotización con EDT.
- Drive sigue dependiendo de las credenciales configuradas en el backend (la delegación OAuth personal de D03 está pendiente).
- No se habilitan los estados comerciales `sent`/`approved` ni traspasos; D02/D04/D05/D06 permanecen pendientes.

## Archivos principales

- `apps/api/src/modules/estimation/application/validate-estimation-questionnaire.ts`: validador contra definición fija.
- `apps/api/src/modules/estimation/presentation/estimation.controller.ts`: nuevo `/poc/proposal-answered`.
- `apps/api/src/modules/estimation/infrastructure/drive/google-drive-document-source.reader.ts`: fallback explícito.
- `apps/api/src/modules/estimation/application/use-cases/generate-estimation-poc-proposal.use-case.ts`: etiqueta demo KDM aunque el modelo sea Gemini.
- `apps/web/src/modules/estimation/api/estimation.api.ts` y `estimation.queries.ts`: query fija y mutación revisada.
- `apps/web/src/modules/estimation/components/EstimationQuestionnaireForm.tsx`: stepper F01–F05.
- `apps/web/src/modules/estimation/pages/EstimationWorkspacePage.tsx`: dispara propuesta solo tras respuestas.

## QA automatizado incorporado

- `apps/api/src/modules/estimation/application/validate-estimation-questionnaire.spec.ts`: validación de obligatorios, IDs, catálogos, duplicados, multi `none`, y supuestos.
- `apps/api/src/modules/estimation/infrastructure/drive/google-drive-document-source.reader.spec.ts`: niega fallback para proyectos reales y permite solo demo explícita.
- `apps/api/src/modules/estimation/application/use-cases/generate-estimation-poc-proposal.use-case.spec.ts`: KDM fixture mantiene su etiqueta `poc_simulated`.
- `apps/web/src/modules/estimation/components/EstimationQuestionnaireForm.test.tsx`: paso a paso, errores obligatorios, navegación, persistencia local de respuestas, envío único al finalizar.
- `apps/web/src/modules/estimation/pages/EstimationWorkspacePage.test.tsx`: sin envío automático al entrar y payload final con F01–F04 y URL/indicaciones de Drive.

## Comandos PowerShell

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

pnpm --filter @kora/api exec vitest run src/modules/estimation/application/validate-estimation-questionnaire.spec.ts src/modules/estimation/infrastructure/drive/google-drive-document-source.reader.spec.ts src/modules/estimation/application/use-cases/generate-estimation-poc-proposal.use-case.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/estimation/components/EstimationQuestionnaireForm.test.tsx src/modules/estimation/pages/EstimationWorkspacePage.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test

pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
```

## Siguiente corte sugerido

**R4-b:** lectura documental real durante el análisis preliminar, selección de hasta cinco preguntas dinámicas justificadas por fuentes, esquema con identificadores y validación de origen, deduplicación con las fijas, y presentación en el mismo stepper. No reutilizar `/poc/analyze` simulando que hizo lectura de Drive si aún no la hace.

**Sin nueva migración, sin despliegue, sin PR ni cambios en `master`.** GitHub permite revisar/publicar el código pero no ejecutar pnpm; QA local pendiente.
