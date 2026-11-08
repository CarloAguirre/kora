# Kora 2.0 · Descubrimiento asistido de carpetas Drive
**Fecha:** 2026-11-08  
**Rama:** `feature/calculadora-roadmap-diseno-v5-02`  
**PR:** #7 (draft)  
**Alcance:** cotización IA → etapa 1 Análisis → fuente documental del proyecto.

## Requerimiento

Al iniciar una nueva cotización, el usuario debe poder conectar su
Google Drive sin conocer previamente la URL de la carpeta de levantamiento.
Kora debe localizar carpetas relacionadas con el nombre del proyecto y
el cliente, priorizar documentación vigente, ofrecer alternativas cuando
existe incertidumbre y conservar la selección confirmada en
**Extras → Documentación** (`documentationLink`). No debe analizar ni
utilizar información de otros proyectos por suposición.

## Implementación

1. `GoogleDriveOAuthPocService` mantiene `drive.readonly` y admite
   `DRIVE_DISCOVERY_SESSION`, un identificador **interno** para iniciar
   OAuth sin URL. El token continúa temporal, almacenado solo en memoria
   del backend, asociado al usuario, con state/cookie HTTP-only. Nunca
   llega al navegador o a la BD. El consentimiento de la cuenta técnica
   no se confunde con el consentimiento personal.
2. Los endpoints `/estimations/drive/oauth-poc/start` y `/access`
   aceptan `driveFolderUrl` opcional. `/estimations/drive/resolve`
   utiliza el token delegado del usuario si está disponible;
   con OAuth personal deshabilitado puede utilizar la cuenta de servicio.
   Sigue exigiendo permisos del proyecto mediante `authorizeAiPoc`.
3. El resolver existente hace búsquedas por nombre de proyecto y cliente
   y recorre raíces relevantes hasta dos niveles, con límite de 80
   carpetas y 18 expansiones. Considera parentesco de carpetas,
   vocabulario de levantamiento y enlaces previos. Con Gemini real
   configurado y varias candidatas, compara **únicamente metadatos**
   limitados (nombres de carpetas y unos pocos nombres de archivos).
   Un `folderId` propuesto por Gemini es aceptado **solo** si está
   entre los IDs efectivamente devueltos por Drive; en caso de error
   queda el ranking determinista. No se leen contenidos de candidatas
   no confirmadas.
4. El asistente muestra candidatas, confianza, motivos y ruta de
   antecesores. También admite pegar una URL manual. Incluso con alta
   confianza exige confirmación antes de guardar. Enlace confirmado
   → exploración de carpeta accesible → verificación de documentos
   legibles → `useUpdateProjectExtras({documentationLink})`.
   El reemplazo de un enlace anterior está permitido; si falla la
   edición de Extras se muestra advertencia. Una carpeta sin documentos
   legibles no se guarda.
5. Solo después de seleccionar una carpeta con documentos reales, Gemini
   recibe los documentos seleccionados para análisis, entendimiento y
   preguntas dinámicas. No hay fallback silencioso al fixture KDM.
6. Se conserva el flujo OAuth de URL explícita, la navegación manual
   por carpetas hermanas/hijas y el callback/polling compatible con
   restricciones COOP de Google. Sin modificaciones de tablas,
   migraciones, contratos persistidos o cálculo de estimaciones.

## Archivos clave

- `apps/api/src/shared/infrastructure/auth/google-drive-oauth-poc.service.ts`
- `apps/api/src/modules/estimation/presentation/estimation.controller.ts`
- `apps/api/src/modules/estimation/application/use-cases/resolve-estimation-drive-folder.use-case.ts`
- `apps/api/src/modules/estimation/infrastructure/drive/browse-authorized-drive-folder.ts`
- `apps/api/src/modules/estimation/infrastructure/drive/resolve-authorized-drive-reader.ts`
- `apps/web/src/modules/estimation/api/estimation.api.ts`
- `apps/web/src/modules/estimation/components/AiQuotationWizardModal.tsx`

## Escenarios de aceptación

- Proyecto sin URL: conectar Drive personal, buscar, proponer carpeta y
  confirmar sin copiar enlace manualmente.
- Varias candidatas: elegir entre Levantamiento actual y una carpeta
  de proyecto cerrado, o introducir otra URL.
- Carpeta confirmada: el vínculo de Extras se guarda/reemplaza y
  los documentos de esa carpeta alimentan el análisis Gemini.
- Sin documentos legibles: no guardar Extras ni lanzar Gemini.
- Permisos insuficientes: no descubrir carpetas de proyectos ajenos;
  no exponer access tokens al frontend.
