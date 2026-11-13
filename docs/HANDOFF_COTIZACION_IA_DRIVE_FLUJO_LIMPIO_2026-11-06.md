# HANDOFF — Cotización IA: Google Drive automático, explorador de carpetas y progreso real

Fecha: 2026-11-06
Rama: `feature/calculadora-roadmap-diseno-v5-02`
Integración a master: **NO**. Migraciones PostgreSQL: **ninguna**.

## Objetivo
Igualar el prototipo visual Kora proyectos v6 sin mensajes o botones de diagnóstico OAuth. Ingresar carpeta si Extras no tiene documentación, conectar Google automáticamente desde «Analizar proyecto», mostrar los documentos reales seleccionados antes de consumir Gemini, permitir «Cambiar» entre carpetas y visualizar progreso verificable.

## Recorrido completo
1. «Nueva cotización → Con el agente IA»: etapa 1 Análisis. Si Extras tiene `documentationLink`, se ofrece ese enlace; si no, se solicita una URL válida de `drive.google.com/drive/folders/...`. **Todavía no aparece «Indicaciones adicionales».**
2. Primer clic en «Analizar proyecto»: abre el popup OAuth de Google **sin await antes de `window.open`** (evita popup blockers). Si ya existe autorización temporal para esa carpeta o hay cuenta de servicio configurada, la reutiliza. No existen botones «Probar acceso» ni «Comprobar autorización».
3. El callback HTTP ya registrado en Google conserva CSRF/state/cookie; en éxito envía `postMessage` y cierra automáticamente el popup. Por política COOP, algunos navegadores cortan `window.opener`: el frontend consulta `GET /api/estimations/drive/oauth-poc/access` cada 1,5 s **solo mientras está pendiente**, sin exponer tokens. Puede cancelarse la conexión. El token permanece en memoria backend, asociado a usuario y carpeta, sin refresh token.
4. `POST /api/estimations/drive/folders/browse` recibe `projectId`, `authorizationFolderUrl` (carpeta inicialmente autorizada) y `folderUrl` (selección). Valida `authorizeAiPoc(projectId, actor)` antes de consultar Google.
5. El backend comprueba metadatos y ascendencia: solo se permiten la carpeta original, sus hermanas y sus descendientes dentro del mismo padre accesible. No admite carpeta de fuera del grupo mediante cambiar ID. Si la carpeta está en otra ubicación se pide una nueva autorización Google. El selector no puede subir al padre, evitando explorar sus hermanas externas.
6. La exploración devuelve `folder`, `parentFolder`, `siblingFolders`, `childFolders`, `documents`, `coverage`, `siblingsUnavailable`. La carpeta superior puede ser inaccesible: ese error se captura y se muestran las subcarpetas. La lectura se hace mediante `GoogleDriveDocumentSourceReader.readDriveSourcesWithCoverage`: **mismo algoritmo que utiliza `/poc/analyze`**. Al navegador solo viajan nombres, IDs, rutas, MIME y fechas; jamás el contenido ni access token.
7. Después del consentimiento se muestran los archivos seleccionados, nombre de la carpeta y «Cambiar». Se muestra «Indicaciones adicionales · opcional» recién aquí. No se envía todavía nada a Gemini. Si hay 0 documentos legibles, se deshabilita la acción de analizar y se invita a cambiar carpeta.
8. «Cambiar» abre el modal de selección con carpetas hermanas y subcarpetas consultadas a Drive, más un campo de URL alternativa. Confirmar una carpeta accesible pide nueva vista previa y vuelve al listado con los nuevos documentos. Pegar un enlace ajeno inicia su propio OAuth.
9. Segundo clic «Analizar proyecto» invoca `POST /api/estimations/poc/analyze`. La previsualización y el análisis son dos solicitudes distintas: la primera prepara contexto en el backend, la segunda realiza otra lectura y llama a Gemini. Se muestran estados de carga auténticos para lectura y análisis, **sin simular porcentajes ni afirmar pasos internos que el backend no reporta**.
10. Al recibir y validar resultado `provider=gemini`, `sourceMode=drive`, `documentsAnalyzed>0`, el asistente avanza a «2. Entendimiento», mostrando el resumen editable y la fuente real. Las condiciones, aclaraciones, confirmación y generación final siguen como estaban.

