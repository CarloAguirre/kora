# Kora 2.0 — Auditoría Google OAuth y lectura de Google Drive para Calculadora

**Fecha:** 2026-11-05  
**Rama auditada:** `feature/calculadora-roadmap-diseno-v5-02`  
**HEAD base de inspección:** `576f0d199cac1a7a20f491be910fe84a8cab2c3c`  
**Alcance:** lectura estática de repositorio y contraste con documentación oficial Google. **No** se verificaron variables de la EC2 productiva ni la configuración de Google Cloud; **no** se ejecutó una lectura real contra Google Drive.  
**Estado:** diagnóstico y diseño de integración; no implementa nuevo flujo OAuth ni habilita permisos productivos.

## 1. Conclusión

Kora tiene **dos mecanismos independientes**:

1. **Login Google OAuth 2.0**, backend `GoogleOAuthClientService`, mediante `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_CALLBACK_URL`. Solicita únicamente `openid email profile`, canjea el código por un token, consulta userinfo y emite una sesión propia. No guarda tokens ni autorización Drive. El hecho de poder iniciar sesión **no autoriza** a listar archivos.
2. **Lectura Drive para estimación**, backend `GoogleDriveFolderClient`, configurada con `GOOGLE_DRIVE_CLIENT_EMAIL` y `GOOGLE_DRIVE_PRIVATE_KEY`, bajo identidad de **cuenta de servicio**. Solicita `https://www.googleapis.com/auth/drive.readonly` y opera sobre archivos a los que esa identidad tiene acceso. No depende del OAuth Client ID de login.

El **mismo OAuth Client ID puede reutilizarse** para solicitar permiso a Drive mediante un segundo flujo de autorización separado del login, pero **no basta configurar una API o agregar un scope al token de sesión Kora**: requiere consentimiento OAuth de usuario, almacenamiento seguro de credenciales de Drive y adecuaciones al acceso por proyecto.

La alternativa de **menor cambio** si la documentación está en carpetas de proyecto administradas por la empresa es habilitar la cuenta de servicio existente y compartirle **solo las carpetas autorizadas**. No requiere migraciones ni modificar el login.

## 2. Mapa de integración existente

| Propósito | Código existente | Estado en fuente |
| --- | --- | --- |
| Botón «Continuar con Google» | `apps/web/src/modules/auth/pages/LoginPage.tsx` | Navega a `/api/auth/google` |
| Inicio/callback OAuth y CSRF | `apps/api/src/modules/auth/presentation/auth.controller.ts` | `state` cookie httpOnly; callback y emisión sesión propia |
| Solicitud Google login | `apps/api/src/shared/infrastructure/auth/google-oauth-client.service.ts` | `scope=openid email profile`, token únicamente para userinfo |
| Variables OAuth | `apps/api/src/config/app-config.service.ts`, `env.schema.ts` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| Credenciales Drive | mismos archivos de config | `GOOGLE_DRIVE_CLIENT_EMAIL` + `GOOGLE_DRIVE_PRIVATE_KEY`, independientes |
| API Drive | `apps/api/src/modules/estimation/infrastructure/drive/google-drive-folder.client.ts` | JWT firmado por servicio, buscar/listar/metadata/exportar/descargar |
| Lector documentos | `.../drive/google-drive-document-source.reader.ts` | Selecciona y lee antecedentes para IA |
| Endpoint resolver | `POST /api/estimations/drive/resolve` | Resuelve por enlace explícito, proyecto, cliente, ancestros |
| Endpoint inventario | `POST /api/estimations/drive/inventory` | Jerarquía, clasificación, compatibilidad |
| Endpoint listado simple | `POST /api/estimations/drive/files` | Lista directa |
| Análisis IA | `POST /api/estimations/poc/analyze`, `/poc/proposal-answered` | Solicitan documentos al lector y los envían a IA si procede |
| UI selección carpeta | `apps/web/src/modules/estimation/components/NewEstimationModal.tsx` | Resuelve, inventaría y persiste `projects.documentation_link` |
| Composición DI | `apps/api/src/modules/estimation/estimation.module.ts` | Ya vincula `DRIVE_FOLDER_CLIENT` y `DOCUMENT_SOURCE_READER` |

## 3. Hallazgos y riesgos, ordenados por prioridad

### P0 — el estado «connected» no demuestra Drive real

`InventoryEstimationDriveUseCase` y `ListEstimationDriveFilesUseCase` pueden devolver `connection: 'connected'` con archivo virtual `Requerimiento_KDM.pdf` cuando no hay credenciales de Drive. `ResolveEstimationDriveFolderUseCase` permite una carpeta `kora-poc-fallback`; `GoogleDriveDocumentSourceReader` trata explícitamente ese ID como demo.

