# Kora 2.0

Reescritura de Kora sobre Clean Architecture y principios SOLID, con backend
propio, frontend componetizado y una base de datos normalizada que se alimenta
por migración desde la versión actual.

## Requisitos

- **Node.js 22.16** (ver `.nvmrc`; con nvm: `nvm use`)
- **pnpm 11**: `corepack enable` activa la versión fijada en `package.json`
- **PostgreSQL 15 o superior**, con `psql`, `createdb` y `pg_restore` en el PATH

## Puesta en marcha

### 1. Instalar dependencias

```sh
pnpm install
```

### 2. Base de datos

Crea la base y la extensión que usan las migraciones:

```sh
createdb kora2                      # o desde psql: CREATE DATABASE kora2;
psql -d kora2 -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
```

Luego elige **una** de estas dos opciones para cargar los datos.

**Opción A. Restaurar un respaldo de la v2** (la más rápida para desarrollar):

```sh
pg_restore -d kora2 --no-owner --no-privileges kora2.dump
DATABASE_URL=postgres://usuario:clave@localhost:5432/kora2 pnpm db:migrate
```

Pide el respaldo (`pg_dump -Fc -d kora2 -f kora2.dump`) a alguien del equipo.
Contiene datos reales, así que no lo subas al repo ni lo envíes por correo.

**Opción B. Migrar desde la base de la v1** (ver [`docs/MIGRACION.md`](docs/MIGRACION.md)):

```sh
cd packages/db
DATABASE_URL=postgres://usuario:clave@localhost:5432/kora2 pnpm migrate
DATABASE_URL=postgres://usuario:clave@localhost:5432/kora2 pnpm seed

cd ../../tools/etl
cp .env.example .env                # ajusta LEGACY_DATABASE_URL y DATABASE_URL
DRY_RUN=true pnpm users             # ensayo: recorre todo y revierte
pnpm users && pnpm verify           # ejecución real y comprobación
```

Después corre el resto de los módulos en este orden, cada uno con su
verificación: `clients`, `projects`, `hours`, `tickets` y `forecast` (por
ejemplo, `pnpm clients && pnpm verify-clients`).

> En PowerShell, las variables van antes del comando:
> `$env:DATABASE_URL="postgres://..."; pnpm migrate`

### 3. Variables de entorno de la API

```sh
cp apps/api/.env.example apps/api/.env
```

Ajusta en `apps/api/.env`:

| Variable | Qué poner |
|---|---|
| `DATABASE_URL` | Tu usuario y clave de Postgres |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Dos secretos distintos: `openssl rand -base64 48` |
| `MAIL_REDIRECT_TO` | **Tu correo.** Desvía todos los correos a tu buzón para no escribirle a usuarios reales de la base local |
| `RESEND_API_KEY` | Déjala vacía en local: los correos se escriben en el log |
| `HOUR_REMINDERS_ENABLED` | No la actives en local: los recordatorios irían a usuarios reales |
| `GOOGLE_CLIENT_ID` y afines | Opcionales: sin ellas el login con Google queda deshabilitado y se entra con correo y contraseña |

### 4. Levantar

La primera vez compila los paquetes compartidos (`packages/*`) antes de levantar,
porque la API consume su `dist`:

```sh
pnpm build
pnpm dev                            # API en :3000 y front en :5173
```

El front llama a `/api` en su mismo origen y Vite lo reenvía a la API, así que
en desarrollo no hay que configurar CORS.

Credenciales: las mismas de la v1. Las contraseñas se migran tal cual (bcrypt) y
se convierten solas a argon2id en el primer inicio de sesión de cada persona.
Solo pueden entrar correos de los dominios en `ALLOWED_EMAIL_DOMAINS`.

## Estructura

```
apps/
  api/          Backend NestJS + Fastify, Clean Architecture por módulos
  web/          Frontend React + Vite, CSS Modules, componetizado por módulos
packages/
  contracts/    Esquemas Zod y tipos compartidos por front y back
  core/         Núcleo compartido del dominio: Result, errores, entidades, puertos
  db/           Esquema Drizzle, migraciones, siembras y backfills
  config/       tsconfig base compartido
tools/
  etl/          Migración de datos desde la base de la v1, idempotente y verificable
docs/           Arquitectura, migración y decisiones
```

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta API y front en paralelo |
| `pnpm build` | Compila todos los paquetes en orden de dependencias |
| `pnpm test` | Ejecuta los tests de todos los paquetes |
| `pnpm typecheck` | Comprueba tipos sin emitir |
| `pnpm db:generate` | Genera una migración SQL a partir del esquema Drizzle |
| `pnpm db:migrate` | Aplica las migraciones pendientes |
| `pnpm db:studio` | Abre Drizzle Studio para explorar la base |
| `pnpm etl:users` | Migra el módulo de usuario desde la v1 |
| `pnpm etl:verify` | Verifica que la migración de usuarios cuadra |
| `pnpm --filter @kora/db seed:demo` | Siembra un proyecto demo del portal de cliente |

## Estado

| Módulo | Estado |
|---|---|
| Autenticación y sesiones | Implementado (correo y contraseña; Google opcional) |
| Usuarios, roles y permisos | Implementado |
| M1 · Catálogos y Clientes | Implementado |
| M2 · Equipos | Implementado |
| M3 · Proyectos | Implementado. Ver [`docs/DECISION-M3-ESTADOS.md`](docs/DECISION-M3-ESTADOS.md) |
| M4 · Registro de horas | Implementado, con aprobaciones. Ver [`docs/DECISION-M4-HORAS.md`](docs/DECISION-M4-HORAS.md) |
| M5 · Tickets y Soporte | Implementado. Ver [`docs/DECISION-M5-TICKETS.md`](docs/DECISION-M5-TICKETS.md) |
| M6 · Forecast | Implementado. Ver [`docs/DECISION-M6-FORECAST.md`](docs/DECISION-M6-FORECAST.md) |
| M7 · Paneles e informes | Implementado (dashboard). Ver [`docs/DECISION-M7-DASHBOARD.md`](docs/DECISION-M7-DASHBOARD.md) |
| M8 · Notificaciones | Implementado, con recordatorios diarios de horas |
| M9 · Facturación | Implementado, con el rol Finanzas. Ver [`docs/DECISION-FACTURACION-PROYECTOS.md`](docs/DECISION-FACTURACION-PROYECTOS.md) |
| Portal de cliente | Implementado. Ver [`docs/DECISION-PORTAL-CLIENTE.md`](docs/DECISION-PORTAL-CLIENTE.md) |
| Importación de datos v1 | Desde la app, en Administración → Importar datos |

[`docs/PLAN-MODULOS.md`](docs/PLAN-MODULOS.md) tiene el plan original de construcción y las reglas a portar de cada módulo.

## Despliegue

Cada push a `master` despliega en el servidor EC2 (`.github/workflows/deploy.yml`).
El script del servidor trae los cambios, migra, siembra, compila el front con
`--base=/v2/` y reinicia la API. Trabaja en una rama y fusiona a `master` solo
lo que esté listo para producción.

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): capas, dependencias y por qué
- [`docs/MIGRACION.md`](docs/MIGRACION.md): cómo se migra desde la v1 y qué se decidió
- [`docs/DECISIONES.md`](docs/DECISIONES.md): decisiones técnicas y sus motivos
- [`docs/PLAN-MODULOS.md`](docs/PLAN-MODULOS.md): plan de módulos y reglas de negocio
- `docs/DECISION-*.md`: decisiones por módulo (proyectos, horas, tickets, forecast,
  dashboard, facturación, portal de cliente y diseño en Figma)
