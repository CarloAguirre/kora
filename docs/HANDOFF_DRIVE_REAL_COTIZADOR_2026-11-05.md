# Handoff — Cotizador IA con documentos reales de Google Drive
Fecha: 2026-11-05
Rama: `feature/calculadora-roadmap-diseno-v5-02`
Sin migraciones de PostgreSQL. NO se ha integrado a `master`.

## Por qué se mostraba el PDF KDM
La vista de detalle del proyecto → Cotizaciones → Nueva cotización abre `NewProjectQuotationModal` y luego `AiQuotationWizardModal`. Este último usaba `DEMO_KDM_FOLDER_URL` y textos estáticos `Requerimiento_KDM.pdf`. La implementación anterior de OAuth Drive estaba conectada a otro modal (`NewEstimationModal`) y solamente hacía una consulta diagnóstica, sin reutilizar el acceso para analizar documentos.

## Comportamiento corregido
1. `AiQuotationWizardModal` usa `project.documentationLink` leído del tab «Extras». Si existe, no pide otra URL y muestra el vínculo. Si no existe, solicita una carpeta de Google Drive en el paso Análisis.
2. Si Extras contiene una URL que no es una carpeta Drive, se bloquea el análisis: el usuario debe corregir Extras. No se reemplaza el documento real por un ejemplo.
3. En entornos con cuenta de servicio Drive configurada se utiliza ese lector. Si no existe cuenta de servicio, debe estar habilitado `GOOGLE_DRIVE_OAUTH_POC_ENABLED=true` y el usuario autoriza la carpeta con Google. El callback reutiliza el redirect URI existente.
4. El backend confirma el token y verifica lectura de la carpeta antes de conceder la autorización temporal. El access token permanece **solamente en la memoria del proceso backend**, asociado a `userId + folderId`, por un máximo de 45 minutos (o menos según expiración). No hay refresh token; no se persiste en PostgreSQL, frontend ni cookie. Si reinicias la API, deberás volver a autorizar.
5. La pantalla puede consultar `GET /api/estimations/drive/oauth-poc/access?projectId=...&driveFolderUrl=...` para recuperar estado si Google bloqueó `window.opener` por COOP. El endpoint comprueba autorización al proyecto y nunca devuelve secretos.
6. `/estimations/poc/analyze` usa la autorización del actor y el lector Google Drive para leer documentos reales y Gemini debe devolver `sourceMode=drive`.
7. `/estimations/projects/:projectId/quotation/versions/ai-poc` admite propuestas Gemini reales basadas en Drive y mantiene la compatibilidad con KDM exclusivamente para pruebas antiguas. El snapshot, la EDT y el evento del borrador distinguen procedencia `drive` vs `kdm_demo`.
8. Al introducir un nuevo vínculo, el asistente intenta guardarlo en Extras. Un rol sin permiso de escritura puede continuar usando el enlace solo en la cotización y ve una advertencia.
9. Los endpoints de búsqueda, inventario y listado de archivos ya no atribuyen KDM a carpetas reales cuando falta la cuenta de servicio. El fixture `kora-poc-fallback` queda aislado para pruebas de legado.

## Alcance real y limitaciones
- La autorización OAuth es **temporal, local a una instancia y atada al usuario que dio consentimiento**; no es una integración permanente server-to-server ni sincronización general de Drive.
- La app solicita el scope amplio `drive.readonly`, aunque la PoC utiliza la carpeta indicada y sus subcarpetas. Es un scope sensible; Google puede exigir verificación o usuarios de prueba.
- El lector selecciona máximo 4 antecedentes entre 150 ítems explorados y recorre hasta profundidad 3. Soporta PDF, Google Docs/Sheets/Slides y texto/CSV/JSON; archivos Office binarios DOCX/XLSX/PPTX y algunas imágenes no se extraen todavía.
- La resolución por nombre sin cuenta de servicio no funciona. Usa un enlace explícito de Extras o el enlace pegado manualmente.
- La validez del acceso y de Google Cloud solo se conoce después de realizar la prueba; no se ha ejecutado OAuth real desde este entorno de desarrollo del agente.
- Cualquier backend corriendo con múltiples procesos/instancias requerirá sesión OAuth compartida o una estrategia distinta, no este Map de memoria.

## Validación local (PowerShell)
```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/api typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck API falló" }
pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck Web falló" }

pnpm --filter @kora/api exec vitest run src/shared/infrastructure/auth/google-drive-oauth-poc.service.spec.ts src/modules/estimation/infrastructure/drive/resolve-authorized-drive-reader.spec.ts src/modules/estimation/presentation/estimation.controller.spec.ts src/modules/estimation/presentation/quotation.controller-ai-poc.spec.ts src/modules/estimation/application/use-cases/inventory-estimation-drive.use-case.spec.ts src/modules/estimation/application/use-cases/resolve-estimation-drive-folder.use-case.spec.ts
if ($LASTEXITCODE -ne 0) { throw "Test API falló" }

pnpm --filter @kora/web exec vitest run src/modules/estimation/components/AiQuotationWizardModal.test.tsx
if ($LASTEXITCODE -ne 0) { throw "Test Web falló" }
```

Levanta NestJS en puerto 3000 y Vite en `127.0.0.1:5173` con Caddy HTTPS local. `GOOGLE_CALLBACK_URL` debe coincidir con el callback registrado de Google. No instalar secretos en repositorios ni conectar la BD local a producción. Al terminar la prueba, restaurar el archivo `hosts` de Windows para devolver `kora.kabeli.cl` a su resolución habitual.

**Nota:** el conector GitHub permite leer y escribir repositorios pero no ejecutar typecheck/build/tests ni un browser de la aplicación. Ningún resultado de validación local se afirma como PASSED sin logs reales del desarrollador.