**Acción antes de habilitar en producción:** separar los modos `real`, `demo`, `not_configured` inequívocamente y prohibir fallback en producción para carpetas reales. No confundir una PoC que responde con una conexión autorizada. Mantener un modo demostrativo únicamente explícito y señalizado.

### P0 — definir autoridad real de las carpetas

El servicio actual tiene un sujeto único (cuenta de servicio), no la cuenta Gmail del usuario logueado. Sus permisos Drive no son automáticamente los permisos Kora. Un enlace de carpeta no demuestra que el usuario actual pueda verla. Los endpoints `drive/inventory` y `drive/files` requieren `projects:manage`, pero reciben URL sin `projectId`: se recomienda limitar la consulta al proyecto y a sus fuentes expresamente confirmadas. La consulta de contenido también debe respetar autorización por proyecto en cada llamada.

### P1 — cobertura documental incompleta

`canReadDriveSource` y el lector actual aceptan PDF, Google Docs/Sheets/Slides y texto/CSV/JSON, **no** leen binarios `.docx`, `.xlsx`, `.pptx` sin convertir. Para ERS, matrices y levantamientos puede ser una brecha funcional importante. Google Sheets se exporta a CSV y Slides a PDF; validar hojas múltiples, estructuras/tablas e imágenes relevantes.

### P1 — límites y completitud

`GoogleDriveFolderClient.listByQuery` pide máximo 100 ítems y no implementa paginación `nextPageToken`: algunas carpetas quedarán incompletas. Inventario tope 150 elementos / profundidad configurada; lector IA por defecto recorre hasta 3 niveles y selecciona solo **4 documentos**, máximo 30 000 caracteres de texto por documento y 5 MiB en base64. Debe mostrarse al usuario qué archivos realmente se procesaron y si hubo truncamiento. No descargar PDFs de tamaño desconocido ilimitadamente: verificar límites antes de leer el cuerpo y usar límites de streaming.

### P1 — trazabilidad y seguridad de contenido IA

Evitar extraer archivos de credenciales (`drive-source-selection` ya los excluye por nombre), validar de manera explícita permiso de uso de documentos de clientes en proveedores de IA, aplicar retención mínima y no registrar contenido/tokens. El archivo `apps/api/.env.example` documenta el servicio Drive, pero no incluye las variables OAuth de login; completar documentación sin valores reales.

### P2 — diagnóstico operacional

`google.enabled` y `googleDrive.enabled` son condiciones independientes. La rama **no confirma** cuáles variables están definidas en EC2 de producción, a qué proyecto de Google Cloud pertenece el OAuth Client ID, si Drive API está habilitada, ni qué carpetas están compartidas. Esos puntos requieren revisión del despliegue y consola, sin revelar claves.

## 4. Opciones de integración

### Opción A — usar cuenta de servicio **ya implementada** (recomendación para Drive corporativo)

1. En Google Cloud del proyecto elegido habilitar **Google Drive API**.
2. Crear/identificar cuenta de servicio sin acceso global a Workspace.
3. Compartir con su correo **solo carpetas de proyecto autorizadas** en Drive, con rol lector. No hace falta delegación de dominio si las carpetas se comparten explícitamente.
4. Configurar secretamente en la API `GOOGLE_DRIVE_CLIENT_EMAIL` y `GOOGLE_DRIVE_PRIVATE_KEY`. En EC2, no guardar key en frontend ni en Git; preferir secretos administrados y política de rotación. A futuro evaluar federación de identidades para evitar llaves privadas persistentes.
5. Verificar sobre una carpeta real y autorizada: inventario, al menos un documento leído, `sourceMode=drive`, cantidad de archivos procesados, permisos denegados en carpeta ajena.
6. **No** modificar `GOOGLE_CLIENT_ID`, login ni cookies.

**Ventajas:** arquitectura ya disponible; ejecución backend y programada; la autorización de usuarios de Kora es independiente de pertenecer personalmente a las carpetas de Drive.  
**Límite:** solo ve carpetas compartidas con el servicio; no lee automáticamente «Mi unidad» de cada usuario.

### Opción B — reutilizar el **OAuth Client ID existente** para Drive del usuario

