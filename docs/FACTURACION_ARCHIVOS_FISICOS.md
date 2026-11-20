# Kora — archivos físicos de facturas y comprobantes

## Decisión y compatibilidad

Antes del ajuste, `support_invoice_attachments.content`,
`project_invoice_attachments.content` y `project_payment_receipts.content`
contenían el archivo completo en **base64 dentro de PostgreSQL**.

Desde este cambio, las **nuevas cargas** se escriben como archivos privados en el
servidor de la API y en las mismas columnas de la BD se guarda únicamente una
referencia `kora-file:v1:<tipo>/<uuid>.<ext>`. Los registros históricos quedan
exactamente como estaban y la descarga detecta ambos formatos:

- base64 histórico -> bytes originales desde PostgreSQL;
- `kora-file:v1:...` -> bytes desde el directorio privado.

No se cambian URLs, permisos, restricciones de tamaño, formato ni contratos HTTP;
las rutas de descarga siguen exigiendo `billing:read`. No se requiere migración.
No se intenta migrar automáticamente material histórico que ya funciona.

**Nunca** poner el directorio bajo una ruta web pública, servirlo con Nginx,
sincronizarlo con Git o exponerlo como estático.

## Verificar la ubicación EXISTENTE en EC2 antes de desplegar

La ubicación de carpetas no versionadas de la instancia **no puede deducirse**
del repositorio. `/opt/kora-v2/deploy.sh` vive solo en el servidor, así que
deben verificarse sus montajes reales, sin modificarlos a ciegas:

```bash
cd /opt/kora-v2
find /opt/kora-v2/apps/api -maxdepth 4 -type d \
  \( -iname '*upload*' -o -iname '*factur*' -o -iname '*invoice*' \) -print
docker inspect kora-v2-api --format '{{json .Mounts}}'
docker inspect kora-v2-api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep '^INVOICE_STORAGE_DIR=' || true
grep -nE 'docker run|docker create|--volume|-v |--mount|env-file' /opt/kora-v2/deploy.sh
```

Si ya existe un directorio **persistente del HOST**, reutilizarlo. Si no existe,
una opción es crear `/opt/kora-v2/apps/api/uploads/invoices` y montarlo en
`/var/kora/invoices` del contenedor:

```bash
sudo install -d -m 700 /opt/kora-v2/apps/api/uploads/invoices
# El usuario/grupo del proceso dentro de Docker debe tener permiso de escritura.
# Revisar con: docker exec kora-v2-api id
```

Al crear/recrear el contenedor se debe incluir el volumen **en deploy.sh**
(no solo en un `docker run` manual):

```bash
--mount type=bind,source=/opt/kora-v2/apps/api/uploads/invoices,target=/var/kora/invoices
```

Añadir en `/opt/kora-v2/apps/api/.env` (no en Git):

```dotenv
INVOICE_STORAGE_DIR=/var/kora/invoices
```

`deploy.sh` debe pasar esa variable al contenedor (por ejemplo con
`--env-file`); no basta con editar el `.env` si el contenedor no recibe la
variable. **No desplegar escrituras de facturas hasta confirmar que el volumen
está montado y se conserva al recrear el contenedor.** La API rechaza nuevas
cargas en producción si falta la ruta absoluta.

## Validación tras integración

1. Verificar que el `INVOICE_STORAGE_DIR` visible desde Docker coincide con
   el directorio montado, y que el proceso tiene permisos de lectura/escritura.
2. Cargar una **nueva factura PDF de prueba** en Soporte y otra en Proyectos.
   Comprobar que existen archivos `.pdf` físicos bajo el directorio host.
3. Abrir ambas facturas desde Kora (con permisos). El contenido debe coincidir.
4. Descargar una factura cargada **antes del cambio**. Debe seguir funcionando
   sin convertir ni reescribir su fila histórica.
5. Probar un comprobante JPG/PNG/PDF y repetir las verificaciones.
6. Recrear el contenedor mediante el script de despliegue y volver a abrir las
   facturas nuevas y las históricas.
7. Hacer copia de seguridad tanto de PostgreSQL como del directorio de archivos.
   **Un respaldo de PostgreSQL por sí solo ya no incluye los documentos nuevos.**

Ejemplo de inspección no destructiva en PostgreSQL:

```sql
SELECT
  COUNT(*) FILTER (WHERE content LIKE 'kora-file:v1:%') AS nuevos_en_disco,
  COUNT(*) FILTER (WHERE content NOT LIKE 'kora-file:v1:%') AS historicos_en_bd
FROM project_invoice_attachments;

SELECT
  COUNT(*) FILTER (WHERE content LIKE 'kora-file:v1:%') AS nuevos_en_disco,
  COUNT(*) FILTER (WHERE content NOT LIKE 'kora-file:v1:%') AS historicos_en_bd
FROM support_invoice_attachments;

SELECT
  COUNT(*) FILTER (WHERE content LIKE 'kora-file:v1:%') AS nuevos_en_disco,
  COUNT(*) FILTER (WHERE content NOT LIKE 'kora-file:v1:%') AS historicos_en_bd
FROM project_payment_receipts;
```

## Consideración operativa

Se conservan archivos físicos si una operación comercial elimina o desvincula
su registro; nunca se borran automáticamente archivos históricos. Ante un
rollback externo a la escritura, puede quedar un archivo físico huérfano,
pero **nunca se confirma una referencia a un archivo cuya escritura falló**.
La eventual depuración de huérfanos debe ser una tarea administrativa auditada
que compruebe primero las referencias vigentes en la BD; no borrar directorios
por antigüedad sin esa conciliación.
