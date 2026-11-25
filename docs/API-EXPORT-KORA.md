# API — Export completo de Kora (`GET /api/export/kora`)

Devuelve **toda la información operativa de Kora en un único JSON**, organizada como árbol:

```
cliente
 └─ proyectos
     ├─ responsable (Responsable Kabeli / Líder PM)
     ├─ responsable comercial
     ├─ líderes (uno por equipo asignado)
     ├─ colaboradores (personas asignadas)
     └─ últimas actualizaciones (bitácora)
```

Pensado para integraciones y reportes externos (BI, IA, planillas): trae todo de una vez, sin paginar.

---

## Resumen

| | |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/api/export/kora` |
| **URL producción** | `https://kora.kabeli.cl/api/export/kora` |
| **URL local** | `http://localhost:3000/api/export/kora` |
| **Autenticación** | API key en el header `X-Api-Key` (ver [Seguridad](#seguridad)) |
| **Respuesta** | `200 OK` · `application/json` |
| **Solo lectura** | Sí, no modifica nada |

---

## Parámetros (query string)

| Parámetro | Tipo | Obligatorio | Default | Rango | Descripción |
|---|---|---|---|---|---|
| `updatesLimit` | entero | No | `5` | `0` – `50` | Cuántas entradas de bitácora traer **por proyecto**, las más recientes primero. Con `0` no se consultan. |

Ejemplos:

```
GET /api/export/kora
GET /api/export/kora?updatesLimit=20
GET /api/export/kora?updatesLimit=0
```

---

## Ejemplo de uso

```bash
curl --location 'https://kora.kabeli.cl/api/export/kora?updatesLimit=5' \
  --header 'X-Api-Key: TU_API_KEY'
```

Guardar a archivo:

```bash
curl -s 'https://kora.kabeli.cl/api/export/kora?updatesLimit=5' \
  -H 'X-Api-Key: TU_API_KEY' \
  -o kora-export.json
```

En Postman: **Import → Raw text** y pegar el primer `curl`, o agregar a mano el header `X-Api-Key`.

---

## Respuesta

### Estructura general

```jsonc
{
  "generatedAt": "2026-11-19T15:20:11.482Z",   // cuándo se generó el JSON (ISO 8601, UTC)
  "updatesLimit": 5,                            // límite aplicado a latestUpdates
  "totals": {
    "clients": 49,                              // clientes incluidos
    "projects": 132                             // proyectos incluidos (con y sin cliente)
  },
  "clients": [ /* Cliente[] */ ],
  "projectsWithoutClient": [ /* Proyecto[] */ ]
}
```

### Ejemplo completo (abreviado)

```json
{
  "generatedAt": "2026-11-19T15:20:11.482Z",
  "updatesLimit": 5,
  "totals": { "clients": 1, "projects": 1 },
  "clients": [
    {
      "id": "6f1c…",
      "companyName": "Acme",
      "legalName": "Acme SpA",
      "taxId": "76.123.456-7",
      "slug": "acme",
      "status": "active",
      "website": "https://acme.cl",
      "commercialManager": { "id": "a1…", "fullName": "Ana Pérez", "email": "ana@kabeli.cl" },
      "projects": [
        {
          "id": "9b2e…",
          "name": "Portal de proveedores",
          "slug": "portal-de-proveedores",
          "type": "development",
          "status": "active",
          "phase": "development",
          "salesStage": "approved",
          "priority": "high",
          "isInternal": false,
          "startDate": "2026-08-01",
          "endDate": null,
          "estimatedDeliveryDate": "2026-12-15",
          "soldHours": 480,
          "usedHours": 312.5,
          "expectedProgress": 70,
          "actualProgress": 62,
          "responsible": { "id": "b2…", "fullName": "Juan Soto", "email": "juan@kabeli.cl" },
          "commercialManager": { "id": "a1…", "fullName": "Ana Pérez", "email": "ana@kabeli.cl" },
          "leaders": [
            {
              "teamId": "t1…",
              "teamName": "Desarrollo",
              "leader": { "id": "c3…", "fullName": "María Rojas", "email": "maria@kabeli.cl" },
              "assignedHours": 300
            }
          ],
          "collaborators": [
            {
              "id": "d4…",
              "fullName": "Pedro Díaz",
              "email": "pedro@kabeli.cl",
              "teamId": "t1…",
              "teamName": "Desarrollo",
              "position": "Desarrollador Full Stack",
              "activity": "Backend",
              "assignedHours": 160,
              "consumedHours": 98,
              "blocked": false
            }
          ],
          "latestUpdates": [
            {
              "id": "o1…",
              "type": "hito",
              "title": "Entrega módulo de login",
              "message": "Se entregó el módulo de login al cliente para revisión.",
              "status": "cumplido",
              "moduleName": "Fase 1",
              "date": "2026-11-15",
              "createdAt": "2026-11-15T18:02:44.120Z",
              "author": { "id": "b2…", "fullName": "Juan Soto", "email": "juan@kabeli.cl" }
            }
          ],
          "createdAt": "2026-07-20T13:00:00.000Z",
          "updatedAt": "2026-11-15T18:02:44.120Z"
        }
      ]
    }
  ],
  "projectsWithoutClient": []
}
```

---

## Diccionario de campos

### Persona (`Person`)

Se repite en `commercialManager`, `responsible`, `leaders[].leader`, `latestUpdates[].author`. Vale `null` si no hay persona asignada o si el usuario no existe.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | ID del usuario en Kora |
| `fullName` | string | Nombre y apellido |
| `email` | string | Correo |

### Cliente (`clients[]`)

Ordenados alfabéticamente por `companyName`. Incluye clientes activos e inactivos; **no** incluye eliminados.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | ID del cliente |
| `companyName` | string | Nombre comercial |
| `legalName` | string | Razón social |
| `taxId` | string | RUT / identificador tributario |
| `slug` | string | Identificador amigable usado en las URLs del front |
| `status` | `active` \| `inactive` | Estado del cliente |
| `website` | string \| null | Sitio web |
| `commercialManager` | Person \| null | Responsable comercial del cliente |
| `projects` | Proyecto[] | Proyectos del cliente, ordenados por nombre |

### Proyecto (`clients[].projects[]` y `projectsWithoutClient[]`)

No incluye proyectos eliminados.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | ID del proyecto |
| `name` | string | Nombre |
| `slug` | string | Identificador amigable para URLs |
| `type` | `development` \| `support` | Desarrollo o soporte |
| `status` | `draft` \| `active` \| `on_hold` \| `finished` \| `cancelled` | Estado operativo |
| `phase` | `discovery` \| `development` \| `testing` \| `pilot` \| `closed` \| null | Fase del proyecto |
| `salesStage` | `prospect` \| `quoted` \| `approved` \| null | Etapa comercial |
| `priority` | `low` \| `medium` \| `high` \| null | Prioridad |
| `isInternal` | boolean | Proyecto interno de Kabeli (no se cobra) |
| `startDate` | `YYYY-MM-DD` \| null | Fecha de inicio |
| `endDate` | `YYYY-MM-DD` \| null | Fecha de término |
| `estimatedDeliveryDate` | `YYYY-MM-DD` \| null | Fecha estimada de entrega |
| `soldHours` | number | Horas vendidas |
| `usedHours` | number | Horas consumidas |
| `expectedProgress` | entero 0–100 \| null | % de avance esperado |
| `actualProgress` | entero 0–100 \| null | % de avance real |
| `responsible` | Person \| null | **Responsable Kabeli** (Líder PM del proyecto) |
| `commercialManager` | Person \| null | Responsable comercial del proyecto |
| `leaders` | Líder[] | Equipos asignados y su líder |
| `collaborators` | Colaborador[] | Personas asignadas al proyecto |
| `latestUpdates` | Actualización[] | Últimas entradas de la bitácora |
| `createdAt` | ISO 8601 | Creación del registro |
| `updatedAt` | ISO 8601 | Última modificación del registro |

### Líder (`leaders[]`)

Uno por cada equipo asignado al proyecto. Ordenados por nombre de equipo.

| Campo | Tipo | Descripción |
|---|---|---|
| `teamId` | uuid | ID del equipo |
| `teamName` | string | Nombre del equipo |
| `leader` | Person \| null | Líder del equipo en este proyecto (`null` si no se definió) |
| `assignedHours` | number \| null | Horas asignadas al equipo en el proyecto |

### Colaborador (`collaborators[]`)

Personas asignadas a trabajar en el proyecto dentro de un equipo. Ordenados por nombre. Incluye los campos de **Persona** (`id`, `fullName`, `email`) más:

| Campo | Tipo | Descripción |
|---|---|---|
| `teamId` | uuid | Equipo por el que participa |
| `teamName` | string | Nombre del equipo |
| `position` | string \| null | Cargo dentro del equipo (no es el rol de acceso al sistema) |
| `activity` | string \| null | Actividad asignada en el proyecto |
| `assignedHours` | number | Horas asignadas |
| `consumedHours` | number | Horas consumidas |
| `blocked` | boolean | Si la asignación está bloqueada |

> Una misma persona puede aparecer más de una vez si participa por dos equipos distintos.

### Actualización (`latestUpdates[]`)

Entradas de la **bitácora** del proyecto, de la más reciente a la más antigua (por `date` y luego `createdAt`), recortadas a `updatesLimit`.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | ID de la entrada |
| `type` | ver tabla abajo | Tipo de registro |
| `title` | string \| null | Título corto (opcional) |
| `message` | string | Texto de la entrada |
| `status` | ver tabla abajo \| null | Estado (null para tipos sin ciclo de vida) |
| `moduleName` | string \| null | Módulo/fase del proyecto al que se asocia |
| `date` | `YYYY-MM-DD` | Fecha del hecho |
| `createdAt` | ISO 8601 | Cuándo se registró en Kora |
| `author` | Person \| null | Quién la registró |

Valores de `type`:

| Valor | Significado |
|---|---|
| `hito` | Hito del proyecto |
| `incidente` | Incidente |
| `compromiso` | Compromiso |
| `atencion` | Atención |
| `observacion` | Observación / nota |
| `cambio_proyecto` | Cambio registrado automáticamente (asignaciones, tareas/entregas terminadas, aprobadas, etc.) |

Valores de `status`: `abierto`, `resuelto`, `pendiente`, `cumplido`, `activo`, `rechazado`, o `null`.

### `projectsWithoutClient[]`

Proyectos que no cuelgan de ningún cliente: sin cliente asignado, o cuyo cliente fue eliminado. Misma forma que **Proyecto**.

---

## Qué **no** incluye

- Clientes y proyectos eliminados.
- Contactos del cliente.
- Horas registradas (`hour_entries`) — los "eventos" que la bitácora muestra en pantalla no vienen en `latestUpdates`.
- Tickets, contratos de soporte, facturación, módulos/tareas del roadmap.

---

## Errores

| Código HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | `updatesLimit` no es entero o está fuera de `0–50` (detalle en `details.issues.updatesLimit`) |
| `401` | `EXPORT_MISSING_API_KEY` | No se envió el header `X-Api-Key` |
| `401` | `EXPORT_INVALID_API_KEY` | La API key no coincide |
| `403` | `EXPORT_DISABLED` | El servidor no tiene `EXPORT_API_KEY` configurada (endpoint cerrado) |
| `500` | error interno | Falla de base de datos u otra excepción |

Formato de error (igual que el resto de la API):

```json
{
  "code": "…",
  "kind": "…",
  "message": "…",
  "requestId": "fe8f6976-c361-47a6-bf4a-5fdad580e039"
}
```

---

## Seguridad

El endpoint no usa sesión de usuario: se protege con una **API key fija** enviada en el header `X-Api-Key`, pensada para integraciones máquina a máquina.

- La clave se configura en el servidor con la variable `EXPORT_API_KEY` (mínimo 32 caracteres) en `apps/api/.env`.
- Si la variable no está configurada, el endpoint queda **cerrado** (`403 EXPORT_DISABLED`), nunca abierto.
- La comparación es de tiempo constante (hash SHA-256 + `timingSafeEqual`).
- **Rotar la clave:** generar una nueva, reemplazar `EXPORT_API_KEY` en el servidor, reiniciar la API y avisar a los consumidores. La anterior deja de funcionar en el acto.

```bash
node -e "console.log('kora_exp_' + require('crypto').randomBytes(32).toString('base64url'))"
```

> La API key da acceso a datos de todos los clientes: no se comparte fuera del equipo ni se sube al repositorio.

---

## Rendimiento

- Se resuelve en **6 consultas en paralelo**, sin importar cuántos proyectos haya (no hay N+1).
- Las últimas actualizaciones por proyecto se obtienen en una sola consulta con `row_number()` particionado por proyecto.
- Sin paginación: el tamaño de la respuesta crece con la cantidad de proyectos y con `updatesLimit`.

---

## Implementación

| Capa | Archivo |
|---|---|
| Contrato (tipos y validación) | [`packages/contracts/src/export/kora-export.contract.ts`](../packages/contracts/src/export/kora-export.contract.ts) |
| Controlador | [`apps/api/src/modules/export/presentation/export.controller.ts`](../apps/api/src/modules/export/presentation/export.controller.ts) |
| Guard de API key | [`apps/api/src/modules/export/presentation/export-api-key.guard.ts`](../apps/api/src/modules/export/presentation/export-api-key.guard.ts) |
| Caso de uso (arma el árbol) | [`apps/api/src/modules/export/application/use-cases/get-kora-export.use-case.ts`](../apps/api/src/modules/export/application/use-cases/get-kora-export.use-case.ts) |
| Puerto | [`apps/api/src/modules/export/application/ports/kora-export-reader.port.ts`](../apps/api/src/modules/export/application/ports/kora-export-reader.port.ts) |
| Lector Drizzle (consultas) | [`apps/api/src/modules/export/infrastructure/drizzle-kora-export.reader.ts`](../apps/api/src/modules/export/infrastructure/drizzle-kora-export.reader.ts) |
| Módulo Nest | [`apps/api/src/modules/export/export.module.ts`](../apps/api/src/modules/export/export.module.ts) |

Origen de cada dato en la base:

| Campo | Tabla / columna |
|---|---|
| `clients[]` | `clients` (`deleted_at is null`) |
| `projects[]` | `projects` (`deleted_at is null`) |
| `responsible` | `projects.leader_user_id` → `users` |
| `commercialManager` (proyecto) | `projects.commercial_manager_user_id` → `users` |
| `commercialManager` (cliente) | `clients.commercial_manager_user_id` → `users` |
| `leaders[]` | `project_teams` + `teams` + `project_teams.leader_user_id` → `users` |
| `collaborators[]` | `project_team_members` → `team_members` → `users`, + `teams` |
| `latestUpdates[]` | `project_observations` + `project_modules` (nombre del módulo) |