1. Mantener `/api/auth/google` y `/api/auth/google/callback` **exclusivos del login** con `openid email profile`.
2. Agregar flujo **incremental** aparte: `GET /api/integrations/google-drive/connect`, `GET /api/integrations/google-drive/callback`, `GET /api/integrations/google-drive/status` y `DELETE /api/integrations/google-drive`, autenticados por sesión Kora y permisos de estimación.
3. Reutilizar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` del mismo proyecto Google Cloud y registrar **otro Redirect URI** exacto para el callback Drive. Usar `state` impredecible, de un solo uso y vinculado al usuario/sesión, anti-CSRF, protección contra mezcla de cuentas y manejo de errores. Preferir bibliotecas OAuth consolidadas y PKCE si corresponde.
4. Elegir **scope mínimo**:
   - `drive.file` + Google Picker: acceso a archivos que el usuario abre/selecciona para la app. **No es equivalente a poder recorrer arbitrariamente cualquier carpeta pegada por URL.** Validar comportamiento del flujo de carpetas/descendientes seleccionado.
   - `drive.readonly`: permite enumerar y leer archivos del Drive autorizado, pero es **scope restringido**; puede exigir verificación externa y evaluación de seguridad según modalidad y organización.
5. Para lectura posterior sin usuario presente, pedir `access_type=offline` y almacenar **refresh token cifrado en backend**, separado de sesión Kora, con revocación y rotación; sin secretos en navegador, localStorage ni logs. Para lectura solo interactiva, evaluar autorización de corta vida sin persistencia, según experiencia requerida.
6. Crear un proveedor OAuth que cumpla el mismo `DriveFolderClient` o factorizar transporte + estrategia de credenciales. Evitar acoplar el login al lector de documentos.
7. **Prevenir confusión entre usuarios:** comprobar que la cuenta Google autorizante es la esperada para la sesión Kora, vincular token a usuario, autorizar proyecto y fuente documental antes de cada lectura.
8. Actualizar Google Cloud Consent Screen / Data Access y verificar impacto en app externa o interna; no asumir que el cliente OAuth aprobado para login ya cubre `drive.readonly`.

**Ventajas:** la vista del usuario coincide con los archivos a los que tiene acceso y permite selección personal.  
**Costos:** consentimiento, permisos Google, token store seguro, callbacks nuevos y eventual verificación; mayor superficie de seguridad que la opción A.

## 5. Recomendación para el alcance actual de Calculadora

Dado el flujo existente `proyecto -> documentationLink -> resolver/inventario -> documentos -> Gemini`, empezar por **A**, si el repositorio documental corporativo puede compartir las carpetas de proyectos autorizadas. No habilitar una nueva solicitud masiva de Drive durante el login productivo. Solo construir **B** si es requisito funcional que Kora utilice el Drive personal del usuario o recorra carpetas que no pueden compartirse con la cuenta de servicio.

Cualquier opción debe hacer primero **fail-closed de los falsos «connected» PoC**, ligar la fuente autorizada al proyecto y mejorar paginación y soporte de archivos Office antes de declarar el flujo de estimación listo para producción.

## 6. Validaciones seguras (sin solicitar ni imprimir secretos)

**Google Cloud / Infraestructura:**
- Identificar **Project ID** del OAuth Client ID productivo y comprobar estado Drive API.
- Confirmar tipo de cliente OAuth «web», Authorized Redirect URI actual del login, y estado de consentimiento.
- Si opción A: confirmar existencia del correo de cuenta de servicio y carpeta realmente compartida con permiso lector.
- Si opción B: confirmar scopes declarados, necesidad de verificación, callback Drive de DEV/QA/PROD, identidad de usuario y almacenamiento seguro de refresh token.
- En cada entorno confirmar **solo presencia** de variables Drive; **jamás** pegar en chats las claves, JSON de service account, client secret ni token.

**Prueba funcional:**
1. Entrar en Kora como usuario con permiso comercial para el proyecto.
2. Seleccionar un prospecto real en `Nueva estimación`; guardar una carpeta de Drive real y autorizada.
3. Revisar `POST /api/estimations/drive/resolve` y `/drive/inventory`: `connection=connected` con IDs y nombres **reales**, no `kora-poc-fallback`.
4. Ejecutar un análisis de prueba acotado: exigir `sourceMode=drive`, `documentsAnalyzed > 0`, nombres citados y evidencia de la carpeta elegida; si da fallback, **no** está operando con el Drive real.
5. Repetir con carpeta no autorizada, un proyecto ajeno y un archivo excluido: el acceso debe ser rechazado o no revelar contenido.
6. Verificar subcarpetas y carpetas con más de 100 elementos; documentar faltantes por límites actuales.
7. No utilizar documentos sensibles de clientes para el test con Gemini sin autorización y política de tratamiento de datos.

## 7. Fuentes oficiales

- Google OAuth web server / autorización incremental: https://developers.google.com/identity/protocols/oauth2/web-server
- Scopes y clasificación Drive: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Compartir carpeta con cuenta de servicio: https://developers.google.com/workspace/guides/create-credentials
- Google Picker: https://developers.google.com/workspace/drive/picker/guides/web-picker
- Requisitos de verificación de scopes restringidos: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification

**No hay migraciones, DDL, rotación de credenciales, cambios de login ni habilitación de Drive productivo asociados a esta auditoría.**
