# Kora 2.0 · Resúmenes Gemini en vivo

Fecha: 2026-11-08. Rama: `feature/calculadora-roadmap-diseno-v5-02`. PR #7 (draft).

## Alcance
Durante **Análisis** de una nueva cotización mostrar debajo de
«El análisis se realiza en el servidor» un desplegable discreto
**Ver razonamiento resumido de Gemini**. Se reutiliza el elemento nativo
`<details>` y la clase `more` ya usada en el wizard, con tokens Kora.

## Implementación
- Gemini 3.6 Flash: una sola llamada
  `:streamGenerateContent?alt=sse` con `thinkingConfig.includeThoughts=true`,
  JSON estructurado existente y `responseSchema` inalterado.
- Únicamente `content.parts` con `thought=true` se transmiten como
  resúmenes del proveedor. Nunca se expone una cadena interna completa
  ni `thoughtSignature`. Los otros fragmentos forman el JSON final,
  validado por el caso de uso; no se entrega análisis parcial.
- API `POST /api/estimations/poc/analyze/stream` protege el proyecto
  antes de abrir SSE. Eventos `thought`, `complete`, `error`,
  sin cacheo ni buffering intencional. El JWT se envía como bearer,
  no en una URL; los resúmenes no se guardan en BD.
- El cliente Web reutiliza bearer en memoria y la renovación de sesión
  existente. No reintenta una generación iniciada ni llama dos veces al
  modelo. La UI muestra el texto que llega, en orden y sin fabricar pasos.
- El acordeón empieza cerrado y tiene altura moderada con scroll.
  Si Gemini no proporciona resúmenes, se explica que no están disponibles.
  El entendimiento final y las preguntas conservan los contratos actuales.

## Tests agregados
Provider streaming: fragmentos SSE, `thought=true` y JSON completo, 429,
ausencia de resúmenes. Controller: permisos antes del canal, evento final
y errores saneados. Cliente: chunks fraccionados, bearer, SSE de error
y terminación sin resultado. Wizard: apertura, recepción incremental,
ningún paso ficticio y una sola petición de análisis.

## Pendiente
Typecheck, Vitest y build locales, además de probar SSE real con Caddy
y el `GEMINI_MODEL` configurado; Google puede emitir resúmenes al final o
no emitirlos, y la interfaz no debe atribuir pasos que no recibió.

## Correcciones posteriores: JSX, confirmación EDT y top-layer (08-11-2026)

### Typecheck del wizard

Se corrigió TS2657 en `AiQuotationWizardModal.tsx`: el bloque
`sourceStep === 'analyzing'` debe devolver un único fragmento JSX
que contiene tanto el listado de hitos `<ol>` como el desplegable
nativo `<details>`. La corrección conserva ambos elementos.

### Paso 5 de la cotización

La nota fija «La cotización se guardará como borrador con revisión IA
pendiente» fue sustituida visualmente por el mismo desplegable discreto
«Ver razonamiento resumido de Gemini», sin eliminar el aviso: se conserva
dentro del contenido expandible.

`POST /api/estimations/projects/:projectId/quotation/versions/ai-poc/stream`
reutiliza el caso de uso original de creación de borrador, protegido por
`authorizeAiPoc` **antes de abrir SSE**. Durante la única operación de
generación envía:

- `phase: proposal`: el backend pidió a Gemini perfiles y capacidad;
- `thought`: texto real `thought=true` que entregó Gemini;
- `phase: edt`: se inicia la construcción de EDT, con otra petición de
  negocio que **ya existía**;
- `thought`: resumen real de esa generación de EDT;
- `phase: saving`: se iniciará la persistencia de un borrador;
- `complete`: versión creada, luego navegación habitual;
- `error`: generación detenida, no fingir `complete`.

La ruta REST original y los controles de contrato, HH, validación de
perfiles/equipos, fuente documental y revisión IA quedan intactos.
**No se añade una tercera petición para generar narración**. La opción
de reintento de EDT existente sigue definida por configuración.

El paso 5 usa un solo `<details>` con los estilos de pensamiento ya
existentes, texto temporal local sin persistir, resúmenes incrementales,
etiqueta de fase verificada por SSE y bloqueo de doble clic durante
generación. No se presentan frases genéricas como pensamiento del
modelo.

### Snackbars sobre modales nativos

`ToastProvider` ya no intenta superar `showModal()` aumentando
`z-index`: los diálogos son parte de la *top layer* del navegador,
fuera del orden normal de apilamiento. Se usa `createPortal` para
renderizar el aviso dentro del `<dialog>` modal activo, manteniendo
`aria-live`, botón «Cerrar aviso», auto-dismiss y estilos compartidos.
Al cerrarse el diálogo, el portal vuelve a `document.body`.
Se agregaron tres pruebas de montaje/cierre y selección de modal activo.

### Verificación pendiente en checkout Windows

```powershell
pnpm --filter @kora/api typecheck
pnpm --filter @kora/web typecheck

pnpm --filter @kora/api exec vitest run `
  src/modules/ai/infrastructure/gemini-ai.provider.spec.ts `
  src/modules/estimation/presentation/estimation.controller.spec.ts `
  src/modules/estimation/presentation/quotation.controller-ai-poc.spec.ts `
  src/modules/estimation/application/use-cases/generate-estimation-poc-proposal.use-case.spec.ts

pnpm --filter @kora/web exec vitest run `
  src/shared/lib/api-client.stream.test.ts `
  src/shared/components/ui/Toast.modal.test.tsx `
  src/modules/estimation/components/AiQuotationWizardModal.test.tsx

pnpm --filter @kora/api build
pnpm --filter @kora/web build
```

Las pruebas y builds locales requieren ejecución del usuario; desde
GitHub solo se ha confirmado la publicación y revisión estática.