## Archivos clave
- `apps/web/src/modules/estimation/components/AiQuotationWizardModal.tsx`: secuencia y modal de carpetas.
- `apps/web/src/modules/estimation/components/AiQuotationWizardModal.module.css`: colores Kora, estados, animaciones, modal selector.
- `apps/web/src/modules/estimation/api/estimation.api.ts`: tipos de preview y servicio HTTP.
- `apps/api/src/modules/estimation/presentation/estimation.controller.ts`: endpoint con autorización comercial de proyecto.
- `apps/api/src/modules/estimation/infrastructure/drive/browse-authorized-drive-folder.ts`: control de acceso a carpetas relacionadas y preview documental.
- `apps/api/src/shared/infrastructure/auth/google-drive-oauth-poc.service.ts`: tokens delegados efímeros y callback autocierre.

## Restricciones y advertencias
- La PoC usa `drive.readonly` con consentimiento; scope amplio, aunque la UI limita la exploración por jerarquía. No equivale a una integración permanente con Drive.
- La lista depende de los permisos que Google conceda a la cuenta autorizada. En carpetas compartidas, su carpeta superior puede ser inaccesible. Por tanto las hermanas **no están garantizadas**.
- El lector documental tiene guardas de cobertura (número de archivos explorados, profundidad, tamaño y formatos). El listado muestra **los documentos seleccionados para el análisis**, no necesariamente todos los archivos de Drive. Si cambia Drive entre previsualización y análisis, la selección puede variar.
- El cliente Drive usa páginas de máximo 100 elementos; una carpeta mayor puede requerir paginación para explorar todas sus carpetas.
- Los Office binarios clásicos no se extraen en esta ruta sin conversión; las variantes Google Docs/Sheets/Slides, PDFs y texto sí.
- Los tokens se pierden al reiniciar NestJS; si se usan múltiples procesos será necesaria una solución de sesión compartida.
- Ante errores de lectura o sin documentos legibles no se inventa contenido ni se sustituye por `Requerimiento_KDM.pdf`.
- En estado `sourceStep=connecting` el frontend hace polling solo al endpoint de autorización, no a Gemini. En estado `sourceStep=analyzing`, **una** petición a `/poc/analyze` queda pendiente mientras Gemini procesa.

## Validación PowerShell
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/contracts build
if ($LASTEXITCODE -ne 0) { throw "Contratos fallaron" }

pnpm --filter @kora/api typecheck
if ($LASTEXITCODE -ne 0) { throw "API typecheck falló" }

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Web typecheck falló" }

pnpm --filter @kora/api exec vitest run `
  src/modules/estimation/infrastructure/drive/browse-authorized-drive-folder.spec.ts `
  src/modules/estimation/presentation/estimation.controller.spec.ts `
  src/shared/infrastructure/auth/google-drive-oauth-poc.service.spec.ts
if ($LASTEXITCODE -ne 0) { throw "API tests fallaron" }

pnpm --filter @kora/web exec vitest run `
  src/modules/estimation/components/AiQuotationWizardModal.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Web tests fallaron" }

pnpm --filter @kora/api build
if ($LASTEXITCODE -ne 0) { throw "API build falló" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Web build falló" }
```

## Prueba manual
1. Nest API (3000) + Vite `--host 127.0.0.1 --port 5173 --strictPort` + Caddy HTTPS como antes.
2. Proyecto sin documentación en Extras → Cotizaciones → Nueva cotización con IA. Ingresar carpeta. «Indicaciones adicionales» aún oculta.
3. Primer «Analizar proyecto» → popup Google → autorizar → popup se cierra, aparecen archivos y nombre real de la carpeta. Network debe mostrar `/drive/oauth-poc/start`, `/drive/oauth-poc/access`, `/drive/folders/browse`.
4. «Cambiar» → seleccionar hermana o hija → nuevos archivos en preview. Verificar que `authorizationFolderUrl` sigue el enlace originalmente autorizado.
5. Segundo «Analizar proyecto» → una petición `/poc/analyze`; spinner mientras está pendiente → Entendimiento editable tras respuesta 200.
6. Repetir sin permiso de lectura, carpeta vacía y origen distinto fuera del árbol para comprobar fallos controlados.

**Estado de comprobaciones:** los cambios se realizan mediante conector GitHub, que no ejecuta tests ni Vite. Los comandos anteriores y el flujo real deben validarse en la máquina del desarrollador; no afirmar resultados hasta ver su salida.