- Cuenta técnica configurada: no considerarla consentimiento OAuth
  del usuario cuando se busca en «mi Drive».
- Sin Gemini/cuota: se mantienen candidatos determinísticos y
  confirmación humana; no se inventan rutas ni certeza.

## Validación local pendiente

```powershell
pnpm --filter @kora/api typecheck
pnpm --filter @kora/api exec vitest run `
  src/shared/infrastructure/auth/google-drive-oauth-poc.discovery.spec.ts `
  src/modules/estimation/presentation/estimation.controller.spec.ts `
  src/modules/estimation/application/use-cases/resolve-estimation-drive-folder.use-case.spec.ts `
  src/modules/estimation/infrastructure/drive/browse-authorized-drive-folder.spec.ts `
  src/modules/estimation/infrastructure/drive/resolve-authorized-drive-reader.spec.ts

pnpm --filter @kora/web typecheck
pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/components/AiQuotationWizardModal.test.tsx

pnpm --filter @kora/api build
pnpm --filter @kora/web build
```

Las pruebas se incorporaron al repositorio pero **no se ejecutaron
localmente** desde este entorno. El PR permanece draft y requiere la
validación funcional con Google Drive real y Gemini configurados.

## Ajuste de UX inicial de Google Drive (08-11-2026)

La vista sin documentación en Extras debe seguir la segunda captura
del prototipo: explicación breve y **un único botón Conectar con Google
Drive**. Se elimina el campo manual y el segundo botón del pie de esa
primera pantalla. Se mantiene Cancelar; el botón usa `Button secondary sm`
del UI kit de Kora, no un estilo de botón inventado.

Cuando Extras ya tiene carpeta Drive válida, se conserva la apertura
directa y el botón Analizar proyecto; el enlace para cambiar de carpeta
queda como opción secundaria. Las URL manuales se piden **después** del
descubrimiento, dentro de candidatas, cuando el usuario necesita elegir
o corregir. OAuth, permisos, ranking, Gemini, guardado en Extras y
reglas de confirmación siguen intactos. Pruebas del wizard actualizadas
para proteger el estado inicial sin doble CTA.

## Incidente de carpeta con PDF y Excel visibles, pero sin documentos legibles (08-11-2026)

La captura de `03.Documento de levantamiento detallado` muestra carpetas
internas, PDF (algunos menores de 5 MB) y archivos Excel. **No es evidencia
de una carpeta vacía.** El lector del backend soporta PDF y Google Docs,
Sheets y Slides, pero no interpreta nativamente binarios `.xlsx`.

La revisión confirmó limitaciones del código:
- El adaptador Google Drive solo pedía la primera página de 100 elementos.
  Se añade paginación acotada (máximo 10 páginas) sin devolver un listado
  incompleto como si estuviera vacío.
- Errores de descarga individual se registraban como una omisión genérica,
  invisible en el wizard. Ahora se distingue denegación/HTTP y se preservan
  los demás documentos legibles, incluidos los de subcarpetas cuando
  alguna ruta no tiene permisos.
- La vista mostraba siempre el mismo error para 0 compatibles o 2 compatibles
  con lectura fallida. Se separan los escenarios y se presenta la lista de
  archivos omitidos con motivos y conteos, sin exponer tokens/cuerpos de
  respuesta de Google.
- Los Excel binarios siguen siendo incompatibles. Se explica cómo convertir
  a Google Sheets; no se atribuye falsamente lectura a Gemini.

**Pendiente de confirmación:** ejecución de pruebas API/Web, build y prueba
real en Drive. El JSON de cobertura devuelto por `folders/browse`
determinará si fallan lectura de PDF (403 u otro), formato, tamaño,
permisos, límite o visibilidad de Drive. Sin esa evidencia no se declara
una causa única del incidente.

## Hotfix Vitest Web (08-11-2026)

La validación local de `8ac716cb` confirmó `typecheck` API y Web,
y 23/23 pruebas Drive backend. El wizard pasó 15/17 pruebas. Las dos
restantes seguían afirmando el antiguo mensaje genérico
`No hay documentos legibles` tras incorporar diagnósticos específicos
de cobertura. No hubo fallo de compilación ni evidencia de un problema
OAuth en ese log. Se reemplazan los fixtures inconsistentes
(`documents=[]` con `analyzedDocuments=1`) por dos situaciones
diferenciadas: carpeta realmente vacía (0 detectados) y carpeta
con archivos incompatibles (Excel .xlsx, 0 elegibles).
Se comprueban el texto de diagnóstico vigente y que el análisis de Gemini
continúa bloqueado. El caso de PDF detectado pero no descargable
permanece cubierto por su prueba independiente. Validación local
del nuevo commit todavía pendiente.
