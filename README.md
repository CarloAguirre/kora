# Kora 2.0

Reescritura de Kora sobre Clean Architecture y principios SOLID, con backend
propio, frontend componetizado y una base de datos normalizada que se alimenta
por migración desde la versión actual.

## Puesta en marcha

```sh
pnpm install

# 1. Base de datos v2
createdb kora2                      # o desde psql: CREATE DATABASE kora2;
psql -d kora2 -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'

cd packages/db
DATABASE_URL=postgres://usuario:clave@localhost:5432/kora2 pnpm migrate
DATABASE_URL=postgres://usuario:clave@localhost:5432/kora2 pnpm seed

# 2. Migración de datos desde la v1 (ver docs/MIGRACION.md)
cd ../../tools/etl
cp .env.example .env                # ajusta las dos cadenas de conexión
DRY_RUN=true pnpm users             # ensayo: recorre todo y revierte
pnpm users                          # ejecución real
pnpm verify                         # comprueba que origen y destino cuadran

# 3. Aplicaciones
cd ../../apps/api && cp .env.example .env   # ajusta secretos y DATABASE_URL
cd ../..
pnpm dev                            # API en :3000 y front en :5173
```

Credenciales de prueba tras la migración: las mismas de la v1. Las contraseñas
se migran tal cual (bcrypt) y se convierten solas a argon2id en el primer
inicio de sesión de cada persona.

## Estructura

```
apps/
  api/          Backend NestJS + Fastify, Clean Architecture por módulos
  web/          Frontend React + Vite, CSS Modules, componetizado por módulos
packages/
  contracts/    Esquemas Zod y tipos compartidos por front y back
  core/         Núcleo compartido del dominio: Result, errores, entidades, puertos
  db/           Esquema Drizzle, migraciones y siembra del catálogo de acceso
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
| `pnpm etl:users` | Migra el módulo de usuario desde la v1 |
| `pnpm etl:verify` | Verifica que la migración cuadra |

## Estado

| Módulo | Estado |
|---|---|
| Autenticación y sesiones | Completo |
| Usuarios, roles y permisos | Completo |
| **M1 · Catálogos y Clientes** | **Completo** |
| M2 · Equipos | Datos migrados; falta su módulo de gestión |
| M3 · Proyectos | Pendiente — ver decisión bloqueante en `docs/PLAN-MODULOS.md` |
| M4 · Registro de horas | Pendiente |
| M5 · Tickets y Soporte | Pendiente |
| M6 · Forecast | Pendiente |
| M7 · Paneles e informes | Pendiente |
| M8 · Notificaciones | Pendiente |
| M9 · Facturación | Candidato a no migrar (código muerto en la v1) |

Ver [`docs/PLAN-MODULOS.md`](docs/PLAN-MODULOS.md) para el orden de construcción completo y las decisiones pendientes.

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — capas, dependencias y por qué
- [`docs/MIGRACION.md`](docs/MIGRACION.md) — cómo se migra desde la v1 y qué se decidió
- [`docs/DECISIONES.md`](docs/DECISIONES.md) — decisiones técnicas y sus motivos
