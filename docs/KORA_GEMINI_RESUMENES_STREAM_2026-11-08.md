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
