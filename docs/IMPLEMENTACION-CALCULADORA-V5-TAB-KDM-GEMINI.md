# Calculadora Kora · Integración de cotizaciones v5 con demostración KDM y Gemini

**Rama:** `feature/calculadora/carlo`  
**Fecha de corte:** 2026-11-02  
**Estado:** cambios publicados en GitHub; ejecutar pruebas y builds locales antes de integrar.

## Principio de diseño

Se utiliza `kora-proyectos-v5.html` **solo como referencia funcional** para ubicación y flujo. La implementación mantiene **la estética y los componentes existentes de Kora**:

- `DevelopmentProjectDetailView` conserva su shell de pestañas, junto a Resumen, Roadmap, Bitácora, Extras.
- `ProjectQuotationCard` pasa de tarjeta externa al nuevo tab **Cotizaciones**.
- `NewProjectQuotationModal` reutiliza `Modal`, `Button`, `Select` y también `NewEstimationModal.module.css` para los tres radios, sin crear un segundo design system.
- Las pantallas de cuestionario y editor existentes se reutilizan. El asistente se inicia desde el tab, continúa en la ruta ya existente `/proyectos/:slug/estimacion` y termina en `/proyectos/:slug/cotizacion?version=<uuid>`.
- Se mantiene la misma tipografía, tokens, espaciados y patrones de las páginas actuales.

## Flujo operativo implementado

### 1. Proyecto → Cotizaciones

La ficha de un proyecto de desarrollo muestra **Cotizaciones** como pestaña si el actor tiene `projects:manage` o es el líder asignado con `projects:read_assigned`. Un líder de otro equipo en vista restringida no accede por este tab.

Si no existen cotizaciones: mensaje de estado vacío y **+ Nueva cotización** solamente cuando `isQuotationDraftEligibleProject` permite crear. Desde el 10-11-2026, los botones **+ Nueva cotización** y **+ Nueva versión** de esta pestaña se muestran deshabilitados y no abren el modal de creación. Este bloqueo es exclusivo de la pestaña del proyecto; no modifica la Calculadora ni la API. El listado carga versiones **reales de PostgreSQL**, con versión, fecha, estado, HH y monto. Versiones históricas son consulta, no edición.

### 2. Modal de nueva cotización

- **Agente IA:** reservado a Gerencia. Navega al asistente y utiliza explícitamente `https://drive.google.com/drive/folders/kora-poc-fallback` para la documentación KDM de prueba.
- **En blanco:** crea `quotation_versions` usando la API existente y abre el editor de esa versión.
- **Copiar otra cotización:** copia una versión guardada del mismo proyecto; si el actor tiene `projects:manage`, también puede seleccionar otro proyecto de desarrollo al que tiene acceso.

La copia entre proyectos fue incorporada al contrato mediante `sourceProjectId` opcional, autoriza el origen en el caso de uso, verifica en BD que la versión pertenece a la cotización de origen, y crea una **nueva** versión del proyecto destino. En particular, una copia de versión IA **elimina** `analysis`, `aiPoc`, `sourceRefs` y `answers`; no hereda una aceptación o un artefacto ajeno. No se toca el proyecto de origen.

### 3. Análisis previo IA (Drive simulado exclusivamente)

El adaptador `GoogleDriveDocumentSourceReader` entrega el contenido de `Requerimiento_KDM.pdf` **solo** ante el ID exacto `kora-poc-fallback`, aun si existe configuración Drive; así no se consulta Drive para el fixture, ni se sustituye documentación de otras carpetas silenciosamente.

`POST /api/estimations/poc/analyze` ahora, cuando el proveedor es Gemini, **lee** la fuente documental a través de `DocumentSourceReader` y envía texto y metadata a `gemini.generateStructured`. El resultado incluye resumen y hasta 5 preguntas dinámicas; cada una requiere una `sourceRef.sourceId` incluida en los documentos leídos. Se validan las referencias (sin permitir nombres inventados) y se normalizan IDs `D01..D05`. No genera HH en esta fase.

Si falta `GEMINI_API_KEY`, el proveedor técnico puede ser el adaptador PoC, pero **la pantalla KDM no continúa** presentando preguntas simuladas como Gemini. Para seguir el flujo de prueba se requiere Gemini real.

### 4. Cuestionario y generación

`EstimationQuestionnaireForm` existente muestra en secuencia **F01–F05 + D01–D05** generadas para el documento KDM; mantiene respuestas al navegar hacia atrás. Las preguntas obligatorias, tipos, alternativas y la opción excluyente `none` se validan en el cliente y de nuevo en el backend.

Nuevo endpoint:

`POST /api/estimations/projects/:projectId/quotation/versions/ai-poc`

- Requiere `projects:manage`, que el proyecto admita borradores y que el `projectId` del body sea el de la URL.
- Requiere la URL **exacta** KDM demo y referencias de preguntas dinámicas a `kora-poc-requerimiento-kdm`.
- Ejecuta el cálculo de Gemini en servidor mediante `GenerateEstimationPocProposalUseCase`; la UI no envía un objeto de propuesta inventado para persistir.
- Valida que `provider === 'gemini'`, `sourceMode === 'poc_simulated'`, exista documento analizado y las HH por rol sumen el total devuelto.
- Crea una nueva `quotation_versions` dentro de transacción PostgreSQL; guarda evento `draft_created`, `origin='ai'`, `aiReviewStatus='pending'`, el resumen de roles, respuestas F/D, supuestos y preguntas dinámicas como evidencia `aiPoc` en JSONB.
- **No escribe** planificación, equipos asignados al proyecto, tareas operativas, horas ejecutadas ni hitos de facturación.

