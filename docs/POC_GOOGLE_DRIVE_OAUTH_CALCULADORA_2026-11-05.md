# Kora 2.0 — PoC OAuth Google Drive de usuario en Calculadora

**Fecha:** 05/11/2026  
**Rama:** `feature/calculadora-roadmap-diseno-v5-02`  
**Alcance:** prueba de autorización y lectura real en backend, separada de la autenticación de Kora.  
**Estado:** implementada en GitHub; typecheck, tests, build y autorización real contra Google pendientes de ejecutar en entorno Kora.

## 1. Contexto y decisión

El login productivo usa `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` y solo pide `openid email profile`. La Calculadora ya dispone de un lector Google Drive con cuenta de servicio pero sus variables `GOOGLE_DRIVE_CLIENT_EMAIL` y `GOOGLE_DRIVE_PRIVATE_KEY` no aparecen en el archivo `/opt/kora-v2/apps/api/.env` inspeccionado por Infra.

No tenemos acceso administrativo a Google Cloud Console. Para comprobar la factibilidad **sin modificar el login existente**, se creó una PoC que solicita Drive a una cuenta Google elegida por el usuario, aunque su sesión Kora venga de email/password. El backend reutiliza **el URI exacto** `GOOGLE_CALLBACK_URL`, por lo que no exige registrar uno nuevo para esta primera prueba. Google podría bloquearla si Drive API no está habilitada o si la pantalla de consentimiento no permite ese scope.

**Esta PoC no es todavía lectura automática de Drive para estimaciones productivas.** No cambia `GoogleDriveFolderClient`, no persiste ninguna credencial de Drive, no carga archivos a Gemini ni habilita cron/jobs. Es una comprobación explícita de autorización + acceso a la carpeta desde NestJS.

## 2. Endpoints

| Método | Ruta | Autorización |
|---|---|---|
| GET | `/api/estimations/drive/oauth-poc/status` | Sesión y permisos de cotización; devuelve solo `{ enabled }` |
| POST | `/api/estimations/drive/oauth-poc/start` | Sesión Kora + `projects:manage` o `projects:read_assigned`; `authorizeAiPoc(projectId,actor)` además comprueba proyecto |
| GET | `/api/auth/google/callback` (existente) | `@Public`, pero distingue estado de PoC con prefijo, cookie separada y nonce de un solo uso; el camino de login original no cambia |

Body de inicio:

```json
{
  "projectId": "UUID del proyecto Kora",
  "driveFolderUrl": "https://drive.google.com/drive/folders/ID_REAL"
}
```

Retorna solo `authorizationUrl`; además configura cookie `kora_drive_poc_state`, `httpOnly`, `SameSite=Lax`, 5 min. La UI abre una ventana emergente **desde el clic** para sortear bloqueadores y navega allí a Google. Al volver del consentimiento, callback:

1. Valida el prefijo del estado, cookie exacta y nonce conservado temporalmente en memoria del backend.
2. Consume el nonce antes del canje (imposible reutilizarlo).
3. Canjea el código por **access token temporal** con las credenciales OAuth web existentes; **sin** `access_type=offline`.
4. Solicita `https://www.googleapis.com/auth/drive.readonly` (lectura restringida). No pide acceso de escritura. Google verá acceso a archivos del usuario; el backend **solo** consulta la carpeta que eligió.
5. Consulta `GET /drive/v3/files/{folderId}` y `GET /drive/v3/files?q='folderId' in parents...`, primera página de **máximo 20 archivos**.
6. El token solo existe dentro de la función de callback y se descarta. La respuesta comunica código, mensaje y número de archivos de muestra, nunca códigos OAuth, tokens, emails, contenidos ni nombres de archivos.
7. Una página HTML del popup informa el resultado y procura enviar el diagnóstico a Kora mediante `postMessage` con verificación de origen/ventana. Si Google impide la comunicación con la ventana inicial por aislamiento del navegador, el resultado sigue visible en el popup.

## 3. Controles de seguridad

- PoC **apagada por defecto** mediante `GOOGLE_DRIVE_OAUTH_POC_ENABLED=false`.
- El botón «Probar acceso con Google» aparece **solo si** la API declara que la PoC está habilitada.
- Reutiliza la callback Google sin reemplazar ni mezclar cookies `kora_google_state` (login) y `kora_drive_poc_state` (Drive).
- Estado aleatorio de 256 bits, máximo 5 minutos, un solo uso, máximo 100 intentos pendientes por proceso.
- Solo una carpeta real; `kora-poc-fallback` está prohibido en este diagnóstico.
- El usuario debe poder operar la cotización del proyecto; el frontend nunca envía secretos.
- No hay migrations, nuevas tablas, refresh token, logs con credenciales ni cambios de la sesión.
- Limitación intencional: los estados viven en **memoria de un proceso**. Si se reinicia la API o se distribuye entre réplicas sin afinidad, la prueba puede fallar `STATE_EXPIRED`. Producción requerirá store compartido/expiración si se adopta el flujo.
- El scope `drive.readonly` es **restringido**: podría requerir verificación del consentimiento o aprobación por el administrador de Google Workspace; no podemos evitar esos controles usando el Client ID de login.