### 5. Mapeo de roles y persistencia

La página `QuotationWorkspacePage` muestra `AiPocRoleMappingCard` (componentes Kora) con las HH propuestas, justificaciones y listas de **equipos activos**.

El usuario mapea cada rol a un equipo real de Kora. Varios roles pueden compartir equipo; `projectPocRolesToQuotationDraft` calcula las fases y HH de cada rol de forma determinista, conservando las HH de Gemini y agrupando equipos sin sumar dos veces. Los cambios se aplican localmente y se guardan después con **Guardar borrador** (`PATCH` con `revision` y control de concurrencia).

El backend vuelve a comprobar que el mapeo y la proyección coinciden con la evidencia original guardada; impide reemplazar `aiPoc`, `answers` o `sourceRefs`. Si se editan manualmente equipos o HH después del mapeo, marca `analysisProjectionStatus='modified'` para conciliación explícita.

No se asignan roles a equipos en automático sin autorización humana. El total de la versión comienza en 0 HH cuando el borrador IA todavía no tiene ningún rol mapeado; el panel de IA sí informa las HH propuestas y estas pasan al total comercial al guardar el mapeo.

### 6. Validaciones comerciales e históricos

R3-f y R3-g siguen operativos. Cuando existe un `aiPoc` KDM, el preflight incluye el bloqueo `AI_POC_DEMO_NOT_COMMERCIAL`, además de revisión IA pendiente, y puede exigir mapeo de roles. El expediente R3-g identifica correctamente la evidencia `simulated_fixture` y su proveedor Gemini, sin presentar el documento KDM como fuente real del proyecto.

**Sin implementación deliberada:** envío al cliente, aceptación contractual, traspaso al proyecto, reemplazo de HH históricas, pagos y facturación. D02, D05 y D06 pendientes, además del flujo documental real. No se ha creado EDT granular, ERS o historias de usuario en este flujo ejecutivo PoC.

## Verificación

### Automática

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

pnpm --filter @kora/contracts exec vitest run src/estimation/quotation-poc-projection.spec.ts
pnpm --filter @kora/api exec vitest run src/modules/estimation/application/use-cases/analyze-estimation-poc.use-case.spec.ts src/modules/estimation/application/validate-estimation-questionnaire.spec.ts src/modules/estimation/application/use-cases/manage-quotation-drafts.use-case.spec.ts src/modules/estimation/presentation/quotation.controller-ai-poc.spec.ts src/modules/estimation/infrastructure/drive/google-drive-document-source.reader.spec.ts
pnpm --filter @kora/web exec vitest run src/modules/projects/pages/DevelopmentProjectDetailView.test.tsx src/modules/estimation/pages/EstimationWorkspacePage.test.tsx src/modules/estimation/components/AiPocRoleMappingCard.test.tsx

pnpm --filter @kora/contracts test
pnpm --filter @kora/api test
pnpm --filter @kora/web test
pnpm --filter @kora/api build
pnpm --filter @kora/web build
git status --short
```

### Manual

1. Como gerente, crear un proyecto desarrollo en etapa Prospecto o Cotización. Abrir su ficha → Cotizaciones. Comprobar estado vacío y botón de crear.
2. Crear versión **en blanco**: verificar versión persistida y HH cero iniciales.
3. Crear otra copiando desde el mismo proyecto y desde un segundo proyecto autorizado. Verificar que la fuente no cambió, versión destino nueva y permisos correctos. Un líder no gerente no puede copiar entre proyectos.
4. Elegir **Agente IA** y comprobar aviso «documento KDM de demostración». Confirmar que no haya llamadas a Google Drive.
5. Con Gemini configurado, verificar análisis y hasta 5 preguntas dinámicas con `sourceRefs` KDM. Sin Gemini, mostrar error explícito y no generar falsa cotización IA.
6. Completar las fijas y dinámicas; comprobar que no se envía la propuesta antes de contestar. Pulsar generar: 201, borrador guardado, redirección a editor y `origin='ai'`.
7. Mapear roles a equipos activos; probar dos perfiles en un mismo equipo. Pulsar **Aplicar distribución de HH**, después **Guardar borrador**, recargar y comprobar que persisten roles, HH, revisión y fuentes KDM de prueba.
8. Ejecutar preflight: debe bloquear el envío por la fuente KDM de demostración y por revisiones comerciales pendientes.
9. Verificar que las tablas operativas, `used_hours`, módulos, tareas, hitos, cuotas y pagos no cambian.
10. Confirmar que se mantuvieron las características visuales de Kora (no se copiaron estilos completos del HTML v5).

## Consideraciones abiertas

- El análisis KDM es **temporal**, aunque su procesamiento por Gemini es real si está configurado.
- Las preguntas dinámicas se generan en el análisis inicial; la solicitud de creación las reenvía y las valida con sus referencias de fuente. Su expediente se conserva en el borrador, pero no constituye una firma criptográfica del análisis previo. La autorización de envío continúa bloqueada.
- El listado de proyectos para copiar está limitado actualmente a la primera página de 200; la búsqueda/paginación se puede ampliar sin cambiar el esquema.
- Cualquier futura conexión Drive real debe usar fuentes y permisos del proyecto, no reutilizar el ID KDM.
- No hay migraciones adicionales: `aiPoc` usa el JSONB `quotation_versions.draft` existente.
- El conector GitHub no ejecuta scripts pnpm ni despliega. **No afirmar builds o tests aprobados** hasta que se corran localmente.