## 4. Activación y prueba controlada

### A. Validar código **antes** de desplegar

Desde PowerShell, raíz del monorepo:

```powershell
git fetch kora
git switch feature/calculadora-roadmap-diseno-v5-02
git pull --ff-only kora feature/calculadora-roadmap-diseno-v5-02

pnpm --filter @kora/api typecheck
if ($LASTEXITCODE -ne 0) { throw "Falló Typecheck API" }

pnpm --filter @kora/web typecheck
if ($LASTEXITCODE -ne 0) { throw "Falló Typecheck Web" }

pnpm --filter @kora/api exec vitest run src/shared/infrastructure/auth/google-drive-oauth-poc.service.spec.ts src/modules/auth/presentation/auth.controller.drive-poc.spec.ts src/modules/estimation/presentation/estimation.controller.spec.ts
if ($LASTEXITCODE -ne 0) { throw "Fallaron pruebas OAuth/estimación" }

pnpm --filter @kora/api build
if ($LASTEXITCODE -ne 0) { throw "Falló build API" }

pnpm --filter @kora/web build
if ($LASTEXITCODE -ne 0) { throw "Falló build Web" }
```

### B. Despliegue y habilitación (requiere despliegue de backend + frontend)

Solo después de validar y coordinar el despliegue: añadir en el **backend** `GOOGLE_DRIVE_OAUTH_POC_ENABLED=true` y reiniciar el proceso NestJS según el método REAL de ejecución de EC2. No tocar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ni `GOOGLE_CALLBACK_URL`.

Antes de reiniciar, identificar proceso real (systemd, pm2, ejecución gestionada, Docker), hacer backup de la configuración y verificar que el cambio de rama/código coincida en FE y BE. **No** reiniciar servicios de producción a ciegas.

**Indispensable:** usar el host del frontend asociado a la **misma cookie/origin que `GOOGLE_CALLBACK_URL`**. Si el callback del OAuth client apunta a producción, una prueba iniciada en `localhost:5173` no conservará la cookie y dará `STATE_EXPIRED`. Para probar en local/QA con distinto URI, se necesitaría registrar ese redirect URI en Google Cloud.

### C. Recorrido manual

1. Ingresar con **correo y contraseña** a Kora; no es necesario entrar por Google.
2. Ir a `Nueva estimación`, seleccionar un prospecto propio y modo `Propuesta agente IA (PoC)`.
3. Pegar un enlace real de carpeta Drive con al menos 1 archivo y que sea accesible por la cuenta Google elegida.
4. Ver «Diagnóstico de conexión Google Drive (PoC)». Clic `Probar acceso con Google`.
5. Google solicitará el scope `drive.readonly` para la cuenta seleccionada. Leer el consentimiento antes de aprobar.
6. Confirmar que el popup indica `DRIVE_READ_SUCCESS` y el conteo de la primera página (máximo 20). El login original de Kora no debe cambiar.
7. Repetir con carpeta ajena/no compartida; debe resultar en error, no en `connected` simulado.
8. Rechazar consentimiento; debe devolver `GOOGLE_CONSENT_DENIED`.
9. Ejecutar nuevo login Google estándar y comprobar que continúa funcionando con `openid email profile`.

### Diagnósticos relevantes

| Código | Interpretación |
|---|---|
| `DRIVE_READ_SUCCESS` | Google permitió consultar metadata de carpeta y listado inicial |
| `GOOGLE_CONSENT_DENIED` | Usuario denegó o Google rechazó el consentimiento |
| `TOKEN_EXCHANGE_FAILED` | Configuración OAuth/callback/consentimiento bloqueó el canje |
| `DRIVE_SCOPE_MISSING` | Google no concedió el scope de lectura |
| `DRIVE_API_DISABLED_OR_FORBIDDEN` | HTTP 403: API deshabilitada, scope/política o permisos insuficientes |
| `FOLDER_NOT_ACCESSIBLE` | HTTP 404: no existe o el usuario no puede ver carpeta |
| `STATE_EXPIRED` | Cookies/state no coinciden, expiró, proceso reiniciado u otro host |

## 5. Limitaciones y siguiente fase

Para dar lectura Drive **real** y reutilizable a Calculadora tendremos que elegir un modelo de autorización productivo:

- **Acceso por usuario**: almacenar refresh token cifrado y enlazado a usuario/proyecto, revocación, controles de pertenencia, rotación de claves, gestión de Google consent y política de datos. Google podría exigir verificación de `drive.readonly`.
- **Acceso corporativo compartido**: cuenta de servicio con permiso lector a las carpetas, como soporta el lector actual, sin OAuth por cada usuario.

En cualquiera de las dos variantes, actualizar `DOCUMENT_SOURCE_READER` para usar la identidad adecuada **después** de verificar autorización, eliminar el falso `connected` del fallback en producción, implementar paginación y evaluar DOCX/XLSX/PPTX. Nada de eso se declara completado por esta PoC.

## 6. Fuentes oficiales

- OAuth web-server: https://developers.google.com/identity/protocols/oauth2/web-server
- Scopes Drive: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Publicación y verificación de scopes restringidos: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
